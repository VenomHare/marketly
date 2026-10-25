import { describe, expect, it } from "vitest";
import { config } from "dotenv";
import jwt from "jsonwebtoken";

config();

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3000/api/v1";
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

describe("Product Routes", () => {
  it("requires an authenticated verified vendor to create products", async () => {
    const unauthenticatedResponse = await fetch(`${BASE_URL}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(unauthenticatedResponse.status).toBe(401);

    const customerToken = jwt.sign(
      { id: "customer-id", email: "customer@test.com", role: "customer" },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    const customerResponse = await fetch(`${BASE_URL}/products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({}),
    });
    expect(customerResponse.status).toBe(403);
  });
});
