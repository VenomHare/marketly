import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Address from "../models/Address.js";

config();

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3000/api/v1";
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const CUSTOMER_ID = new mongoose.Types.ObjectId().toString();
const OTHER_CUSTOMER_ID = new mongoose.Types.ObjectId().toString();
const EMPTY_CUSTOMER_ID = new mongoose.Types.ObjectId().toString();
const CUSTOMER_TOKEN = jwt.sign({ id: CUSTOMER_ID, email: "address-customer@test.invalid", role: "customer" }, JWT_SECRET);
const OTHER_CUSTOMER_TOKEN = jwt.sign({ id: OTHER_CUSTOMER_ID, email: "address-other@test.invalid", role: "customer" }, JWT_SECRET);
const EMPTY_CUSTOMER_TOKEN = jwt.sign({ id: EMPTY_CUSTOMER_ID, email: "address-empty@test.invalid", role: "customer" }, JWT_SECRET);
const VENDOR_TOKEN = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), email: "address-vendor@test.invalid", role: "vendor" }, JWT_SECRET);

const validAddress = {
  label: "Home",
  first_line: "123 Market Street",
  second_line: "Apartment 4B",
  postal_code: "94105",
  city: "San Francisco",
  state: "California",
  country: "United States",
  addressee_name: "Taylor Customer",
  contact_number: "+1 (415) 555-0123",
};

const createAddress = (body: unknown, token?: string) => fetch(`${BASE_URL}/addresses`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify(body),
});

const getAddress = (id: string, token?: string) => fetch(`${BASE_URL}/addresses/${id}`, {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
});

const updateAddress = (id: string, body: unknown, token?: string) => fetch(`${BASE_URL}/addresses/${id}`, {
  method: "PATCH",
  headers: {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify(body),
});

const deleteAddress = (id: string, token?: string) => fetch(`${BASE_URL}/addresses/${id}`, {
  method: "DELETE",
  headers: token ? { Authorization: `Bearer ${token}` } : {},
});

describe("Address routes", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/marketly");
    await Address.deleteMany({ user_id: { $in: [CUSTOMER_ID, OTHER_CUSTOMER_ID, EMPTY_CUSTOMER_ID] } });
  });

  afterAll(async () => {
    await Address.deleteMany({ user_id: { $in: [CUSTOMER_ID, OTHER_CUSTOMER_ID, EMPTY_CUSTOMER_ID] } });
    await mongoose.connection.close();
  });

  it("POST /addresses creates a validated address for the authenticated customer", async () => {
    const response = await createAddress(validAddress, CUSTOMER_TOKEN);
    expect(response.status).toBe(201);
    const body = await response.json() as { address: Record<string, unknown> };
    expect(body.address).toMatchObject(validAddress);
    expect(body.address.id).toEqual(expect.any(String));
    expect(body.address.created_at).toEqual(expect.any(String));
    expect(body.address).not.toHaveProperty("_id");
    expect(body.address).not.toHaveProperty("user_id");
  });

  it("POST /addresses rejects unauthenticated, non-customer, and malformed requests", async () => {
    expect((await createAddress(validAddress)).status).toBe(401);
    expect((await createAddress(validAddress, "invalid-token")).status).toBe(401);
    expect((await createAddress(validAddress, VENDOR_TOKEN)).status).toBe(403);

    const invalidBodies = [
      null,
      [],
      {},
      { ...validAddress, unexpected: "field" },
      { ...validAddress, label: "  " },
      { ...validAddress, first_line: "" },
      { ...validAddress, second_line: "  " },
      { ...validAddress, postal_code: "x".repeat(33) },
      { ...validAddress, city: "bad\ncity" },
      { ...validAddress, contact_number: "" },
    ];
    for (const body of invalidBodies) {
      const response = await createAddress(body, CUSTOMER_TOKEN);
      expect(response.status).toBe(400);
      expect(await response.json()).toHaveProperty("message");
    }
  });

  it("GET /addresses returns only the authenticated customer's addresses, newest first", async () => {
    await createAddress({ ...validAddress, label: "Older" }, CUSTOMER_TOKEN);
    const ownNewest = await createAddress({ ...validAddress, label: "Newest" }, CUSTOMER_TOKEN);
    const ownNewestBody = await ownNewest.json() as { address: { id: string } };
    await createAddress({ ...validAddress, label: "Other customer" }, OTHER_CUSTOMER_TOKEN);

    const response = await fetch(`${BASE_URL}/addresses`, { headers: { Authorization: `Bearer ${CUSTOMER_TOKEN}` } });
    expect(response.status).toBe(200);
    const body = await response.json() as { addresses: Array<Record<string, unknown>> };
    expect(body.addresses.length).toBeGreaterThanOrEqual(2);
    expect(body.addresses[0]).toMatchObject({ id: ownNewestBody.address.id, label: "Newest" });
    expect(body.addresses.map((address) => address.label)).not.toContain("Other customer");
    expect(body.addresses.every((address) => !Object.hasOwn(address, "user_id"))).toBe(true);
    expect(body.addresses.every((address) => !Object.hasOwn(address, "_id"))).toBe(true);
  });

  it("GET /addresses rejects missing auth and unexpected query parameters", async () => {
    expect((await fetch(`${BASE_URL}/addresses`)).status).toBe(401);
    expect((await fetch(`${BASE_URL}/addresses?user_id=${CUSTOMER_ID}`, {
      headers: { Authorization: `Bearer ${CUSTOMER_TOKEN}` },
    })).status).toBe(400);

    const empty = await fetch(`${BASE_URL}/addresses`, {
      headers: { Authorization: `Bearer ${EMPTY_CUSTOMER_TOKEN}` },
    });
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ addresses: [] });
  });

  it("GET /addresses/:uuid returns only the requesting customer's address", async () => {
    const created = await createAddress(validAddress, CUSTOMER_TOKEN);
    const { address } = await created.json() as { address: { id: string } };
    const foreign = await createAddress(validAddress, OTHER_CUSTOMER_TOKEN);
    const foreignAddress = await foreign.json() as { address: { id: string } };

    expect((await getAddress(address.id)).status).toBe(401);
    expect((await getAddress(address.id, VENDOR_TOKEN)).status).toBe(403);
    expect((await getAddress("not-an-id", CUSTOMER_TOKEN)).status).toBe(400);
    expect((await getAddress(new mongoose.Types.ObjectId().toString(), CUSTOMER_TOKEN)).status).toBe(404);
    expect((await getAddress(foreignAddress.address.id, CUSTOMER_TOKEN)).status).toBe(404);

    const response = await getAddress(address.id, CUSTOMER_TOKEN);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ address: expect.objectContaining({ id: address.id, ...validAddress }) });
  });

  it("PATCH /addresses/:uuid updates allowed fields without changing ownership", async () => {
    const created = await createAddress(validAddress, CUSTOMER_TOKEN);
    const { address } = await created.json() as { address: { id: string } };

    expect((await updateAddress(address.id, { label: "Work" })).status).toBe(401);
    expect((await updateAddress(address.id, { label: "Work" }, VENDOR_TOKEN)).status).toBe(403);
    expect((await updateAddress("not-an-id", { label: "Work" }, CUSTOMER_TOKEN)).status).toBe(400);
    expect((await updateAddress(address.id, { label: "Work", user_id: OTHER_CUSTOMER_ID }, CUSTOMER_TOKEN)).status).toBe(400);
    expect((await updateAddress(address.id, { label: "Work" }, OTHER_CUSTOMER_TOKEN)).status).toBe(404);

    const invalidBodies = [
      null,
      [],
      {},
      { label: "  " },
      { postal_code: "x".repeat(33) },
      { country: "bad\u0000country" },
      { extra: "not allowed" },
    ];
    for (const body of invalidBodies) {
      expect((await updateAddress(address.id, body, CUSTOMER_TOKEN)).status).toBe(400);
    }

    const updated = await updateAddress(address.id, { label: "  Work  ", first_line: "  500 New Street  " }, CUSTOMER_TOKEN);
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      address: { id: address.id, label: "Work", first_line: "500 New Street", country: validAddress.country },
    });
    expect((await getAddress(address.id, OTHER_CUSTOMER_TOKEN)).status).toBe(404);
  });

  it("DELETE /addresses/:uuid deletes only an address owned by the customer", async () => {
    const created = await createAddress(validAddress, CUSTOMER_TOKEN);
    const { address } = await created.json() as { address: { id: string } };

    expect((await deleteAddress(address.id)).status).toBe(401);
    expect((await deleteAddress(address.id, VENDOR_TOKEN)).status).toBe(403);
    expect((await deleteAddress("not-an-id", CUSTOMER_TOKEN)).status).toBe(400);
    expect((await deleteAddress(address.id, OTHER_CUSTOMER_TOKEN)).status).toBe(404);
    expect((await getAddress(address.id, CUSTOMER_TOKEN)).status).toBe(200);

    const deleted = await deleteAddress(address.id, CUSTOMER_TOKEN);
    expect(deleted.status).toBe(204);
    expect(await deleted.text()).toBe("");
    expect((await deleteAddress(address.id, CUSTOMER_TOKEN)).status).toBe(404);
  });
});
