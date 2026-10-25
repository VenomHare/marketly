# Review routes

Base prefix: `/api/v1`. No route currently declares authentication, request parsing, or success response. All return `500 {message:"Route not implemented"}`.

| Method and path | Inputs |
| --- | --- |
| `POST /products/:uuid/reviews` | Path `uuid`; body not parsed |
| `GET /products/:uuid/reviews` | Path `uuid` |
| `GET /reviews/:uuid` | Path `uuid` |
| `PATCH /reviews/:uuid` | Path `uuid`; body not parsed |
| `DELETE /reviews/:uuid` | Path `uuid` |
| `GET /users/me/reviews` | None declared |

