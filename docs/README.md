# Marketly backend documentation

This documentation describes the Express API mounted at `/api/v1` and the source layout. GitHub renders these relative links and the heading outline for navigation.

## Local infrastructure

Start MongoDB, Elasticsearch, and Redis from the repository root with:

```sh
docker compose --env-file backend/.env.example up -d
```

The example file contains development-only credentials and connection URLs. Copy it to `backend/.env` for the backend application. Elasticsearch may require `vm.max_map_count=262144` on Linux hosts.

Checkout and cart merging use MongoDB transactions. Run the MongoDB service from this Compose file, which initializes a single-node `rs0` replica set; a standalone local `mongod` will fail those routes with `Transaction numbers are only allowed on a replica set member or mongos`.

## Browse the API

- [API index](api/README.md) — endpoint catalog grouped by router.
- [Authentication](api/auth.md)
- [Administration](api/admin.md)
- [Vendors](api/vendors.md)
- [Products](api/products.md)
- [Categories](api/categories.md)
- [Uploads](api/uploads.md)
- [Cart](api/cart.md)
- [Addresses](api/addresses.md)
- [Coupons](api/coupons.md)
- [Orders and checkout](api/orders.md)
- [Vendor orders](api/vendor-orders.md)
- [Payments](api/payments.md)
- [Reviews](api/reviews.md)
- [Search](api/search.md)

## Source map

| Folder | Contents | Documentation |
| --- | --- | --- |
| `src/routes/` | Express router modules | [Router docs](api/README.md) |
| `src/validators/` | Zod request validators | [Contract notes](api/README.md#contract-and-status-notes) |
| `src/middleware/` | Authentication and role checks | [Authentication](api/auth.md#authentication) |
| `src/models/` | Mongoose persistence models | [API index](api/README.md) |
| `src/tests/` | Vitest route coverage | [Test coverage notes](api/README.md#source-of-truth) |

## Conventions

- Every endpoint path below includes the `/api/v1` prefix.
- JSON request bodies use `Content-Type: application/json` unless a route states otherwise.
- `:uuid`, `:itemId`, and `:imageId` are path parameters. Their exact validation is documented only where implementation defines it.
- `—` means the handler does not read that input in its current implementation.
- **Not implemented** means the handler currently returns HTTP `500` with `{"message":"Route not implemented"}`. No success contract is defined yet.

> [!NOTE]
> These pages describe the current code and tests. They do not imply intended future behavior for placeholder handlers.

