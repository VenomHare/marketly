# Payment and settlement routes

Base prefix: `/api/v1`. No route currently declares authentication, parses an input body, or defines a success response. Every handler returns `500 {message:"Route not implemented"}`.

| Method and path | Inputs |
| --- | --- |
| `POST /payments/create` | Body not parsed |
| `GET /payments/:uuid` | Path `uuid` |
| `POST /payments/:uuid/verify` | Path `uuid`; body not parsed |
| `POST /payments/:uuid/retry` | Path `uuid`; body not parsed |
| `POST /payments/:uuid/refund` | Path `uuid`; body not parsed |
| `POST /webhooks/razorpay` | Body not parsed |
| `POST /webhooks/stripe` | Body not parsed |
| `GET /vendor/settlements` | No inputs declared |

