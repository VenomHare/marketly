import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { config } from "dotenv";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";
import Vendor from "../models/Vendor.js";
import VendorKyc from "../models/VendorKyc.js";

config();

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3000/api/v1";
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const APPLICANT_EMAIL = "vendor-application-test@test.com";

describe("Vendor Routes", () => {
  let applicant: any;
  let applicantToken: string;
  let admin: any;
  let adminToken: string;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/marketly");
    const previousApplicants = await User.find({ email: APPLICANT_EMAIL }).select("_id");
    await VendorKyc.deleteMany({ vendor_id: { $in: previousApplicants.map((user) => user.id) } });
    await Vendor.deleteMany({ user_id: { $in: previousApplicants.map((user) => user.id) } });
    await User.deleteMany({ email: APPLICANT_EMAIL });

    applicant = await User.create({
      name: "Vendor Applicant",
      email: APPLICANT_EMAIL,
      password_hash: await bcrypt.hash("password123", 10),
      role: "customer",
      status: "active",
    });
    applicantToken = jwt.sign(
      { id: applicant.id, email: applicant.email, role: "customer" },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    admin = await User.create({
      name: "KYC Admin",
      email: "vendor-kyc-admin-test@test.com",
      password_hash: await bcrypt.hash("password123", 10),
      role: "admin",
      status: "active",
    });
    adminToken = jwt.sign(
      { id: admin.id, email: admin.email, role: "admin" },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
  });

  afterAll(async () => {
    if (applicant) {
      await VendorKyc.deleteMany({ vendor_id: applicant.id });
      await Vendor.deleteMany({ user_id: applicant.id });
      await User.deleteOne({ _id: applicant.id });
    }
    if (admin) await User.deleteOne({ _id: admin.id });
    await mongoose.connection.close();
  });

  it("requires authentication", async () => {
    const response = await fetch(`${BASE_URL}/vendors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Shop", display_name: "Shop", address: "1 Main St", postal_code: "12345" }),
    });

    expect(response.status).toBe(401);
  });

  it("creates a pending application and promotes the customer", async () => {
    const payload = {
      name: "Applicant Shop",
      display_name: "Applicant Storefront",
      address: "1 Main St",
      postal_code: "12345",
    };
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${applicantToken}`,
    };

    const response = await fetch(`${BASE_URL}/vendors`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    expect(response.status).toBe(201);
    const body: any = await response.json();
    expect(body).toMatchObject({
      user_id: applicant.id,
      ...payload,
      kyc_status: "pending",
      commission_rate_bps: 0,
    });
    expect((await User.findById(applicant.id))?.role).toBe("vendor");
    applicantToken = jwt.sign(
      { id: applicant.id, email: applicant.email, role: "vendor" },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    const duplicateResponse = await fetch(`${BASE_URL}/vendors`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    expect(duplicateResponse.status).toBe(409);

    const statusResponse = await fetch(`${BASE_URL}/vendors/me/kyc`, {
      headers: { Authorization: `Bearer ${applicantToken}` },
    });
    expect(statusResponse.status).toBe(500);

    const submitResponse = await fetch(`${BASE_URL}/vendors/me/kyc`, {
      method: "POST",
      headers,
      body: JSON.stringify({ address_proof_key: "address/key", identity_proof_key: "identity/key" }),
    });
    expect(submitResponse.status).toBe(500);
  });

  it("provides admin-only KYC review route placeholders", async () => {
    const response = await fetch(`${BASE_URL}/admin/vendors/${applicant.id}/kyc`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(response.status).toBe(500);

    const decisionResponse = await fetch(`${BASE_URL}/admin/vendors/${applicant.id}/verify`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: "verified" }),
    });
    expect(decisionResponse.status).toBe(500);

    const documentsResponse = await fetch(`${BASE_URL}/admin/vendors/${applicant.id}/kyc/documents`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(documentsResponse.status).toBe(500);
  });

  it("requires admin authentication to review KYC", async () => {
    const response = await fetch(`${BASE_URL}/admin/vendors/${applicant.id}/kyc`);
    expect(response.status).toBe(401);
  });

  it("rejects invalid application details", async () => {
    const response = await fetch(`${BASE_URL}/vendors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${applicantToken}`,
      },
      body: JSON.stringify({ name: "", display_name: "Shop" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty("message", "Invalid parameters");
  });
});
