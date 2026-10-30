---
layout: default
title: API Reference
nav_order: 3
has_children: true
permalink: /api/
---

# API reference

The server mounts all routers at `/api/v1`. Choose a router page below; each page lists method, path, inputs, authentication, and observed responses.

## Router pages

| Router | Routes | Documentation |
| --- | ---: | --- |
| Auth | 8 | [auth](auth.html) |
| Admin | 29 | [admin](admin.html) |
| Vendors | 10 | [vendors](vendors.html) |
| Products | 13 | [products](products.html) |
| Categories | 3 | [categories](categories.html) |
| Uploads | 3 | [uploads](uploads.html) |
| Cart | 11 | [cart](cart.html) |
| Addresses | 5 | [addresses](addresses.html) |
| Coupons | 4 | [coupons](coupons.html) |
| Orders | 7 | [orders](orders.html) |
| Vendor orders | 6 | [vendor-orders](vendor-orders.html) |
| Payments | 8 | [payments](payments.html) |
| Reviews | 6 | [reviews](reviews.html) |
| Search | 3 | [search](search.html) |

## Authentication

Protected handlers expect `Authorization: Bearer <JWT>`. The middleware reports `401 {"message":"No token provided"}` for a missing or non-Bearer header and `401 {"message":"Invalid or expired token"}` for an invalid token. Role middleware can return `403` with `Admin access required`, `Vendor access required`, `Vendor profile not found`, or `Vendor must be verified to access this resource`.

Routes are marked protected only when their implementation attaches authentication middleware. The route tables document the middleware attached to each endpoint.

## Contract and status notes

- Implemented input validation uses Zod. Validation failures generally return `400 {"message":"Invalid parameters"}`; endpoint pages call out different messages and statuses.
- Placeholder handlers return the fixed `500` response documented above. Their request fields, query parameters, and success response are **not specified in current code**.
- Express's global error handler returns `500 {"message":"Something went wrong"}` for uncaught errors.
- Successful JSON examples show field shapes and representative values, not guaranteed literal values.

## Source of truth

Contracts were checked against `backend/src/routes/*.ts`, `backend/src/validators/*.ts`, `backend/src/middleware/auth.ts`, and route tests in `backend/src/tests/*.test.ts`. For example, see [auth tests](https://github.com/VenomHare/marketly/blob/main/backend/src/tests/auth.test.ts), [coupon tests](https://github.com/VenomHare/marketly/blob/main/backend/src/tests/coupons.test.ts), [order tests](https://github.com/VenomHare/marketly/blob/main/backend/src/tests/orders.test.ts), [product tests](https://github.com/VenomHare/marketly/blob/main/backend/src/tests/products.test.ts), [search tests](https://github.com/VenomHare/marketly/blob/main/backend/src/tests/search.test.ts), [Elasticsearch indexing tests](https://github.com/VenomHare/marketly/blob/main/backend/src/tests/elasticsearch-index.test.ts), and [vendor tests](https://github.com/VenomHare/marketly/blob/main/backend/src/tests/vendors.test.ts).

