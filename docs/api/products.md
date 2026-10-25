# Product routes

Base prefix: `/api/v1`. Product management writes require `Authorization: Bearer <JWT>` from a vendor whose KYC status is `verified`. Public read handlers have no auth middleware in the current code.

| Method and path | Inputs declared by handler | Auth | Current response |
| --- | --- | --- | --- |
| `POST /products` | Body not parsed | Verified vendor | Not implemented: `500 {message:"Route not implemented"}` |
| `GET /products` | No query parsing | Public | Not implemented: `500 {message:"Route not implemented"}` |
| `GET /products/:uuid` | Path `uuid`; no validation | Public | Not implemented: `500 {message:"Route not implemented"}` |
| `PATCH /products/:uuid` | Path `uuid`; body not parsed | Verified vendor | Not implemented: `500 {message:"Route not implemented"}` |
| `DELETE /products/:uuid` | Path `uuid` | Verified vendor | Not implemented: `500 {message:"Route not implemented"}` |
| `GET /vendors/me/products` | No query parsing | Public (no middleware) | Not implemented: `500 {message:"Route not implemented"}` |
| `PATCH /products/:uuid/status` | Path `uuid`; body not parsed | Verified vendor | Not implemented: `500 {message:"Route not implemented"}` |
| `PATCH /products/:uuid/stock` | Path `uuid`; body not parsed | Verified vendor | Not implemented: `500 {message:"Route not implemented"}` |
| `POST /products/:uuid/images` | Path `uuid`; body not parsed | Verified vendor | Not implemented: `500 {message:"Route not implemented"}` |
| `DELETE /products/:uuid/images/:imageId` | Path `uuid`, `imageId` | Verified vendor | Not implemented: `500 {message:"Route not implemented"}` |
| `PUT /products/:uuid/images/reorder` | Path `uuid`; body not parsed | Verified vendor | Not implemented: `500 {message:"Route not implemented"}` |
| `GET /products/:uuid/reviews` | Path `uuid`; no query parsing | Public | Not implemented: `500 {message:"Route not implemented"}` |
| `GET /products/:uuid/related` | Path `uuid`; no query parsing | Public | Not implemented: `500 {message:"Route not implemented"}` |

## Authentication responses

Middleware may respond `401 {message:"No token provided"}` or `401 {message:"Invalid or expired token"}`. A non-vendor gets `403 {message:"Vendor access required"}`; a missing vendor profile gets `403 {message:"Vendor profile not found"}`; unverified KYC gets `403 {message:"Vendor must be verified to access this resource"}`.

> [!NOTE]
> The product route tests currently confirm auth requirements for `POST /products`; the handler itself remains a placeholder after the middleware passes.

