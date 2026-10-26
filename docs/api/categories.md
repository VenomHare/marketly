# Category routes

Base prefix: `/api/v1`. Handlers are public. `GET /categories/:uuid/products` is implemented; it returns active products only. The remaining listed route returns `500 {message:"Route not implemented"}`.

| Method and path | Inputs |
| --- | --- |
| `GET /categories` | No inputs; returns `{ "categories": [{ "id", "name", "slug", "parent_id?" }] }` sorted by name |
| `GET /categories/:uuid` | 24-character hex category ID; returns `{ "id", "name", "slug", "parent_id?" }`; invalid IDs return `400`, missing categories return `404` |
| `GET /categories/:uuid/products` | 24-character hex category ID; optional `page` (default 1) and `limit` (default 20, max 100); returns active products sorted newest first with `{ "pagination": { "page", "limit", "total", "total_pages" } }`; invalid IDs or query parameters return `400`, missing categories return `404` |

