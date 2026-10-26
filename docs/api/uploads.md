# Upload routes

Base prefix: `/api/v1`. Upload sessions are cached in Redis; configure `REDIS_URL`. All upload session routes require a vendor bearer token.

| Method and path | Inputs |
| --- | --- |
| `POST /uploads/presigned-url` | Authenticated vendor; create with `{ "purpose": "kyc", "content_type": "image/jpeg" }` or `{ "purpose": "product", "product_id": "...", "content_type": "image/png" }`; refresh with `{ "upload_id": "..." }` |
| `POST /uploads/confirm` | Authenticated owner; body `{ "upload_id": "..." }` |
| `DELETE /uploads/:uuid` | Authenticated owner; `uuid` is the upload session ID; only `issued` sessions can be deleted |

## Frontend upload workflow

1. When the user selects a file, request a session from `POST /uploads/presigned-url`. For product images, include `product_id`; for KYC documents use `purpose: "kyc"`. Supported content types are JPEG, PNG, and WebP. Product uploads require a verified vendor who owns a non-archived product.
2. Persist `upload_id` and `object_key` with the form draft. Treat `upload_url` as a short-lived secret: do not put it in durable draft storage. It expires after at most 600 seconds. The Redis session lasts up to 2 hours.
3. PUT the file bytes directly to `upload_url` with the exact `Content-Type` used to request the URL. Do not send the vendor JWT to object storage.
4. If the URL expires while the form remains open, request `POST /uploads/presigned-url` again with `{ "upload_id": "..." }`. This refreshes the URL for the same key; it does not create a second object or extend the 2-hour session.
5. After the PUT succeeds, call `POST /uploads/confirm` with the `upload_id`. The server checks the stored object’s content type and size (1 byte to 10 MiB) and makes confirmation idempotent. Then submit `object_key` to the relevant product image or KYC form endpoint.
6. If the user removes a file before confirmation, call `DELETE /uploads/{upload_id}` after the last issued URL expires. The endpoint rejects deletion while any issued URL may still work, then deletes the object and cache entry. Confirmed sessions cannot be deleted through this endpoint. The product image delete route removes its metadata record but does not delete the underlying object. KYC documents submitted for review are retained for the review/audit lifecycle.

Sessions are bound to the authenticated user and vendor. Redis expires them after 2 hours. Redis expiry does not delete the corresponding S3/R2 object; operational cleanup must compare old session keys with product image and KYC document records before removing unreferenced objects. The frontend should keep drafts resumable only during the 2-hour session window and restart the upload after expiry. Presigned PUT URLs remain usable until their expiry, even after confirmation; do not persist or expose them, and wait for expiry before deleting an issued session. Invalid bodies return `400`, unauthenticated requests return `401`, vendor/profile or verification failures return `403`, and missing or non-owned products/sessions return `404`. Expired sessions return `410` when still present in Redis (otherwise `404`); incomplete uploads return `409` from confirmation and while an issued URL is still active for deletion. The confirm endpoint rejects mismatched or oversized objects with `400`.

