# Vendor order routes

Base prefix: `/api/v1`. Every route requires an authenticated vendor with a vendor profile and an active user account. Vendors can access only their own fulfillment orders. Missing credentials return `401`; invalid tokens return `401`; other roles or vendors without a profile return `403`; suspended or missing user accounts return `403 {"message":"Active vendor account required"}`.

Order `uuid` path parameters are 24-character hexadecimal MongoDB IDs. Invalid IDs return `400 {"message":"Invalid parameters"}`. Orders that do not exist or belong to another vendor both return `404 {"message":"Vendor order not found"}`.

## `GET /vendor-orders`

Lists the authenticated vendor's orders newest first. Each order contains `id`, `order_id`, `status`, `items`, `created_at`, and `updated_at`. Items contain `product_id`, `product_name`, `sku`, `unit_price_paise`, `quantity`, `discount_paise`, and `line_total_paise`.

| Query | Type | Default | Constraints |
| --- | --- | --- | --- |
| `page` | integer | `1` | At least `1` |
| `limit` | integer | `20` | `1` through `100` |

Unknown query parameters and invalid values return `400 {"message":"Invalid parameters"}`. The response includes `orders` and `pagination` (`page`, `limit`, `total`, `pages`). An empty list has `pages: 0`.

## `GET /vendor-orders/:uuid`

Returns one vendor-owned fulfillment order, its item snapshots, and its shipment. The response contains `id`, `order_id`, `status`, `items`, `shipment`, `created_at`, and `updated_at`. `shipment` is `null` when none exists; otherwise it contains `id`, `carrier`, `tracking_number`, `tracking_url`, `shipped_at`, and `delivered_at`. Vendor IDs and internal Mongo fields are omitted.

## `PATCH /vendor-orders/:uuid/status`

Accepts exactly one JSON field, `status`, with one of `packed`, `shipped`, `in_transit`, `delivered`, or `cancelled`. A successful update returns `id`, `status`, and `updated_at`, and records the previous and new status in order history with the acting user ID.

Allowed transitions:

| Current status | Allowed next statuses |
| --- | --- |
| `placed` | `packed`, `cancelled` |
| `packed` | `shipped`, `cancelled` |
| `shipped` | `in_transit` |
| `in_transit` | `delivered` |
| `delivered` | None |
| `cancelled` | None |

Malformed bodies, unknown fields, and unsupported statuses return `400 {"message":"Invalid parameters"}`. A valid status that is not an allowed next step returns `409 {"message":"Invalid status transition"}`.

## `POST /vendor-orders/:uuid/shipment`

Creates the order's shipment. Accepts a JSON object with required `tracking_number` (1–200 trimmed characters) and optional `carrier` (1–100 trimmed characters), `tracking_url` (HTTP or HTTPS URL, up to 2048 characters), `shipped_at`, and `delivered_at` (ISO date-time strings with a timezone offset). Unknown fields are rejected.

Success returns `201` with a `shipment` object containing `id` and the supplied shipment fields. Invalid bodies return `400 {"message":"Invalid parameters"}`. If a shipment already exists, the route returns `409 {"message":"Shipment already exists"}`.

## `PATCH /vendor-orders/:uuid/shipment`

Updates an existing shipment. Accepts any non-empty subset of the fields supported by `POST /vendor-orders/:uuid/shipment`; unknown fields and invalid values return `400 {"message":"Invalid parameters"}`. Success returns the updated `shipment` object. If the vendor order exists but has no shipment, the route returns `404 {"message":"Shipment not found"}`.

## `GET /vendor-orders/:uuid/history`

Returns `{ "history": [...] }` with status changes in chronological order. Each entry contains `id`, `previous_status` (or `null` when absent), `new_status`, and `created_at`. Actor user IDs are omitted. Orders without status changes return an empty `history` array.
