---
layout: default
title: Backend overview
nav_order: 2
---

# Marketly backend documentation

This site documents the Express API mounted at `/api/v1` and maps the backend source layout. It is built with Jekyll and the Just the Docs theme.

## Local infrastructure

Start MongoDB, Elasticsearch, and Redis from the repository root with:

```sh
docker compose --env-file backend/.env.example up -d
```

The example file contains development-only credentials and connection URLs. Copy it to `backend/.env` for the backend application. Elasticsearch may require `vm.max_map_count=262144` on Linux hosts.

To publish this documentation, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. The workflow in `.github/workflows/pages.yml` builds the Jekyll site from this `docs/` directory and deploys it to `https://venomhare.github.io/marketly/`. To preview it locally, run `bundle install` and `bundle exec jekyll serve` from `docs/`.

The backend uses MongoDB as its source of truth, Redis for selected locks and upload sessions, and authenticated Elasticsearch for product search. Elasticsearch product documents are updated after product and review writes. Failed index operations retry in process memory; existing records need a future reindex operation, and retry state does not survive an API restart. See [search indexing](api/search.html#indexing-and-synchronization) for current coverage and limits. Razorpay credentials are provided as blank placeholders in the example environment file.

Checkout and cart merging use MongoDB transactions. Run the MongoDB service from this Compose file, which initializes a single-node `rs0` replica set; a standalone local `mongod` will fail those routes with `Transaction numbers are only allowed on a replica set member or mongos`.

## Browse the API

- [API index]({{ site.baseurl }}/api/) — endpoint catalog grouped by router.
- [Authentication](api/auth.html)
- [Administration](api/admin.html)
- [Vendors](api/vendors.html)
- [Products](api/products.html)
- [Categories](api/categories.html)
- [Uploads](api/uploads.html)
- [Cart](api/cart.html)
- [Addresses](api/addresses.html)
- [Coupons](api/coupons.html)
- [Orders and checkout](api/orders.html)
- [Vendor orders](api/vendor-orders.html)
- [Payments](api/payments.html)
- [Reviews](api/reviews.html)
- [Search](api/search.html)

## Source map

| Folder | Contents | Documentation |
| --- | --- | --- |
| `src/routes/` | Express router modules | [Router docs]({{ site.baseurl }}/api/) |
| `src/validators/` | Zod request validators | [Contract notes]({{ site.baseurl }}/api/#contract-and-status-notes) |
| `src/middleware/` | Authentication and role checks | [Authentication](api/auth.html#authentication) |
| `src/models/` | Mongoose persistence models | [API index]({{ site.baseurl }}/api/) |
| `src/utils/elasticsearch.ts` | Elasticsearch transport, product mappings, document writes, and retry queue | [Search indexing](api/search.html#indexing-and-synchronization) |
| `src/tests/` | Vitest route coverage | [Test coverage notes]({{ site.baseurl }}/api/#source-of-truth) |

## Conventions

- Every endpoint path below includes the `/api/v1` prefix.
- JSON request bodies use `Content-Type: application/json` unless a route states otherwise.
- `:uuid`, `:itemId`, and `:imageId` are path parameters. Their exact validation is documented only where implementation defines it.
- `—` means the handler does not read that input in its current implementation.
- **Not implemented** means the handler currently returns HTTP `500` with `{"message":"Route not implemented"}`. No success contract is defined yet.

> [!NOTE]
> These pages describe the current code and tests. They do not imply intended future behavior for placeholder handlers.

