# API reference

The server mounts all routers at `/api/v1`. Choose a router page below; each page lists method, path, inputs, authentication, and observed responses.

## Router pages

| Router | Routes | Documentation |
| --- | ---: | --- |
| Auth | 8 | [auth.md](auth.md) |
| Admin | 29 | [admin.md](admin.md) |
| Vendors | 10 | [vendors.md](vendors.md) |
| Products | 13 | [products.md](products.md) |
| Categories | 3 | [categories.md](categories.md) |
| Uploads | 3 | [uploads.md](uploads.md) |
| Cart | 7 | [cart.md](cart.md) |
| Addresses | 5 | [addresses.md](addresses.md) |
| Coupons | 4 | [coupons.md](coupons.md) |
| Orders | 7 | [orders.md](orders.md) |
| Vendor orders | 6 | [vendor-orders.md](vendor-orders.md) |
| Payments | 8 | [payments.md](payments.md) |
| Reviews | 6 | [reviews.md](reviews.md) |
| Analytics | 0 | [analytics.md](analytics.md) |
| Search | 3 | [search.md](search.md) |

## Authentication

Protected handlers expect `Authorization: Bearer <JWT>`. The middleware reports `401 {"message":"No token provided"}` for a missing or non-Bearer header and `401 {"message":"Invalid or expired token"}` for an invalid token. Role middleware can return `403` with `Admin access required`, `Vendor access required`, `Vendor profile not found`, or `Vendor must be verified to access this resource`.

> [!IMPORTANT]
> A route is marked protected only when its implementation attaches authentication middleware. Do not infer protection from a route's name.

## Contract and status notes

- Implemented input validation uses Zod. Validation failures generally return `400 {"message":"Invalid parameters"}`; endpoint pages call out different messages and statuses.
- Placeholder handlers return the fixed `500` response documented above. Their request fields, query parameters, and success response are **not specified in current code**.
- Express's global error handler returns `500 {"message":"Something went wrong"}` for uncaught errors.
- Successful JSON examples show field shapes and representative values, not guaranteed literal values.

## Source of truth

Contracts were checked against `src/routes/*.ts`, `src/validators/*.ts`, `src/middleware/auth.ts`, and the route tests in `src/tests/*.test.ts`. Route tests cover auth, coupons, products, and vendors. For example, see [auth tests](../../src/tests/auth.test.ts), [coupon tests](../../src/tests/coupons.test.ts), [product tests](../../src/tests/products.test.ts), and [vendor tests](../../src/tests/vendors.test.ts).

