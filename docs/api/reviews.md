---
layout: default
title: Reviews
parent: API Reference
nav_order: 13
---

# Review routes

Base prefix: `/api/v1`.

| Method and path | Inputs |
| --- | --- |
| `POST /products/:uuid/reviews` | Path `uuid`; authenticated customer; body: `order_item_id`, `rating` (1–5), `comment`, optional `title`; requires a paid, completed purchase by the customer; one review per order item |
| `GET /products/:uuid/reviews` | Path `uuid` |
| `GET /reviews/:uuid` | Path `uuid`; public; returns review fields without user or order IDs |
| `PATCH /reviews/:uuid` | Authenticated customer; own review only; accepts one or more of `rating` (1–5), `title`, `comment` |
| `DELETE /reviews/:uuid` | Authenticated customer; own review only; returns `204` |
| `GET /users/me/reviews` | Authenticated customer; optional `page` (default 1) and `limit` (default 20, max 100); returns only the customer's reviews, newest first |

