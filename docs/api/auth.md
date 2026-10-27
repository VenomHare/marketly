---
layout: default
title: Authentication
parent: API Reference
nav_order: 1
---

# Authentication and user routes

Base prefix: `/api/v1`. JWT access tokens expire in 7 days; refresh tokens expire in 30 days. Protected routes require `Authorization: Bearer <token>`.

## `POST /auth/register`

**Body** (strict JSON object): `name` non-empty string, `email` valid email, `password` non-empty string. Extra keys are rejected.

**Responses:** `201` `{user:{id,name,email,role:"customer",status:"active"},token,refreshToken}`; `400` `{message:"Invalid parameters"}`; `400` `{message:"Email already registered"}`; `500` `{message:"Registration failed"}`.

## `POST /auth/login`

**Body:** `email` valid email and `password` non-empty string. **Responses:** `200` `{user:{id,name,email,role,status},token,refreshToken}`; `400` invalid parameters; `401` `{message:"Invalid credentials"}`; `403` `{message:"Account is suspended"}`; `500` `{message:"Login failed"}`.

## `POST /auth/refresh`

**Body:** `{ "refreshToken": "<JWT>" }`, non-empty token string. **Responses:** `200` `{token,refreshToken}` (both rotated); `400` invalid parameters; `401` `{message:"Invalid or expired refresh token"}`.

## `POST /auth/logout`

No body or authentication is read. **Response:** `200` `{message:"Logged out successfully"}`. This handler does not revoke tokens.

## `GET /me`

**Auth:** required. No query/body. **Response:** `200` common user fields `{id,name,email,role,status,created_at,updated_at}`. Vendor responses may add `vendor:{id,user_id,name,display_name,address,postal_code,kyc_status,commission_rate_bps,created_at,updated_at}`. Admin responses may add `admin:{permissions:["manage_users","manage_vendors","manage_products","view_analytics"]}`. Also `401` auth failure, `404` `{message:"User not found"}`, `500` `{message:"Failed to fetch user"}`.

## `PATCH /users/me`

**Auth:** required. **Body:** optional `name` non-empty string; the current schema permits an empty object. **Responses:** `200` `{id,name,email,role,status,updated_at}`; `400` invalid parameters; `401` auth failure; `404` user not found; `500` `{message:"Failed to update user"}`.

## `PATCH /users/me/password`

**Auth:** required. **Body:** `{currentPassword,newPassword}`; both non-empty strings. **Responses:** `200` `{message:"Password updated successfully"}`; `400` invalid parameters; `401` `{message:"Current password is incorrect"}` or auth failure; `404` user not found; `500` `{message:"Failed to update password"}`.

## `GET /users/me/orders`

**Auth:** required. No query/body. **Response:** `200` `{message:"Route not implemented yet"}`. This differs from the other placeholder routes, which return status 500.

## Authentication

The middleware requires a case-sensitive `Bearer ` prefix. JWT payload requires `id`, `email`, and role (`customer`, `vendor`, or `admin`). Admin routes add `requireAdmin`; vendor management adds `requireVendor`; product writes add `requireVerifiedVendor`.

