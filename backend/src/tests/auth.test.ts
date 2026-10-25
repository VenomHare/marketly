import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Vendor from "../models/Vendor.js";
import { config } from "dotenv";
config();

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3000/api/v1";
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

describe("Auth Routes", () => {
  let customerUser: any;
  let vendorUser: any;
  let adminUser: any;
  let vendor: any;
  let suspendedUser: any;
  let authToken: string;
  let adminToken: string;
  let vendorToken: string;

  beforeAll(async () => {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/marketly");

    // Clean up test data
    await User.deleteMany({ email: { $in: ["customer@test.com", "vendor@test.com", "admin@test.com", "suspended@test.com", "newuser@test.com", "vendorwithoutprofile@test.com"] } });
    await Vendor.deleteMany({});

    // Create test users
    const passwordHash = await bcrypt.hash("password123", 10);

    customerUser = await User.create({
      name: "Customer User",
      email: "customer@test.com",
      password_hash: passwordHash,
      role: "customer",
      status: "active",
    });

    vendorUser = await User.create({
      name: "Vendor User",
      email: "vendor@test.com",
      password_hash: passwordHash,
      role: "vendor",
      status: "active",
    });

    adminUser = await User.create({
      name: "Admin User",
      email: "admin@test.com",
      password_hash: passwordHash,
      role: "admin",
      status: "active",
    });

    suspendedUser = await User.create({
      name: "Suspended User",
      email: "suspended@test.com",
      password_hash: passwordHash,
      role: "customer",
      status: "suspended",
    });

    // Create vendor profile
    vendor = await Vendor.create({
      user_id: vendorUser.id,
      name: "Test Vendor",
      display_name: "Test Vendor Display",
      address: "123 Test St",
      postal_code: "12345",
      kyc_status: "verified",
      commission_rate_bps: 1000,
    });

    // Generate tokens
    authToken = jwt.sign(
      { id: customerUser.id, email: customerUser.email, role: "customer" },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    adminToken = jwt.sign(
      { id: adminUser.id, email: adminUser.email, role: "admin" },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    vendorToken = jwt.sign(
      { id: vendorUser.id, email: vendorUser.email, role: "vendor" },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
  });

  afterAll(async () => {
    // Clean up test data
    await User.deleteMany({ email: { $in: ["customer@test.com", "vendor@test.com", "admin@test.com", "suspended@test.com", "newuser@test.com", "vendorwithoutprofile@test.com"] } });
    await Vendor.deleteMany({});
    await mongoose.connection.close();
  });

  it("should return customer data for customer role", async () => {
    const token = jwt.sign(
      { id: customerUser.id, email: customerUser.email, role: "customer" },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    const response = await fetch(`${BASE_URL}/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toHaveProperty("id", customerUser.id);
    expect(body).toHaveProperty("role", "customer");
    expect(body).not.toHaveProperty("vendor");
    expect(body).not.toHaveProperty("admin");
  });

  it("should return vendor data for vendor role", async () => {
    const token = jwt.sign(
      { id: vendorUser.id, email: vendorUser.email, role: "vendor" },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    const response = await fetch(`${BASE_URL}/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toHaveProperty("id", vendorUser.id);
    expect(body).toHaveProperty("role", "vendor");
    expect(body).toHaveProperty("vendor");
    expect(body.vendor).toHaveProperty("id", vendor.id);
    expect(body.vendor).toHaveProperty("display_name", "Test Vendor Display");
    expect(body).not.toHaveProperty("admin");
  });

  it("should return admin data for admin role", async () => {
    const token = jwt.sign(
      { id: adminUser.id, email: adminUser.email, role: "admin" },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    const response = await fetch(`${BASE_URL}/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toHaveProperty("id", adminUser.id);
    expect(body).toHaveProperty("role", "admin");
    expect(body).toHaveProperty("admin");
    expect(body.admin).toHaveProperty("permissions");
    expect(Array.isArray(body.admin.permissions)).toBe(true);
    expect(body).not.toHaveProperty("vendor");
  });

  it("should return 401 without token", async () => {
    const response = await fetch(`${BASE_URL}/me`);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty("message", "No token provided");
  });

  it("should return 401 with invalid token", async () => {
    const response = await fetch(`${BASE_URL}/me`, {
      headers: {
        Authorization: "Bearer invalid-token",
      },
    });
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty("message", "Invalid or expired token");
  });

  it("should return 401 with token signed with wrong secret", async () => {
    const token = jwt.sign(
      { id: customerUser.id, email: customerUser.email, role: "customer" },
      "wrong-secret-key",
      { expiresIn: "7d" }
    );

    const response = await fetch(`${BASE_URL}/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty("message", "Invalid or expired token");
  });

  it("should return 401 with expired token", async () => {
    const token = jwt.sign(
      { id: customerUser.id, email: customerUser.email, role: "customer" },
      JWT_SECRET,
      { expiresIn: "-1h" }
    );

    const response = await fetch(`${BASE_URL}/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty("message", "Invalid or expired token");
  });

  it("should return 401 with malformed JWT (not valid base64)", async () => {
    const response = await fetch(`${BASE_URL}/me`, {
      headers: {
        Authorization: "Bearer not-a-valid-jwt-token",
      },
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty("message", "Invalid or expired token");
  });

  it("should return 401 with missing Authorization header", async () => {
    const response = await fetch(`${BASE_URL}/me`, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty("message", "No token provided");
  });

  it("should return 401 with wrong Authorization format (no Bearer prefix)", async () => {
    const token = jwt.sign(
      { id: customerUser.id, email: customerUser.email, role: "customer" },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    const response = await fetch(`${BASE_URL}/me`, {
      headers: {
        Authorization: token,
      },
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty("message", "No token provided");
  });

  it("should return 401 with wrong Authorization format (lowercase bearer)", async () => {
    const token = jwt.sign(
      { id: customerUser.id, email: customerUser.email, role: "customer" },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    const response = await fetch(`${BASE_URL}/me`, {
      headers: {
        Authorization: `bearer ${token}`,
      },
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty("message", "No token provided");
  });

  it("should return 401 with token missing required fields", async () => {
    const token = jwt.sign(
      { id: customerUser.id },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    const response = await fetch(`${BASE_URL}/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty("message", "Invalid or expired token");
  });

  it("should return 401 with empty token", async () => {
    const response = await fetch(`${BASE_URL}/me`, {
      headers: {
        Authorization: "Bearer ",
      },
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty("message", "No token provided");
  });

  it("should return 401 with token signed by different algorithm", async () => {
    const token = jwt.sign(
      { id: customerUser.id, email: customerUser.email, role: "customer" },
      JWT_SECRET,
      { expiresIn: "7d", algorithm: "none" }
    );

    const response = await fetch(`${BASE_URL}/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty("message", "Invalid or expired token");
  });

  describe("POST /auth/register", () => {
    it("should register a new customer", async () => {
      const response = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New User",
          email: "newuser@test.com",
          password: "password123",
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();

      expect(body).toHaveProperty("user");
      expect(body).toHaveProperty("token");
      expect(body).toHaveProperty("refreshToken");
      expect(body.user).toHaveProperty("id");
      expect(body.user).toHaveProperty("name", "New User");
      expect(body.user).toHaveProperty("email", "newuser@test.com");
      expect(body.user).toHaveProperty("role", "customer");
      expect(body.user).toHaveProperty("status", "active");
    });

    it("should register a new vendor", async () => {
      const response = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New Vendor",
          email: "newvendor@test.com",
          password: "password123",
          role: "vendor",
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.user).toHaveProperty("role", "vendor");

      // Clean up
      await User.deleteOne({ email: "newvendor@test.com" });
    });

    it("should reject registration with missing name", async () => {
      const response = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@test.com",
          password: "password123",
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("message", "Invalid parameters");
    });

    it("should reject registration with missing email", async () => {
      const response = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test User",
          password: "password123",
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("message", "Invalid parameters");
    });

    it("should reject registration with missing password", async () => {
      const response = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test User",
          email: "test@test.com",
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("message", "Invalid parameters");
    });

    it("should reject registration with invalid role", async () => {
      const response = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test User",
          email: "test@test.com",
          password: "password123",
          role: "invalid",
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("message", "Invalid parameters");
      expect(body).not.toHaveProperty("errors");
    });

    it("should reject registration with duplicate email", async () => {
      const response = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Customer User",
          email: "customer@test.com",
          password: "password123",
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("message", "Email already registered");
    });
  });

  describe("POST /auth/login", () => {
    it("should login with valid credentials", async () => {
      const response = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "customer@test.com",
          password: "password123",
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body).toHaveProperty("user");
      expect(body).toHaveProperty("token");
      expect(body).toHaveProperty("refreshToken");
      expect(body.user).toHaveProperty("id", customerUser.id);
      expect(body.user).toHaveProperty("email", "customer@test.com");
    });

    it("should reject login with missing email", async () => {
      const response = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: "password123",
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("message", "Invalid parameters");
    });

    it("should reject login with missing password", async () => {
      const response = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "customer@test.com",
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("message", "Invalid parameters");
    });

    it("should reject login with invalid email", async () => {
      const response = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "nonexistent@test.com",
          password: "password123",
        }),
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toHaveProperty("message", "Invalid credentials");
    });

    it("should reject login with invalid password", async () => {
      const response = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "customer@test.com",
          password: "wrongpassword",
        }),
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toHaveProperty("message", "Invalid credentials");
    });

    it("should reject login for suspended account", async () => {
      const response = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "suspended@test.com",
          password: "password123",
        }),
      });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body).toHaveProperty("message", "Account is suspended");
    });
  });

  describe("POST /auth/refresh", () => {
    it("should refresh token with valid refresh token", async () => {
      const refreshToken = jwt.sign(
        { id: customerUser.id, email: customerUser.email, role: "customer" },
        JWT_SECRET,
        { expiresIn: "30d" }
      );

      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body).toHaveProperty("token");
      expect(body).toHaveProperty("refreshToken");
      expect(typeof body.token).toBe("string");
      expect(typeof body.refreshToken).toBe("string");
    });

    it("should reject refresh with missing refresh token", async () => {
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("message", "Invalid parameters");
      expect(body).not.toHaveProperty("errors");
    });

    it("should reject refresh with invalid refresh token", async () => {
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: "invalid-token" }),
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toHaveProperty("message", "Invalid or expired refresh token");
    });

    it("should reject refresh with expired refresh token", async () => {
      const refreshToken = jwt.sign(
        { id: customerUser.id, email: customerUser.email, role: "customer" },
        JWT_SECRET,
        { expiresIn: "-1h" }
      );

      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toHaveProperty("message", "Invalid or expired refresh token");
    });

    it("should reject refresh for suspended user", async () => {
      const refreshToken = jwt.sign(
        { id: suspendedUser.id, email: suspendedUser.email, role: "customer" },
        JWT_SECRET,
        { expiresIn: "30d" }
      );

      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toHaveProperty("message", "Invalid or expired refresh token");
    });
  });

  describe("POST /auth/logout", () => {
    it("should logout successfully", async () => {
      const response = await fetch(`${BASE_URL}/auth/logout`, {
        method: "POST",
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty("message", "Logged out successfully");
    });
  });

  describe("PATCH /users/me", () => {
    it("should update user name", async () => {
      const response = await fetch(`${BASE_URL}/users/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ name: "Updated Customer Name" }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body).toHaveProperty("name", "Updated Customer Name");
      expect(body).toHaveProperty("email", customerUser.email);
      expect(body).toHaveProperty("id", customerUser.id);

      // Revert for other tests
      await User.findByIdAndUpdate(customerUser.id, { name: "Customer User" });
    });

    it("should reject update without authentication", async () => {
      const response = await fetch(`${BASE_URL}/users/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated Name" }),
      });

      expect(response.status).toBe(401);
    });

    it("should reject update with invalid token", async () => {
      const response = await fetch(`${BASE_URL}/users/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer invalid-token",
        },
        body: JSON.stringify({ name: "Updated Name" }),
      });

      expect(response.status).toBe(401);
    });
  });

  describe("PATCH /users/me/password", () => {
    it("should update password with valid current password", async () => {
      const response = await fetch(`${BASE_URL}/users/me/password`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          currentPassword: "password123",
          newPassword: "newpassword123",
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty("message", "Password updated successfully");

      // Revert password for other tests
      const newPasswordHash = await bcrypt.hash("password123", 10);
      await User.findByIdAndUpdate(customerUser.id, { password_hash: newPasswordHash });
    });

    it("should reject password update without authentication", async () => {
      const response = await fetch(`${BASE_URL}/users/me/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: "password123",
          newPassword: "newpassword123",
        }),
      });

      expect(response.status).toBe(401);
    });

    it("should reject password update with missing current password", async () => {
      const response = await fetch(`${BASE_URL}/users/me/password`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          newPassword: "newpassword123",
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("message", "Invalid parameters");
      expect(body).not.toHaveProperty("errors");
    });

    it("should reject password update with missing new password", async () => {
      const response = await fetch(`${BASE_URL}/users/me/password`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          currentPassword: "password123",
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("message", "Invalid parameters");
      expect(body).not.toHaveProperty("errors");
    });

    it("should reject password update with incorrect current password", async () => {
      const response = await fetch(`${BASE_URL}/users/me/password`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          currentPassword: "wrongpassword",
          newPassword: "newpassword123",
        }),
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toHaveProperty("message", "Current password is incorrect");
    });
  });

  describe("GET /users/me/orders", () => {
    it("should return not implemented message", async () => {
      const response = await fetch(`${BASE_URL}/users/me/orders`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty("message", "Route not implemented yet");
    });

    it("should reject without authentication", async () => {
      const response = await fetch(`${BASE_URL}/users/me/orders`);

      expect(response.status).toBe(401);
    });
  });

  describe("GET /admin/users", () => {
    it("should return all users for admin", async () => {
      const response = await fetch(`${BASE_URL}/admin/users`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      expect(body[0]).toHaveProperty("id");
      expect(body[0]).toHaveProperty("name");
      expect(body[0]).toHaveProperty("email");
      expect(body[0]).toHaveProperty("role");
      expect(body[0]).toHaveProperty("status");
    });

    it("should reject for non-admin user", async () => {
      const response = await fetch(`${BASE_URL}/admin/users`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body).toHaveProperty("message", "Admin access required");
    });

    it("should reject without authentication", async () => {
      const response = await fetch(`${BASE_URL}/admin/users`);

      expect(response.status).toBe(401);
    });
  });

  describe("GET /admin/users/:uuid", () => {
    it("should return specific user for admin", async () => {
      const response = await fetch(`${BASE_URL}/admin/users/${customerUser.id}`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body).toHaveProperty("id", customerUser.id);
      expect(body).toHaveProperty("name", customerUser.name);
      expect(body).toHaveProperty("email", customerUser.email);
      expect(body).toHaveProperty("role", customerUser.role);
    });

    it("should return 404 for non-existent user", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await fetch(`${BASE_URL}/admin/users/${fakeId}`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body).toHaveProperty("message", "User not found");
    });

    it("should reject for non-admin user", async () => {
      const response = await fetch(`${BASE_URL}/admin/users/${customerUser.id}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body).toHaveProperty("message", "Admin access required");
    });

    it("should reject without authentication", async () => {
      const response = await fetch(`${BASE_URL}/admin/users/${customerUser.id}`);

      expect(response.status).toBe(401);
    });
  });

  describe("PATCH /admin/users/:uuid/status", () => {
    it("should update user status for admin", async () => {
      const response = await fetch(`${BASE_URL}/admin/users/${customerUser.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ status: "suspended" }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body).toHaveProperty("status", "suspended");

      // Revert for other tests
      await User.findByIdAndUpdate(customerUser.id, { status: "active" });
    });

    it("should reject with invalid status", async () => {
      const response = await fetch(`${BASE_URL}/admin/users/${customerUser.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ status: "invalid" }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("message", "Invalid parameters");
      expect(body).not.toHaveProperty("errors");
    });

    it("should reject with missing status", async () => {
      const response = await fetch(`${BASE_URL}/admin/users/${customerUser.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("message", "Invalid parameters");
      expect(body).not.toHaveProperty("errors");
    });

    it("should return 404 for non-existent user", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await fetch(`${BASE_URL}/admin/users/${fakeId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ status: "suspended" }),
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body).toHaveProperty("message", "User not found");
    });

    it("should reject for non-admin user", async () => {
      const response = await fetch(`${BASE_URL}/admin/users/${customerUser.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ status: "suspended" }),
      });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body).toHaveProperty("message", "Admin access required");
    });

    it("should reject without authentication", async () => {
      const response = await fetch(`${BASE_URL}/admin/users/${customerUser.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "suspended" }),
      });

      expect(response.status).toBe(401);
    });
  });
});
