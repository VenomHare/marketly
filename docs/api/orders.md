# Checkout and order routes

Base prefix: `/api/v1`. No auth middleware, input parsing, or success contract is currently defined. Each handler returns `500 {message:"Route not implemented"}`.

| Method and path | Inputs |
| --- | --- |
| `POST /checkout/preview` | Body not parsed |
| `POST /checkout` | Body not parsed |
| `GET /orders` | None declared |
| `GET /orders/:uuid` | Path `uuid` |
| `POST /orders/:uuid/cancel` | Path `uuid`; body not parsed |
| `POST /orders/:uuid/return` | Path `uuid`; body not parsed |
| `GET /orders/:uuid/tracking` | Path `uuid` |

