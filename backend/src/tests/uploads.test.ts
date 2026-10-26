import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "dotenv";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import Product, { IProduct } from "../models/Product.js";
import User, { IUser } from "../models/User.js";
import Vendor, { IVendor } from "../models/Vendor.js";
import uploadsRouter from "../routes/uploads.js";

const {
  createPresignedUploadUrlMock,
  getUploadedObjectInfoMock,
  deleteStoredObjectMock,
  createUploadSessionMock,
  getUploadSessionMock,
  updateUploadSessionMock,
  deleteUploadSessionMock,
} = vi.hoisted(() => {
  const sessions = new Map<string, Record<string, unknown>>();
  return {
    createPresignedUploadUrlMock: vi.fn(async ({ key }: { key: string }) => `https://upload.test/${encodeURIComponent(key)}?signature=test`),
    getUploadedObjectInfoMock: vi.fn(async () => ({ contentType: "image/png", contentLength: 1024 })),
    deleteStoredObjectMock: vi.fn(async () => undefined),
    createUploadSessionMock: vi.fn(async (session: { id: string }) => { sessions.set(session.id, { ...session }); }),
    getUploadSessionMock: vi.fn(async (id: string) => {
      const session = sessions.get(id);
      return session ? { ...session } : null;
    }),
    updateUploadSessionMock: vi.fn(async (session: { id: string }) => {
      sessions.set(session.id, { ...(sessions.get(session.id) ?? {}), ...session });
    }),
    deleteUploadSessionMock: vi.fn(async (id: string) => { sessions.delete(id); }),
  };
});

vi.mock("../utils/objectStorage.js", () => ({
  createPresignedUploadUrl: createPresignedUploadUrlMock,
  getUploadedObjectInfo: getUploadedObjectInfoMock,
  deleteStoredObject: deleteStoredObjectMock,
}));
vi.mock("../utils/uploadSessions.js", () => ({
  createUploadSession: createUploadSessionMock,
  getUploadSession: getUploadSessionMock,
  updateUploadSession: updateUploadSessionMock,
  deleteUploadSession: deleteUploadSessionMock,
  UPLOAD_SESSION_TTL_SECONDS: 7200,
}));

config();

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const TEST_EMAILS = ["uploads-route-verified@test.com", "uploads-route-pending@test.com", "uploads-route-customer@test.com"];

describe("POST /uploads/presigned-url", () => {
  let verifiedVendorUser: IUser;
  let pendingVendorUser: IUser;
  let customer: IUser;
  let verifiedVendor: IVendor;
  let pendingVendor: IVendor;
  let verifiedProduct: IProduct;
  let archivedProduct: IProduct;
  let pendingProduct: IProduct;
  let verifiedVendorToken: string;
  let pendingVendorToken: string;
  let customerToken: string;
  let server: Server;
  let baseUrl: string;

  const tokenFor = (user: IUser) => jwt.sign(
    { id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "7d" }
  );

  const createPresignedUrlRequest = (body: unknown, token?: string) => fetch(`${baseUrl}/uploads/presigned-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/marketly");
    const oldUsers = await User.find({ email: { $in: TEST_EMAILS } }).select("_id");
    const oldVendors = await Vendor.find({ user_id: { $in: oldUsers.map((user) => user.id) } }).select("_id");
    await Product.deleteMany({ vendor_id: { $in: oldVendors.map((vendor) => vendor.id) } });
    await Vendor.deleteMany({ user_id: { $in: oldUsers.map((user) => user.id) } });
    await User.deleteMany({ email: { $in: TEST_EMAILS } });

    const users = await User.create([
      { name: "Verified Upload Vendor", email: TEST_EMAILS[0], password_hash: "not-used", role: "vendor", status: "active" },
      { name: "Pending Upload Vendor", email: TEST_EMAILS[1], password_hash: "not-used", role: "vendor", status: "active" },
      { name: "Upload Customer", email: TEST_EMAILS[2], password_hash: "not-used", role: "customer", status: "active" },
    ]);
    const createdVerifiedVendorUser = users[0];
    const createdPendingVendorUser = users[1];
    const createdCustomer = users[2];
    if (!createdVerifiedVendorUser || !createdPendingVendorUser || !createdCustomer) {
      throw new Error("Failed to create upload route test users");
    }
    verifiedVendorUser = createdVerifiedVendorUser;
    pendingVendorUser = createdPendingVendorUser;
    customer = createdCustomer;
    verifiedVendor = await Vendor.create({
      user_id: verifiedVendorUser.id, name: "Verified Upload Shop", display_name: "Verified Upload Store",
      address: "1 Upload St", postal_code: "12345", kyc_status: "verified", commission_rate_bps: 0,
    });
    pendingVendor = await Vendor.create({
      user_id: pendingVendorUser.id, name: "Pending Upload Shop", display_name: "Pending Upload Store",
      address: "2 Upload St", postal_code: "54321", kyc_status: "pending", commission_rate_bps: 0,
    });
    const products = await Product.create([
      {
        vendor_id: verifiedVendor.id, category_id: new mongoose.Types.ObjectId().toString(), name: "Vendor Product",
        description: "Active product", sku: `UPLOAD-${new mongoose.Types.ObjectId()}`, price: 10, stock: 1, status: "active",
      },
      {
        vendor_id: verifiedVendor.id, category_id: new mongoose.Types.ObjectId().toString(), name: "Archived Vendor Product",
        description: "Archived product", sku: `UPLOAD-${new mongoose.Types.ObjectId()}`, price: 10, stock: 0, status: "archived",
      },
      {
        vendor_id: pendingVendor.id, category_id: new mongoose.Types.ObjectId().toString(), name: "Pending Vendor Product",
        description: "Pending product", sku: `UPLOAD-${new mongoose.Types.ObjectId()}`, price: 10, stock: 1, status: "draft",
      },
    ]);
    const firstProduct = products[0];
    const secondProduct = products[1];
    const thirdProduct = products[2];
    if (!firstProduct || !secondProduct || !thirdProduct) throw new Error("Failed to create upload route test products");
    verifiedProduct = firstProduct;
    archivedProduct = secondProduct;
    pendingProduct = thirdProduct;
    verifiedVendorToken = tokenFor(verifiedVendorUser);
    pendingVendorToken = tokenFor(pendingVendorUser);
    customerToken = tokenFor(customer);

    const app = express();
    app.use(express.json());
    app.use("/api/v1", uploadsRouter);
    server = app.listen(0);
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  });

  beforeEach(() => {
    createPresignedUploadUrlMock.mockClear();
    getUploadedObjectInfoMock.mockClear();
    deleteStoredObjectMock.mockClear();
    createUploadSessionMock.mockClear();
    getUploadSessionMock.mockClear();
    updateUploadSessionMock.mockClear();
    deleteUploadSessionMock.mockClear();
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (verifiedVendor && pendingVendor) {
      await Product.deleteMany({ vendor_id: { $in: [verifiedVendor.id, pendingVendor.id] } });
      await Vendor.deleteMany({ _id: { $in: [verifiedVendor.id, pendingVendor.id] } });
    }
    await User.deleteMany({ email: { $in: TEST_EMAILS } });
    await mongoose.connection.close();
  });

  it("requires a vendor account and rejects invalid credentials or roles", async () => {
    expect((await createPresignedUrlRequest({ purpose: "kyc", content_type: "image/png" })).status).toBe(401);
    expect((await createPresignedUrlRequest({}, "malformed-token")).status).toBe(401);
    const expiredToken = jwt.sign(
      { id: verifiedVendorUser.id, email: verifiedVendorUser.email, role: "vendor" }, JWT_SECRET, { expiresIn: -1 }
    );
    expect((await createPresignedUrlRequest({}, expiredToken)).status).toBe(401);
    expect((await createPresignedUrlRequest({ purpose: "kyc", content_type: "image/png" }, customerToken)).status).toBe(403);
    const profilelessVendorToken = jwt.sign(
      { id: new mongoose.Types.ObjectId().toString(), email: "profileless@test.com", role: "vendor" }, JWT_SECRET
    );
    expect((await createPresignedUrlRequest({ purpose: "kyc", content_type: "image/png" }, profilelessVendorToken)).status).toBe(403);
    expect(createPresignedUploadUrlMock).not.toHaveBeenCalled();
  });

  it("validates the purpose, MIME type, and strict body shape", async () => {
    const invalidBodies = [
      {},
      { purpose: "other", content_type: "image/png" },
      { purpose: "kyc", content_type: "application/pdf" },
      { purpose: "kyc", content_type: "image/jpeg", extra: "no" },
      { purpose: "product", content_type: "image/png" },
      { purpose: "product", product_id: "invalid-id", content_type: "image/png" },
      { purpose: "product", product_id: verifiedProduct.id, content_type: "image/svg+xml" },
    ];
    for (const body of invalidBodies) {
      expect((await createPresignedUrlRequest(body, verifiedVendorToken)).status).toBe(400);
    }
    expect(createPresignedUploadUrlMock).not.toHaveBeenCalled();
  });

  it("creates a scoped KYC upload URL for a vendor who has not completed KYC", async () => {
    const response = await createPresignedUrlRequest({ purpose: "kyc", content_type: "image/jpeg" }, pendingVendorToken);
    expect(response.status).toBe(200);
    const body = await response.json() as {
      upload_id: string; upload_url: string; object_key: string; expires_in: number; session_expires_at: string;
    };
    expect(body).toMatchObject({ upload_url: expect.stringContaining("https://upload.test/"), expires_in: 600 });
    expect(body.upload_id).toMatch(/^[\da-f-]{36}$/i);
    expect(Date.parse(body.session_expires_at)).toBeGreaterThan(Date.now());
    expect(body.object_key).toMatch(new RegExp(`^kyc/${pendingVendor.id}/[0-9a-f-]+\\.jpg$`));
    expect(createPresignedUploadUrlMock).toHaveBeenCalledWith({
      key: body.object_key, contentType: "image/jpeg", expiresIn: 600,
    });
    expect(createUploadSessionMock).toHaveBeenCalledWith(expect.objectContaining({
      id: body.upload_id, user_id: pendingVendorUser.id, vendor_id: pendingVendor.id,
      purpose: "kyc", status: "issued", object_key: body.object_key,
    }));

    const renewed = await createPresignedUrlRequest({ upload_id: body.upload_id }, pendingVendorToken);
    expect(renewed.status).toBe(200);
    expect(await renewed.json()).toMatchObject({ upload_id: body.upload_id, object_key: body.object_key });
    expect(createPresignedUploadUrlMock).toHaveBeenLastCalledWith({
      key: body.object_key, contentType: "image/jpeg", expiresIn: 600,
    });
  });

  it("creates product upload URLs only for the verified product owner", async () => {
    const response = await createPresignedUrlRequest({
      purpose: "product", product_id: verifiedProduct.id, content_type: "image/webp",
    }, verifiedVendorToken);
    expect(response.status).toBe(200);
    const body = await response.json() as { upload_id: string; upload_url: string; object_key: string; expires_in: number };
    expect(body.object_key).toMatch(new RegExp(`^products/${verifiedVendor.id}/[0-9a-f-]+\\.webp$`));
    expect(body.expires_in).toBe(600);

    expect((await createPresignedUrlRequest({
      purpose: "product", product_id: pendingProduct.id, content_type: "image/png",
    }, verifiedVendorToken)).status).toBe(404);
    expect((await createPresignedUrlRequest({
      purpose: "product", product_id: archivedProduct.id, content_type: "image/png",
    }, verifiedVendorToken)).status).toBe(404);
    expect((await createPresignedUrlRequest({
      purpose: "product", product_id: pendingProduct.id, content_type: "image/png",
    }, pendingVendorToken)).status).toBe(403);
  });

  it("returns a generic server error if presigning fails", async () => {
    createPresignedUploadUrlMock.mockRejectedValueOnce(new Error("Storage secret must not leak"));
    const response = await createPresignedUrlRequest({ purpose: "kyc", content_type: "image/png" }, verifiedVendorToken);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Failed to create upload URL" });
  });

  it("confirms only a matching uploaded object and makes confirmation idempotent", async () => {
    const created = await createPresignedUrlRequest({ purpose: "kyc", content_type: "image/png" }, verifiedVendorToken);
    const session = await created.json() as { upload_id: string; object_key: string };
    const confirm = () => fetch(`${baseUrl}/uploads/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${verifiedVendorToken}` },
      body: JSON.stringify({ upload_id: session.upload_id }),
    });
    const response = await confirm();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ upload_id: session.upload_id, object_key: session.object_key, status: "confirmed" });
    expect(getUploadedObjectInfoMock).toHaveBeenCalledWith(session.object_key);
    expect(updateUploadSessionMock).toHaveBeenCalledWith(expect.objectContaining({ id: session.upload_id, status: "confirmed" }));
    expect((await confirm()).status).toBe(200);
    expect(getUploadedObjectInfoMock).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown, foreign, mismatched, and oversized upload confirmations", async () => {
    const confirm = (uploadId: string, token = verifiedVendorToken) => fetch(`${baseUrl}/uploads/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ upload_id: uploadId }),
    });
    expect((await confirm("00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await fetch(`${baseUrl}/uploads/confirm`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${verifiedVendorToken}` },
      body: JSON.stringify({ upload_id: "bad-id" }),
    })).status).toBe(400);

    const created = await createPresignedUrlRequest({ purpose: "kyc", content_type: "image/png" }, pendingVendorToken);
    const session = await created.json() as { upload_id: string };
    expect((await confirm(session.upload_id)).status).toBe(404);
    getUploadedObjectInfoMock.mockResolvedValueOnce({ contentType: "image/jpeg", contentLength: 1024 });
    expect((await confirm(session.upload_id, pendingVendorToken)).status).toBe(400);
    getUploadedObjectInfoMock.mockResolvedValueOnce({ contentType: "image/png", contentLength: 10 * 1024 * 1024 + 1 });
    expect((await confirm(session.upload_id, pendingVendorToken)).status).toBe(400);
  });

  it("handles incomplete objects and expired sessions", async () => {
    const created = await createPresignedUrlRequest({ purpose: "kyc", content_type: "image/png" }, verifiedVendorToken);
    const session = await created.json() as { upload_id: string };
    const confirm = () => fetch(`${baseUrl}/uploads/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${verifiedVendorToken}` },
      body: JSON.stringify({ upload_id: session.upload_id }),
    });
    const missingObject = Object.assign(new Error("Not found"), { $metadata: { httpStatusCode: 404 } });
    getUploadedObjectInfoMock.mockRejectedValueOnce(missingObject);
    expect((await confirm()).status).toBe(409);

    getUploadSessionMock.mockResolvedValueOnce({
      id: session.upload_id,
      user_id: verifiedVendorUser.id,
      vendor_id: verifiedVendor.id,
      purpose: "kyc",
      object_key: "kyc/expired/object.png",
      content_type: "image/png",
      status: "issued",
      url_expires_at: new Date(Date.now() - 1000).toISOString(),
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    expect((await confirm()).status).toBe(410);
    expect(deleteUploadSessionMock).toHaveBeenCalledWith(session.upload_id);
  });

  it("lets owners delete unconfirmed uploads and prevents deleting confirmed uploads", async () => {
    const create = async () => {
      const response = await createPresignedUrlRequest({ purpose: "kyc", content_type: "image/png" }, verifiedVendorToken);
      return await response.json() as { upload_id: string; object_key: string };
    };
    const session = await create();
    const remove = (id: string, token = verifiedVendorToken) => fetch(`${baseUrl}/uploads/${id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    expect((await remove(session.upload_id, pendingVendorToken)).status).toBe(404);
    expect((await remove("not-an-id")).status).toBe(400);
    expect((await remove(session.upload_id)).status).toBe(409);
    getUploadSessionMock.mockResolvedValueOnce({
      id: session.upload_id,
      user_id: verifiedVendorUser.id,
      vendor_id: verifiedVendor.id,
      purpose: "kyc",
      object_key: session.object_key,
      content_type: "image/png",
      status: "issued",
      url_expires_at: new Date(Date.now() - 1000).toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    expect((await remove(session.upload_id)).status).toBe(204);
    expect(deleteStoredObjectMock).toHaveBeenCalledWith(session.object_key);
    expect(deleteUploadSessionMock).toHaveBeenCalledWith(session.upload_id);
    expect((await remove(session.upload_id)).status).toBe(404);

    const confirmed = await create();
    await fetch(`${baseUrl}/uploads/confirm`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${verifiedVendorToken}` },
      body: JSON.stringify({ upload_id: confirmed.upload_id }),
    });
    expect((await remove(confirmed.upload_id)).status).toBe(409);
  });
});
