# Address routes

Base prefix: `/api/v1`. All handlers currently return `500 {message:"Route not implemented"}`. No authentication, body/query schema, or success payload is defined.

| Method and path | Inputs |
| --- | --- |
| `POST /addresses` | Body not parsed |
| `GET /addresses` | None declared |
| `GET /addresses/:uuid` | Path `uuid` |
| `PATCH /addresses/:uuid` | Path `uuid`; body not parsed |
| `DELETE /addresses/:uuid` | Path `uuid` |

