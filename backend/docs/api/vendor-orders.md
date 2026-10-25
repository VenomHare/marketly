# Vendor order routes

Base prefix: `/api/v1`. These route handlers currently declare no authentication or request parsing. Every route returns `500 {message:"Route not implemented"}`; success response shapes are undefined.

| Method and path | Inputs |
| --- | --- |
| `GET /vendor-orders` | None declared |
| `GET /vendor-orders/:uuid` | Path `uuid` |
| `PATCH /vendor-orders/:uuid/status` | Path `uuid`; body not parsed |
| `POST /vendor-orders/:uuid/shipment` | Path `uuid`; body not parsed |
| `PATCH /vendor-orders/:uuid/shipment` | Path `uuid`; body not parsed |
| `GET /vendor-orders/:uuid/history` | Path `uuid` |

