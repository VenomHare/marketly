# Demo seed credentials

All seeded accounts use the same password: `MarketlyDemo!2026`

These are local/demo credentials. Change them before using this database in a shared or production environment.

## Admin

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@marketly.demo` | `MarketlyDemo!2026` |

## Customers

| Role | Email | Password |
| --- | --- | --- |
| Customer | `customer01@marketly.demo` | `MarketlyDemo!2026` |
| Customer | `customer02@marketly.demo` | `MarketlyDemo!2026` |
| Customer | `customer03@marketly.demo` | `MarketlyDemo!2026` |
| Customer | `customer04@marketly.demo` | `MarketlyDemo!2026` |
| Customer | `customer05@marketly.demo` | `MarketlyDemo!2026` |
| Customer | `customer06@marketly.demo` | `MarketlyDemo!2026` |
| Customer | `customer07@marketly.demo` | `MarketlyDemo!2026` |
| Customer | `customer08@marketly.demo` | `MarketlyDemo!2026` |
| Customer | `customer09@marketly.demo` | `MarketlyDemo!2026` |
| Customer | `customer10@marketly.demo` | `MarketlyDemo!2026` |

## Vendors

| Role | Email | Password |
| --- | --- | --- |
| Vendor 1 | `vendor01@marketly.demo` | `MarketlyDemo!2026` |
| Vendor 2 | `vendor02@marketly.demo` | `MarketlyDemo!2026` |
| Vendor 3 | `vendor03@marketly.demo` | `MarketlyDemo!2026` |
| Vendor 4 | `vendor04@marketly.demo` | `MarketlyDemo!2026` |
| Vendor 5 | `vendor05@marketly.demo` | `MarketlyDemo!2026` |
| Vendor 6 | `vendor06@marketly.demo` | `MarketlyDemo!2026` |
| Vendor 7 | `vendor07@marketly.demo` | `MarketlyDemo!2026` |
| Vendor 8 | `vendor08@marketly.demo` | `MarketlyDemo!2026` |
| Vendor 9 | `vendor09@marketly.demo` | `MarketlyDemo!2026` |
| Vendor 10 | `vendor10@marketly.demo` | `MarketlyDemo!2026` |

## Run

From `backend/`, set `MONGODB_URI`, `JWT_SECRET` (used to encrypt demo vendor bank details), and the Elasticsearch connection settings (`ELASTICSEARCH_URL`, plus credentials if required). Elasticsearch must be reachable; the seed resets its `products` index before dropping MongoDB, then indexes and verifies every active product:

```sh
SEED_ALLOW_RESET=true npm run seed
```

The script drops the connected database before inserting demo data. It inserts 50 products (five per category), and placeholder product image object keys that can be replaced after uploading real images.
