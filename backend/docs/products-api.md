# Products API

All endpoints use the `/api/v1` prefix. JSON request bodies must use `Content-Type: application/json`.

## Authentication

Routes marked **Verified vendor** require a bearer JWT for a vendor with a verified KYC profile. Routes marked **Vendor** require a vendor profile but do not require verified KYC. Public routes do not require authentication.

```http
Authorization: Bearer <token>
```

## Products

### `POST /products` — Verified vendor

Create a draft product for the authenticated vendor. `vendor_id`, status, rating, and timestamps are assigned by the server.

Request:

```json
{
  "category_id": "507f1f77bcf86cd799439011",
  "name": "Cotton shirt",
  "description": "A lightweight cotton shirt",
  "sku": "SHIRT-001",
  "price": 24.5,
  "stock": 12
}
```

All fields are required. Name, description, and SKU are trimmed; name is limited to 200 characters, description to 10,000, and SKU to 100. Price must be a positive finite number; stock must be a non-negative integer. The category ID must be a 24-character hex value and refer to an existing category. SKU values must be unique.

Returns `201` with the product, including `id`, `vendor_id`, category and product fields, `average_rating`, `review_count`, `status: "draft"`, and timestamps. Invalid input or category returns `400`; duplicate SKU returns `409`.

### `GET /products` — Public

List active products. Draft and archived products are omitted.

| Query | Default | Rules |
| --- | --- | --- |
| `page` | `1` | Positive integer |
| `limit` | `20` | Integer from 1 to 100 |
| `category_id` | — | Optional 24-character hex category ID |
| `search` | — | Optional text, case-insensitive match against name and description |
| `sort` | `newest` | `newest`, `price_asc`, or `price_desc` |

Returns `{ "products": [...], "pagination": { "page", "limit", "total", "total_pages" } }`. Invalid or unsupported query parameters return `400`.

### `GET /products/:uuid` — Public

Fetch one active product. Returns the product fields and timestamps. Invalid IDs return `400`; missing, draft, and archived products return `404`.

### `PATCH /products/:uuid` — Verified vendor, product owner

Partially update one non-archived product. Any non-empty subset of the `POST /products` fields may be supplied. The same field validation applies; `category_id` must exist, and SKU must remain unique. Ownership is checked before category or SKU lookups. The response contains the updated product. Invalid input returns `400`, duplicate SKU returns `409`, and missing or non-owned products return `404`.

### `DELETE /products/:uuid` — Verified vendor, product owner

Archive the product and return `204 No Content`. This preserves historical references. Missing, archived, and non-owned products return `404`; invalid IDs return `400`.

### `PATCH /products/:uuid/status` — Verified vendor, product owner

Set a non-archived product's status.

```json
{ "status": "active" }
```

Allowed values are `draft` and `active`; archiving uses `DELETE /products/:uuid`. Returns the updated product. Invalid input returns `400`; missing, archived, and non-owned products return `404`.

### `PATCH /products/:uuid/stock` — Verified vendor, product owner

Set stock to a non-negative integer. Zero is valid.

```json
{ "stock": 0 }
```

Returns the updated product. Invalid input returns `400`; missing, archived, and non-owned products return `404`.

## Product images

These endpoints create and remove image metadata records. They do not upload or delete the underlying storage object. Image keys must already be uploaded and use the authenticated vendor's `products/{vendorId}/` prefix.

### `POST /products/:uuid/image` — Verified vendor, product owner

Register an image on a non-archived product.

```json
{
  "object_key": "products/507f1f77bcf86cd799439012/shirt-front.jpg",
  "alt_text": "Front of the shirt"
}
```

`alt_text` is optional. Returns `201` with the image `id`, `product_id`, `object_key`, optional `alt_text`, and its `position`. New images are appended. Invalid fields or a key outside the vendor prefix return `400`; a duplicate key on the product returns `409`; missing, archived, and non-owned products return `404`.

### `DELETE /products/:uuid/image/:imageId` — Verified vendor, product owner

Remove the image metadata record from a non-archived product. Returns `204 No Content`. Invalid IDs return `400`; missing or non-owned products and images return `404`.

### `PUT /products/:uuid/images/reorder` — Verified vendor, product owner

Set image order by sending every image ID for the product exactly once. The array may contain up to 100 IDs. An empty array is valid only when the product has no images.

```json
{
  "image_ids": ["507f1f77bcf86cd799439014", "507f1f77bcf86cd799439013"]
}
```

Returns `{ "images": [...] }` in the new order, with positions reassigned from zero. Invalid, duplicate, missing, or foreign image IDs return `400`; missing, archived, and non-owned products return `404`.

## Vendor's products

### `GET /vendors/me/products` — Vendor

List all products owned by the authenticated vendor, including draft, active, and archived products. A vendor profile and active user account are required; pending KYC is allowed.

| Query | Default | Rules |
| --- | --- | --- |
| `page` | `1` | Positive integer |
| `limit` | `20` | Integer from 1 to 100 |

Returns `{ "products": [...], "pagination": { "page", "limit", "total", "pages" } }`. Invalid or unsupported query parameters return `400`; missing vendor profile returns `403`; inactive account returns `403`.

### `GET /vendors/:uuid/products` — Public

List active products for a verified vendor whose user account is active. Supports the same `page` and `limit` parameters as `GET /vendors/me/products`. Returns product summaries and `{ "pagination": { "page", "limit", "total", "pages" } }`. Invalid IDs or query parameters return `400`; an unverified, missing, or inactive vendor returns `404`.

## Reviews

### `GET /products/:uuid/reviews` — Public

List reviews for an active product, newest first. Reviewer and order IDs are not included.

| Query | Default | Rules |
| --- | --- | --- |
| `page` | `1` | Positive integer |
| `limit` | `20` | Integer from 1 to 100 |

Returns `{ "reviews": [{ "id", "rating", "title", "comment", "created_at" }], "pagination": { "page", "limit", "total", "pages" } }`. Products with no reviews return an empty list and `pages: 0`. Invalid query parameters or IDs return `400`; missing, draft, and archived products return `404`.

### `POST /products/:uuid/reviews` — Customer

Create a review for an active product the customer purchased in a paid, completed order. The request body requires `order_item_id`, an integer `rating` from 1 to 5, and a nonblank `comment`; `title` is optional. Only one review is allowed per order item. Returns `201` with the created review's public fields and updates the product's average rating and review count. Invalid IDs or bodies return `400`, inactive or missing products return `404`, ineligible purchases return `403`, and duplicate reviews return `409`.

### `GET /reviews/:uuid` — Public

Return a review's public fields. Reviewer and order IDs are omitted. Invalid IDs return `400`; missing reviews return `404`.

### `PATCH /reviews/:uuid` — Customer

Update an owned review. The body must include at least one of `rating` (integer from 1 to 5), `title` (1 to 200 characters), or `comment` (1 to 5,000 characters). Returns the updated public review and recalculates the product rating summary. Invalid IDs or bodies return `400`; non-owned or missing reviews return `404`.

### `DELETE /reviews/:uuid` — Customer

Delete an owned review. Returns `204` and recalculates the product rating summary. Invalid IDs return `400`; non-owned or missing reviews return `404`.

### `GET /users/me/reviews` — Customer

List the authenticated customer's reviews, newest first, with `page` and `limit` pagination (defaults to 1 and 20; maximum limit is 100). Reviewer and order IDs are omitted. Invalid query parameters return `400`.

## Related products

### `GET /products/:uuid/related` — Public

List active products in the same category, excluding the requested product. Results are ordered by average rating, review count, and creation time, descending.

| Query | Default | Rules |
| --- | --- | --- |
| `limit` | `10` | Integer from 1 to 50 |

Returns `{ "products": [...] }`. Invalid query parameters or IDs return `400`; missing, draft, and archived products return `404`. No matching products returns an empty list.

## Not implemented

The older plural image endpoints remain placeholders and return `500`:

- `POST /products/:uuid/images`
- `DELETE /products/:uuid/images/:imageId`

Use the singular image routes documented above.
