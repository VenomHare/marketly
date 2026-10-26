# Address routes

Base prefix: `/api/v1`. `POST` and `GET /addresses` require a customer bearer token and only access the authenticated customer's addresses.

| Method and path | Inputs |
| --- | --- |
| `POST /addresses` | JSON body: `label`, `first_line`, optional `second_line`, `postal_code`, `city`, `state`, `country`, `addressee_name`, `contact_number` |
| `GET /addresses` | No query parameters |
| `GET /addresses/:uuid` | Path `uuid` |
| `PATCH /addresses/:uuid` | Path `uuid`; JSON body with one or more address fields |
| `DELETE /addresses/:uuid` | Path `uuid` |

`POST /addresses` returns `201 { "address": ... }`. Text fields are trimmed, required fields must be non-empty, field lengths are bounded, control characters are rejected, and unknown fields return `400`. The authenticated user's ID is assigned by the server; clients cannot choose an owner.

`GET /addresses` returns `{ "addresses": [...] }` sorted newest first, or an empty list when the customer has none. It does not return another customer's records. Requests without a valid customer bearer token return `401` (or `403` for a non-customer role); unexpected query parameters return `400`.

`GET /addresses/:uuid` returns `{ "address": ... }` for an address owned by the authenticated customer. Invalid IDs return `400`; missing or another customer's address returns `404`.

`PATCH /addresses/:uuid` accepts a strict partial address object and requires at least one valid field. Fields use the same trimming, length limits, and control-character checks as creation. Ownership cannot be changed. It returns the updated address; invalid IDs or bodies return `400`, while missing or unowned addresses return `404`.

`DELETE /addresses/:uuid` deletes only an address owned by the authenticated customer and returns `204`. Invalid IDs return `400`; missing or unowned addresses return `404`. All three item routes require a customer bearer token.

