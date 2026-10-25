# Upload routes

Base prefix: `/api/v1`. No handler currently declares authentication, body/query parsing, or a successful response. Each returns `500 {message:"Route not implemented"}`.

| Method and path | Inputs |
| --- | --- |
| `POST /uploads/presigned-url` | Body not parsed |
| `POST /uploads/confirm` | Body not parsed |
| `DELETE /uploads/:uuid` | Path `uuid` |

