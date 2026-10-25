# Cart routes

Base prefix: `/api/v1`. All handlers currently return `500 {message:"Route not implemented"}`. They declare no auth middleware and do not read request data.

| Method and path | Inputs |
| --- | --- |
| `GET /cart` | None declared |
| `POST /cart/items` | Body not parsed |
| `PATCH /cart/items/:itemId` | Path `itemId`; body not parsed |
| `DELETE /cart/items/:itemId` | Path `itemId` |
| `DELETE /cart` | None declared |
| `POST /cart/merge` | Body not parsed |
| `POST /cart/validate` | Body not parsed |

