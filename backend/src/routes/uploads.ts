import { Router } from "express";
import { randomUUID } from "crypto";
import { Product } from "../models";
import { AuthRequest, authenticate, requireVendor } from "../middleware/auth";
import { createPresignedUploadUrl, deleteStoredObject, getUploadedObjectInfo } from "../utils/objectStorage";
import {
  createUploadSession,
  deleteUploadSession,
  getUploadSession,
  updateUploadSession,
  UPLOAD_SESSION_TTL_SECONDS,
  type UploadSession,
} from "../utils/uploadSessions";
import { presignedUploadSchema, uploadConfirmationSchema } from "../validators/uploads";

const uploadsRouter = Router();

uploadsRouter.post("/uploads/presigned-url", authenticate, requireVendor, async (req: AuthRequest, res) => {
  const validation = presignedUploadSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ message: "Invalid parameters" });

  try {
    let session: UploadSession;
    if ("upload_id" in validation.data) {
      const existingSession = await getUploadSession(validation.data.upload_id);
      if (!existingSession || existingSession.user_id !== req.user!.id || existingSession.vendor_id !== req.vendor!.id) {
        return res.status(404).json({ message: "Upload session not found" });
      }
      session = existingSession;
      if (session.status !== "issued") return res.status(409).json({ message: "Upload session cannot be renewed" });
      if (Date.parse(session.expires_at) <= Date.now()) {
        await deleteUploadSession(session.id);
        return res.status(410).json({ message: "Upload session expired" });
      }
    } else {
      const { purpose, content_type } = validation.data;
      let productId: string | undefined;
      if (purpose === "product") {
        if (req.vendor!.kyc_status !== "verified") {
          return res.status(403).json({ message: "Vendor must be verified to upload product images" });
        }
        const product = await Product.findOne({
          _id: validation.data.product_id,
          vendor_id: req.vendor!.id,
          status: { $ne: "archived" },
        }).select("_id");
        if (!product) return res.status(404).json({ message: "Product not found" });
        productId = product.id;
      }

      const extension = content_type === "image/jpeg" ? "jpg" : content_type.split("/")[1];
      const objectPrefix = purpose === "kyc" ? `kyc/${req.vendor!.id}/` : `products/${req.vendor!.id}/`;
      session = {
        id: randomUUID(),
        user_id: req.user!.id,
        vendor_id: req.vendor!.id,
        purpose,
        ...(productId ? { product_id: productId } : {}),
        object_key: `${objectPrefix}${randomUUID()}.${extension}`,
        content_type,
        status: "issued" as const,
        url_expires_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + UPLOAD_SESSION_TTL_SECONDS * 1000).toISOString(),
      };
    }

    const remainingSeconds = Math.max(1, Math.floor((Date.parse(session.expires_at) - Date.now()) / 1000));
    const expiresIn = Math.min(600, remainingSeconds);
    session.url_expires_at = new Date(Date.now() + expiresIn * 1000).toISOString();
    const uploadUrl = await createPresignedUploadUrl({ key: session.object_key, contentType: session.content_type, expiresIn });
    await createUploadSession(session);
    return res.json({
      upload_id: session.id,
      upload_url: uploadUrl,
      object_key: session.object_key,
      expires_in: expiresIn,
      session_expires_at: session.expires_at,
    });
  } catch (error) {
    console.error("Create upload URL error:", error);
    return res.status(500).json({ message: "Failed to create upload URL" });
  }
});

uploadsRouter.post("/uploads/confirm", authenticate, requireVendor, async (req: AuthRequest, res) => {
  const validation = uploadConfirmationSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ message: "Invalid parameters" });

  try {
    const session = await getUploadSession(validation.data.upload_id);
    if (!session || session.user_id !== req.user!.id || session.vendor_id !== req.vendor!.id) {
      return res.status(404).json({ message: "Upload session not found" });
    }
    if (Date.parse(session.expires_at) <= Date.now()) {
      await deleteUploadSession(session.id);
      return res.status(410).json({ message: "Upload session expired" });
    }
    if (session.status === "confirmed") {
      return res.json({ upload_id: session.id, object_key: session.object_key, status: session.status });
    }

    if (session.purpose === "product") {
      if (req.vendor!.kyc_status !== "verified") {
        return res.status(403).json({ message: "Vendor must be verified to confirm product images" });
      }
      const product = await Product.findOne({
        _id: session.product_id,
        vendor_id: req.vendor!.id,
        status: { $ne: "archived" },
      }).select("_id");
      if (!product) return res.status(404).json({ message: "Product not found" });
    }

    const objectInfo = await getUploadedObjectInfo(session.object_key);
    if (objectInfo.contentType !== session.content_type || !objectInfo.contentLength || objectInfo.contentLength > 10 * 1024 * 1024) {
      await deleteStoredObject(session.object_key);
      return res.status(400).json({ message: "Uploaded file does not match the requested upload" });
    }
    session.status = "confirmed";
    await updateUploadSession(session);
    return res.json({ upload_id: session.id, object_key: session.object_key, status: session.status });
  } catch (error) {
    if (typeof error === "object" && error !== null && "$metadata" in error &&
      typeof error.$metadata === "object" && error.$metadata !== null && "httpStatusCode" in error.$metadata &&
      error.$metadata.httpStatusCode === 404) {
      return res.status(409).json({ message: "Upload has not completed" });
    }
    console.error("Confirm upload error:", error);
    return res.status(500).json({ message: "Failed to confirm upload" });
  }
});

uploadsRouter.delete("/uploads/:uuid", authenticate, requireVendor, async (req: AuthRequest, res) => {
  const uploadId = req.params.uuid;
  if (typeof uploadId !== "string" || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(uploadId)) {
    return res.status(400).json({ message: "Invalid upload id" });
  }
  try {
    const session = await getUploadSession(uploadId);
    if (!session || session.user_id !== req.user!.id || session.vendor_id !== req.vendor!.id) {
      return res.status(404).json({ message: "Upload session not found" });
    }
    if (session.status !== "issued") {
      return res.status(409).json({ message: "Only unconfirmed uploads can be deleted" });
    }
    if (Date.parse(session.url_expires_at) > Date.now()) {
      return res.status(409).json({ message: "Wait for the upload URL to expire before deleting this session" });
    }
    await deleteStoredObject(session.object_key);
    await deleteUploadSession(session.id);
    return res.status(204).send();
  } catch (error) {
    console.error("Delete upload session error:", error);
    return res.status(500).json({ message: "Failed to delete upload" });
  }
});

export default uploadsRouter;
