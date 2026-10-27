---
layout: default
title: Cart
parent: API Reference
nav_order: 7
---

# Cart routes

Base prefix: `/api/v1`. Guest cart routes use a `session_id`; `POST /cart/merge` additionally requires customer authentication. `GET /cart` accepts an optional guest `session_id` query parameter.

| Method and path | Inputs |
| --- | --- |
| `GET /cart` | Optional `session_id` query parameter (1–200 characters) |
| `POST /cart/items` | JSON body: `session_id`, `product_id`, `quantity` |
| `PATCH /cart/items/:itemId` | Path `itemId`; JSON body: `session_id`, `quantity` |
| `DELETE /cart/items/:itemId` | Path `itemId`; required `session_id` query parameter |
| `DELETE /cart` | Required `session_id` query parameter |
| `POST /cart/merge` | Customer bearer token; JSON body: `session_id` |
| `POST /cart/validate` | JSON body: `session_id` |

`GET /cart` returns `{ "cart": null, "items": [] }` when no session is supplied, no matching cart exists, or the matching cart has expired. For an active cart it returns the cart and its items ordered by `added_at`. Repeated `session_id` parameters, blank or oversized values, and unsupported query parameters return `400`.

`POST /cart/items` requires a guest `session_id` (1–200 characters), a valid `product_id`, and a positive safe integer `quantity`. It creates the cart if needed, adds an available active product, and increments its existing line quantity on repeated adds. The combined quantity cannot exceed stock. It returns `201` for a new line, `200` for an increment, `400` for invalid input, `404` for an unknown product, and `409` for unavailable products or insufficient stock.

`PATCH /cart/items/:itemId` sets a line's quantity for the guest cart identified by `session_id`. Quantity must be a positive safe integer and cannot exceed the product's current stock. `DELETE /cart/items/:itemId` removes a line from the cart identified by the `session_id` query parameter and returns `204` on success. Both routes return `404` when the item does not belong to the supplied session; malformed IDs or inputs return `400`.

`DELETE /cart` removes all items from the active cart identified by `session_id` and returns `204`. The cart itself remains available as an empty cart. Missing or expired carts return `404`; missing, malformed, repeated, or unsupported query parameters return `400`.

`POST /cart/merge` requires a customer bearer token and a guest `session_id` between 32 and 200 characters, with no surrounding whitespace. It merges into that authenticated customer's active cart, never a cart ID supplied by the caller. Existing quantities are combined up to current stock. Unavailable products and quantities that cannot fit are reported in `skipped` or `partial`; those source lines remain in the guest cart for review. The source and destination updates commit in one MongoDB transaction, so a failed merge cannot duplicate transferred quantities on retry. MongoDB must support transactions. Missing or expired guest carts return `404`; unauthenticated requests return `401`, and non-customer roles return `403`.

`POST /cart/validate` accepts the same length-limited guest `session_id` and returns current product prices, stock, per-line availability, and a subtotal without changing the cart. Missing or expired carts return `404`. Empty carts are valid with a zero subtotal. Invalid quantities, missing or inactive products, and insufficient stock mark the result invalid with a reason on the affected line. For guest cart operations, use a cryptographically random session ID of at least 32 characters; it acts as a bearer credential.

