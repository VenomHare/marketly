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
| `PATCH /admin/vendors/:uuid/verify` | Admin auth; path `uuid` | Not implemented: `500 {message:"Route not implemented"}` |
| `PATCH /admin/vendors/:uuid/status` | No auth middleware; path `uuid` | Not implemented: `500 {message:"Route not implemented"}` |

## Catalog, coupons, orders, settlements, reviews, analytics, search

All handlers below currently return `500 {message:"Route not implemented"}` and define no request parsing or successful response contract.

| Method and path | Auth / path inputs |
| --- | --- |
| `POST /admin/categories` | None |
| `PATCH /admin/categories/:uuid` | None; `uuid` |
| `DELETE /admin/categories/:uuid` | None; `uuid` |
| `POST /admin/coupons` | None |
| `PATCH /admin/coupons/:uuid` | None; `uuid` |
| `DELETE /admin/coupons/:uuid` | None; `uuid` |
| `GET /admin/orders` | None |
| `PATCH /admin/orders/:uuid/status` | None; `uuid` |
| `GET /admin/settlements` | None |
| `POST /admin/settlements/:uuid/retry` | None; `uuid` |
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

> [!WARNING]
> Middleware omissions above are present in the route implementation. In particular, do not treat the unprotected placeholders as secured admin APIs.

