---
layout: default
title: Administration
parent: API Reference
nav_order: 2
---

# Administration routes

Base prefix: `/api/v1`. Routes marked **Admin auth** require a bearer JWT and admin role. The current module contains both protected handlers and unprotected placeholders; this page reflects the actual middleware attached in code.

## Users

### `GET /admin/users` — Admin auth

No inputs. `200` array of `{id,name,email,role,status,created_at,updated_at}`, newest first. Errors: `401` auth failure; `403 {message:"Admin access required"}`; `500 {message:"Failed to fetch users"}`.

### `GET /admin/users/:uuid` — Admin auth

Path `uuid` is passed to Mongoose `findById` (no explicit schema validation). `200` `{id,name,email,role,status,created_at,updated_at}`; `401`, `403`, `404 {message:"User not found"}`, `500 {message:"Failed to fetch user"}`.

### `PATCH /admin/users/:uuid/status` — Admin auth

Body `{status:"active"|"suspended"}`. `200` `{id,name,email,role,status,updated_at}`; `400 {message:"Invalid parameters"}`; `401`, `403`, `404 {message:"User not found"}`, `500 {message:"Failed to update user status"}`.

## Vendor review and management

| Method and path | Inputs / access | Current response |
| --- | --- | --- |
| `GET /admin/vendors/:uuid/kyc` | Admin auth; path `uuid` | Not implemented: `500 {message:"Route not implemented"}` |
| `GET /admin/vendors/:uuid/kyc/documents` | Admin auth; path `uuid` | Not implemented: `500 {message:"Route not implemented"}` |
| `GET /admin/vendors` | No auth middleware; no declared inputs | Not implemented: `500 {message:"Route not implemented"}` |
| `GET /admin/vendors/:uuid` | No auth middleware; path `uuid` | Not implemented: `500 {message:"Route not implemented"}` |
| `PATCH /admin/vendors/:uuid/verify` | Admin auth; path `uuid` | Approve or reject KYC |
| `PATCH /admin/vendors/:uuid/status` | Admin auth; path `uuid` | Activate or suspend vendor |
| `PATCH /admin/vendors/:uuid/commission` | Admin auth; `{commission_rate_bps: 0..10000}` | Set commission rate for future deliveries |
| `PATCH /admin/vendors/:uuid/razorpay-account` | Admin auth; `{razorpay_linked_account_id: "acc_…"}` or `null` | Configure or remove the onboarded Razorpay Route destination used for releases |

## Catalog, coupons, orders, settlements, reviews, analytics, search

Some handlers in this group are implemented; routes marked with coupon operations require an active admin bearer token.

| Method and path | Auth / path inputs |
| --- | --- |
| `POST /admin/categories` | None |
| `PATCH /admin/categories/:uuid` | None; `uuid` |
| `DELETE /admin/categories/:uuid` | None; `uuid` |
| `POST /admin/coupons` | Active admin bearer token |
| `GET /admin/coupons` | Active admin bearer token; optional `page`, `limit` |
| `GET /admin/coupon-redemptions` | Active admin bearer token; optional `page`, `limit` |
| `PATCH /admin/coupons/:uuid` | Active admin bearer token; `uuid` |
| `DELETE /admin/coupons/:uuid` | Active admin bearer token; `uuid` |
| `GET /admin/orders` | None |
| `PATCH /admin/orders/:uuid/status` | None; `uuid` |
| `GET /admin/settlements` | Active admin bearer token; optional `page`, `limit`, `status` | Lists payment amount and ID, Route destination, gross, net commission, seller refunds, seller balance offset, transfer ID and release state |
| `POST /admin/settlements/reconcile` | Active admin bearer token; `{confirm:true}`; creates missing pending settlements for delivered paid orders using the vendors' current commission rates |
| `POST /admin/settlements/:uuid/release` | Active admin bearer token; `{}` | Sends seller net through Razorpay Route; requires Route activation, an onboarded linked account and a successful INR payment |
| `POST /admin/settlements/:uuid/retry` | Active admin bearer token; `uuid` |
| `PATCH /admin/reviews/:uuid/moderation` | None; `uuid` |
| `GET /admin/analytics/overview` | None |
| `GET /admin/analytics/sales` | None |
| `GET /admin/analytics/products` | None |
| `GET /admin/analytics/vendors` | None |
| `GET /admin/analytics/customers` | None |
| `GET /admin/analytics/payments` | None |
| `GET /admin/analytics/commissions` | None |
| `POST /admin/search/reindex` | None |
| `GET /admin/search/index-status` | None |

The middleware column reflects the implementation: routes listed with no auth middleware are currently reachable without admin authentication, including the placeholder handlers. The implemented user management routes require admin authentication.

Refund approval returns the full customer payment. The settlement ledger charges the refunded seller net, removes the corresponding Marketly commission, and keeps the payment processor fee with Marketly. If a seller was already paid, their vendor balance becomes negative and is offset against later releases. Razorpay Route transfers are initiated by an administrator after reviewing the settlement and require an onboarded linked account.

