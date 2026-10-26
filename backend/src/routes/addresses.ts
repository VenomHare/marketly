import { Router } from "express";
import mongoose from "mongoose";
import Address, { IAddress } from "../models/Address.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { addressCreateSchema, addressUpdateSchema } from "../validators/addresses.js";

const addressesRouter = Router();

const serializeAddress = (address: IAddress) => ({
  id: address.id,
  label: address.label,
  first_line: address.first_line,
  ...(address.second_line ? { second_line: address.second_line } : {}),
  postal_code: address.postal_code,
  city: address.city,
  state: address.state,
  country: address.country,
  addressee_name: address.addressee_name,
  contact_number: address.contact_number,
  created_at: address.created_at,
});

addressesRouter.post("/addresses", authenticate, async (req, res) => {
  const authReq = req as AuthRequest;
  if (authReq.user?.role !== "customer") {
    return res.status(403).json({ message: "Customer access required" });
  }
  const parsed = addressCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid address",
      errors: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
    });
  }

  try {
    const address = await Address.create({ ...parsed.data, user_id: authReq.user.id });
    return res.status(201).json({ address: serializeAddress(address) });
  } catch {
    return res.status(500).json({ message: "Failed to create address" });
  }
});

addressesRouter.get("/addresses", authenticate, async (req, res) => {
  const authReq = req as AuthRequest;
  if (authReq.user?.role !== "customer") {
    return res.status(403).json({ message: "Customer access required" });
  }
  if (Object.keys(req.query).length > 0) {
    return res.status(400).json({ message: "Unsupported query parameter" });
  }

  try {
    const addresses = await Address.find({ user_id: authReq.user.id }).sort({ created_at: -1, _id: -1 });
    return res.status(200).json({ addresses: addresses.map(serializeAddress) });
  } catch {
    return res.status(500).json({ message: "Failed to retrieve addresses" });
  }
});

addressesRouter.get("/addresses/:uuid", authenticate, async (req, res) => {
  const authReq = req as AuthRequest;
  if (authReq.user?.role !== "customer") {
    return res.status(403).json({ message: "Customer access required" });
  }
  const { uuid } = req.params;
  if (!mongoose.isValidObjectId(uuid)) return res.status(400).json({ message: "Address ID must be valid" });

  try {
    const address = await Address.findOne({ _id: uuid, user_id: authReq.user.id });
    if (!address) return res.status(404).json({ message: "Address not found" });
    return res.status(200).json({ address: serializeAddress(address) });
  } catch {
    return res.status(500).json({ message: "Failed to retrieve address" });
  }
});

addressesRouter.patch("/addresses/:uuid", authenticate, async (req, res) => {
  const authReq = req as AuthRequest;
  if (authReq.user?.role !== "customer") {
    return res.status(403).json({ message: "Customer access required" });
  }
  const { uuid } = req.params;
  if (!mongoose.isValidObjectId(uuid)) return res.status(400).json({ message: "Address ID must be valid" });
  const parsed = addressUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid address update",
      errors: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
    });
  }

  try {
    const address = await Address.findOneAndUpdate(
      { _id: uuid, user_id: authReq.user.id },
      { $set: parsed.data },
      { new: true, runValidators: true }
    );
    if (!address) return res.status(404).json({ message: "Address not found" });
    return res.status(200).json({ address: serializeAddress(address) });
  } catch {
    return res.status(500).json({ message: "Failed to update address" });
  }
});

addressesRouter.delete("/addresses/:uuid", authenticate, async (req, res) => {
  const authReq = req as AuthRequest;
  if (authReq.user?.role !== "customer") {
    return res.status(403).json({ message: "Customer access required" });
  }
  const { uuid } = req.params;
  if (!mongoose.isValidObjectId(uuid)) return res.status(400).json({ message: "Address ID must be valid" });

  try {
    const result = await Address.deleteOne({ _id: uuid, user_id: authReq.user.id });
    if (result.deletedCount === 0) return res.status(404).json({ message: "Address not found" });
    return res.status(204).send();
  } catch {
    return res.status(500).json({ message: "Failed to delete address" });
  }
});

export default addressesRouter;
