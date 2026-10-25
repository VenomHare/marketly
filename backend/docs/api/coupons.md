# Coupon routes

Base prefix: `/api/v1`. All handlers currently return `500 {message:"Route not implemented"}` and declare no auth middleware or parsed input.

| Method and path | Inputs |
| --- | --- |
| `GET /coupons` | None declared |
| `GET /coupons/:uuid` | Path `uuid` |
| `POST /coupons/validate` | Body not parsed |
| `GET /users/me/coupons` | None declared |

