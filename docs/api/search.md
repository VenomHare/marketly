---
layout: default
title: Search
parent: API Reference
nav_order: 14
---

# Search routes

Base prefix: `/api/v1`. All routes are public and query Elasticsearch's `products` index. MongoDB remains the source of truth for product records.

## `GET /search/products`

Search active products. With no `q`, the route browses active products and applies any filters.

| Query | Default | Rules |
| --- | --- | --- |
| `q` | — | Optional trimmed text, 1–200 characters; searches name, description, and SKU, with name weighted higher |
| `category` | — | Optional exact `category_id` value, up to 100 characters |
| `minPrice` | — | Optional finite number, at least 0 |
| `maxPrice` | — | Optional finite number, at least 0; must be greater than or equal to `minPrice` |
| `sortBy` | `relevance` | `relevance`, `price`, or `created_at` |
| `order` | `asc` | `asc` or `desc`; relevance is always sorted by descending relevance score |
| `page` | `1` | Integer from 1 to 100,000 |
| `limit` | `20` | Integer from 1 to 100 |

Example:

```http
GET /api/v1/search/products?q=keyboard&category=507f1f77bcf86cd799439011&minPrice=500&maxPrice=5000&sortBy=price&order=asc&page=1&limit=20
```

Success returns `{ "products": [...], "total": 42, "page": 1, "limit": 20, "totalPages": 3 }`. An empty search returns an empty `products` array and `totalPages: 0`. Invalid, repeated, or unsupported query parameters return `400`; a reversed price range returns `400 { "message": "minPrice must not exceed maxPrice" }`. Elasticsearch errors or malformed responses return `502 { "message": "Product search is temporarily unavailable" }`.

## `GET /search/suggestions`

| Query | Default | Rules |
| --- | --- | --- |
| `q` | Required | Trimmed prefix, 1–100 characters |
| `limit` | `10` | Integer from 1 to 20 |

Uses name prefix matching on active products and returns distinct nonblank names as `{ "suggestions": ["Mechanical Keyboard", "Mechanical Keyboard Case"] }`. Invalid or unsupported parameters return `400`; Elasticsearch errors return `502 { "message": "Search suggestions are temporarily unavailable" }`.

## `GET /search/trending`

| Query | Default | Rules |
| --- | --- | --- |
| `limit` | `10` | Integer from 1 to 50 |

Returns `{ "products": [...] }` for active products, ranked by review count, average rating, then creation date, all descending. This is the current popularity proxy; it does not use recent sales or search activity. Invalid or unsupported parameters return `400`; Elasticsearch errors return `502 { "message": "Trending products are temporarily unavailable" }`.

## Indexing and synchronization

The first product write creates the `products` index with explicit mappings. Product creation, edits, status changes, and vendor stock updates upsert the MongoDB product into Elasticsearch. Archiving through `DELETE /products/:uuid` removes its search document. Review creation, edit, and deletion refresh indexed rating and review-count fields.

MongoDB writes remain successful if Elasticsearch is unavailable. The failed index operation is logged and retried by an in-memory queue with increasing delays. Pending retries are lost if the API process restarts. Existing MongoDB products are not backfilled automatically, and order-driven stock changes are not currently synchronized. There is no implemented admin reindex or index-status route.

Configure `ELASTICSEARCH_URL`, `ELASTICSEARCH_USERNAME`, and `ELASTICSEARCH_PASSWORD` as shown in [`backend/.env.example`](https://github.com/VenomHare/marketly/blob/main/backend/.env.example). Local Compose uses an authenticated HTTPS Elasticsearch service.
