# Checkout and order routes

Base prefix: `/api/v1`.

## `POST /checkout/preview`

Public guest-cart preview. Requires a JSON object with exactly the following fields:

```json
{
  "session_id": "guest-session-id-with-at-least-32-characters",
  "coupon_code": "SAVE10"
}
```

`coupon_code` is optional. `session_id` must be 32–200 characters with no surrounding whitespace. When present, `coupon_code` is trimmed and must contain 1–100 characters. Invalid bodies or unknown fields return `400 {"message":"Invalid request body"}`. Missing, expired, or customer-owned carts return `404 {"message":"Cart not found"}`.

The response includes `cart_id`, `valid`, `items`, `subtotal_paise`, `discount_paise`, `shipping_paise`, `total_paise`, and `coupon`. Each item reports current product name, SKU, unit price, quantity, line total, stock, availability, and a reason when unavailable. Missing or inactive products, invalid quantities or prices, insufficient stock, invalid line totals, and empty carts make the preview invalid. The preview does not mutate the cart or inventory.

If `coupon_code` is omitted, `coupon` is `null` and discount is zero. A coupon that fails its status, date, minimum-order, or global usage-limit checks produces `coupon.valid: false` and makes the preview invalid. A valid percentage coupon is rounded down to whole paise and capped by `max_discount_paise`; fixed and percentage discounts cannot exceed the subtotal. Unknown coupons are reported in the response rather than as an HTTP error. Shipping is currently returned as zero because no shipping charge rules are configured.

## `POST /checkout`

Requires a customer bearer token. Creates an order from either the customer's merged cart or a guest cart session. Requires exactly one of `cart_id` (a 24-character ID owned by the customer) or `session_id` (a 32–200 character guest cart session with no surrounding whitespace), plus a customer-owned `address_id` and an `idempotency_key` of 8–200 characters. `coupon_code` is optional and must contain 1–100 non-whitespace characters when supplied. Unknown fields, missing fields, or malformed values return `400 {"message":"Invalid request body"}`. Non-customer roles receive `403 {"message":"Customer access required"}`.

The handler rejects missing carts or addresses with 404, empty carts or unavailable products with 409, and invalid coupons with 400. It rechecks product status, price, quantity, and stock, then atomically creates the pending order, item snapshots, a `created` Razorpay payment record, inventory movements, and any coupon redemption. It decrements stock and removes the cart as part of the same transaction. Repeating a request with the same idempotency key returns the existing order and payment without decrementing stock twice; reusing another customer's key returns 409. Concurrent checkouts for the same cart or coupon are serialized; lock contention returns 409 and unavailable Redis locking returns 503.

Success returns `201` with `order` (`id`, `status`, `subtotal_paise`, `discount_paise`, `shipping_paise`, `total_paise`) and `payment` (`id`, `status`, `amount_paise`, `currency`). A replay returns `200` with the existing order and payment IDs. Shipping is currently zero. The handler creates a local payment record; it does not return a provider order ID.

## `GET /orders`

Requires a customer bearer token. Returns only the authenticated customer's order summaries, newest first. Each order includes `id`, `status`, `payment_status`, `subtotal_paise`, `discount_paise`, `shipping_paise`, `total_paise`, `created_at`, and `updated_at`. Address snapshots and customer IDs are not included in the list response.

| Query | Type | Default | Constraints |
| --- | --- | --- | --- |
| `page` | integer | `1` | At least `1`; page offset must be a safe integer |
| `limit` | integer | `20` | `1` through `100` |

Unknown query parameters and invalid values return `400 {"message":"Invalid parameters"}`. The response contains `orders` and `pagination` (`page`, `limit`, `total`, `total_pages`); an empty history has `total_pages: 0`. Other roles receive `403 {"message":"Customer access required"}`.

## `GET /orders/:uuid`

Requires a customer bearer token and returns details only when the order belongs to that customer. `uuid` must be a 24-character hexadecimal MongoDB ID; invalid IDs return `400 {"message":"Invalid order id"}`. Missing and other customers' orders both return `404 {"message":"Order not found"}`. Query parameters are unsupported and return `400`.

The response contains `order` details with the saved address snapshot and amount/status fields, an `items` array with product and price snapshots, and the latest `payment` summary. `payment` is `null` when the order has no payment record. Provider payment IDs, provider order IDs, idempotency keys, user IDs, and Mongo internal fields are omitted.

## `POST /orders/:uuid/cancel`

Requires a customer bearer token. No request body or query parameters are accepted. Invalid 24-character hexadecimal IDs return `400 {"message":"Invalid order id"}`; missing and foreign orders both return `404 {"message":"Order not found"}`. Other roles receive `403 {"message":"Customer access required"}`.

Only pending orders without a successful or processing payment can be cancelled. A successful cancellation returns `200` with the order ID and its new `cancelled` status. The handler atomically restores item stock, records cancellation inventory movements, marks created/failed payment records failed, removes coupon redemption usage, and updates the order payment status to failed. Orders already paid, processing, completed, or cancelled return `409`. Concurrent order mutations are serialized; lock contention returns `409` and unavailable Redis locking returns `503`.

## `POST /orders/:uuid/return`

Requires a customer bearer token. Accepts a JSON object with exactly one field: `reason`, a trimmed string containing 1–1000 characters. Invalid IDs return `400 {"message":"Invalid order id"}`; malformed bodies or query parameters return `400`. Missing and foreign orders both return `404 {"message":"Order not found"}`.

Returns are accepted only for completed orders with paid status. Other order states return `409 {"message":"Order is not eligible for return"}`. Only one return request can be created per order; duplicates or concurrent order mutations return `409`. Success returns `201` with `return_request` (`id`, `order_id`, `reason`, `status`, `created_at`), initially in `requested` status. The request is stored separately and does not change the order state. Unavailable Redis locking returns `503`.

## `GET /orders/:uuid/tracking`

Requires a customer bearer token and returns tracking only for an order owned by that customer. Invalid IDs return `400 {"message":"Invalid order id"}`; missing and foreign orders both return `404 {"message":"Order not found"}`. Query parameters are unsupported and return `400`.

The response contains `order_id`, `order_status`, and `vendor_orders`. Each vendor order includes its fulfillment status, timestamps, shipment records (`carrier`, `tracking_number`, `tracking_url`, `shipped_at`, `delivered_at`), and chronological status history (`previous_status`, `new_status`, `created_at`). Vendor IDs and status actor IDs are omitted. Orders without vendor fulfillment records return an empty `vendor_orders` array.

## Remaining routes

The following handlers remain placeholders and return `500 {"message":"Route not implemented"}`. Their success contracts and inputs are not defined in the current implementation.

| Method and path | Inputs |
| --- | --- |
