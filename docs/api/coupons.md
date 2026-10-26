# Coupon routes

Base prefix: `/api/v1`.

## `GET /coupons`

Public. Lists coupons where `is_active` is true, `starts_at` is at or before the current time, and `expires_at` is in the future. Results sort by earliest expiry, then ID.

| Query | Type | Default | Constraints |
| --- | --- | --- | --- |
| `page` | integer | `1` | At least `1` |
| `limit` | integer | `20` | `1` through `100` |

Unknown query parameters and invalid values return `400 {"message":"Invalid parameters"}`. The response includes a `coupons` array and `pagination` (`page`, `limit`, `total`, `total_pages`). Coupon objects expose `id`, `code`, `discount_type`, `discount_value`, optional `max_discount_paise`, `min_order_paise`, and `usage_limit`, plus `starts_at`, `expires_at`, and `is_active`.

## `GET /coupons/:uuid`

Public. `uuid` must be a 24-character hexadecimal MongoDB ID; malformed IDs return `400 {"message":"Invalid coupon id"}`. The route returns the same coupon fields as the list route, but only for a coupon that is active and within its validity dates. A missing or unavailable coupon returns `404 {"message":"Coupon not found"}`.

## `POST /coupons/validate`

Public. Requires a JSON object with exactly these fields:

```json
{
  "code": "SAVE10",
  "subtotal_paise": 20000
}
```

`code` is trimmed and looked up case-insensitively; it must contain 1–100 characters. `subtotal_paise` must be a nonnegative safe integer. Missing, malformed, or unknown fields return `400 {"message":"Invalid request body"}`.

Coupon business validation failures return HTTP 200 with `{ "valid": false, "message": "..." }`. These include an unknown, inactive, not-yet-started, expired, below-minimum, or usage-exhausted coupon. A valid coupon returns `{ "valid": true, "coupon_id": "...", "code": "...", "discount_paise": 0 }`. Percentage discounts are rounded down to whole paise, capped by `max_discount_paise` when set, and never exceed the subtotal. Fixed discounts are also capped at the subtotal.

## `GET /users/me/coupons`

Requires a customer bearer token. Other roles receive `403 {"message":"Customer access required"}`; missing or invalid tokens receive `401` from authentication middleware.

Returns the authenticated customer's coupon redemption history, newest first. Each `coupons` entry contains the redemption `id`, `coupon_id`, `code`, `order_id`, `discount_paise`, and `redeemed_at`. If a coupon record has since been removed, `code` is `null` while the redemption remains in history.

| Query | Type | Default | Constraints |
| --- | --- | --- | --- |
| `page` | integer | `1` | `1` through `Number.MAX_SAFE_INTEGER` |
| `limit` | integer | `20` | `1` through `100` |

Unknown query parameters and invalid values return `400 {"message":"Invalid parameters"}`. The response includes `pagination` (`page`, `limit`, `total`, `total_pages`); an empty history has `total_pages: 0`.

Unexpected database failures return `500` with a route-specific failure message.
