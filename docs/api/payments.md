---
layout: default
title: Payments
parent: API Reference
nav_order: 12
---

# Payments and refund requests

Base prefix: `/api/v1`. Payment routes use Razorpay. Authenticated customer routes require a customer bearer token; admin refund review routes require an admin bearer token.

Configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` in `backend/.env`. The example file leaves these values blank; use Razorpay test credentials for local payment testing.

## Payments

| Method and path | Access | Request | Success |
| --- | --- | --- | --- |
| `POST /payments/create` | Customer | `{ "payment_id": "<checkout payment id>" }` | `201` with Razorpay order ID, public key ID, amount in paise, currency, and payment details. Repeated calls return the existing Razorpay order. |
| `GET /payments/:uuid` | Owning customer | Payment ID | Payment details and the customer's latest refund request, if any. |
| `POST /payments/:uuid/verify` | Owning customer | `{ "razorpay_order_id": "...", "razorpay_payment_id": "...", "razorpay_signature": "..." }` | Marks a matching pending payment and order as paid after signature verification. |
| `POST /payments/:uuid/retry` | Owning customer | No body | Returns the current Razorpay order if one exists. If none exists, use `POST /payments/create`. |
| `POST /payments/:uuid/refund` | Owning customer | `{ "reason": "..." }` | `201` with a full payment refund request in `requested` status. No refund is sent to Razorpay at this stage. |
| `GET /payments/:uuid/refund` | Owning customer | Payment ID | Reads the most recent refund request for that payment. |
| `DELETE /payments/:uuid/refund` | Owning customer | Payment ID; empty body | Cancels the customer's most recent `requested` refund request. This is a soft delete recorded as `cancelled`; requests already in review cannot be withdrawn. |

The client must first complete checkout and use its returned payment ID. The server uses the stored payment amount and currency when creating the Razorpay order; client-supplied prices are not accepted.

## Refund request administration

| Method and path | Access | Request | Success |
| --- | --- | --- | --- |
| `GET /admin/refund-requests` | Admin | No inputs | Up to 100 refund requests, oldest first. |
| `GET /admin/refund-requests/:uuid` | Admin | Refund request ID | Reads one request, including review metadata and Razorpay refund ID when present. |
| `POST /admin/refund-requests/:uuid/approve` | Admin | Empty JSON object | Claims a pending request, sends the full refund to Razorpay, and returns `refunded` or `processing` depending on the provider response. |
| `POST /admin/refund-requests/:uuid/reject` | Admin | Empty JSON object | Changes a pending request to `rejected`. |

The approval route is protected by both `authenticate` and `requireAdmin`. It only claims requests in `requested` status, so concurrent approvals cannot both start a refund. The Razorpay refund call uses a stable idempotency key derived from the refund request ID. A request can be approved or rejected only once.

Refund request statuses are `requested`, `processing`, `refunded`, `failed`, `rejected`, and `cancelled`. A customer may have only one active refund request per payment; a new request can be made after a prior request was rejected, failed, or cancelled. The request history is retained for audit; deletion never removes the record.

## Database model

Refund requests are stored in the MongoDB `PaymentRefundRequest` collection. Each document records the payment, order, and customer IDs; the customer's reason; the full refund amount in integer paise; the request status; and creation/update timestamps. Admin review adds `reviewed_by` and `reviewed_at`. A completed Razorpay request stores its `provider_refund_id`.

| Field | Type | Required | Details |
| --- | --- | --- | --- |
| `payment_id` | String | Yes | ID of the associated `Payment`. |
| `order_id` | String | Yes | ID of the associated `Order`. |
| `user_id` | String | Yes | Customer who requested the refund. |
| `reason` | String | Yes | Trimmed, maximum 1,000 characters. |
| `amount_paise` | Number | Yes | Full refund amount copied from the stored payment. |
| `status` | String | Yes | `requested`, `processing`, `refunded`, `failed`, `rejected`, or `cancelled`; defaults to `requested`. |
| `provider_refund_id` | String | No | Razorpay refund ID, saved after provider acceptance. |
| `reviewed_by` | String | No | Admin user ID that approved or rejected the request. |
| `reviewed_at` | Date | No | When the admin reviewed the request. |
| `created_at`, `updated_at` | Date | Yes | Managed by Mongoose timestamps. |

The collection has a non-unique compound index on `{ payment_id, status }` for payment refund lookups. Application logic serializes request creation per payment and only approves or rejects records still in `requested` status. Refund requests are cancelled by changing their status to `cancelled`; records are retained for audit.

## Webhooks and other routes

| Method and path | Access | Details |
| --- | --- | --- |
| `POST /webhooks/razorpay` | Razorpay signature | Verifies the signature against the raw request body and handles duplicate event delivery idempotently. |
| `POST /webhooks/stripe` | Disabled | Returns `501`; Stripe is not enabled. |
| `GET /vendor/settlements` | Authenticated | Returns `501`; vendor settlements are not enabled. |

Payment amounts use integer paise and currency `INR`. Invalid input returns `400`; unauthenticated requests return `401`; requests for another customer's payment return `404`.
