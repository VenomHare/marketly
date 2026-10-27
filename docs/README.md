---
layout: default
title: API guide
nav_order: 2
---

# Marketly API guide

Use this guide to find an endpoint, prepare its request, and understand the response. The API base path is `/api/v1`.

## Find an endpoint

Start at the [API reference]({{ site.baseurl }}/api/) to browse endpoints by topic. Each page describes the HTTP method and path, required inputs, authentication, and response fields.

| If you want to… | Open… |
| --- | --- |
| Sign up, sign in, or manage your account | [Authentication](api/auth.html) |
| Browse products and categories | [Products](api/products.html) · [Categories](api/categories.html) · [Search](api/search.html) |
| Manage your cart and saved addresses | [Cart](api/cart.html) · [Addresses](api/addresses.html) |
| Place an order or follow its status | [Orders and checkout](api/orders.html) |
| Review payment or refund information | [Payments](api/payments.html) |
| Manage a vendor account and its orders | [Vendors](api/vendors.html) · [Vendor orders](api/vendor-orders.html) |
| Use administration endpoints | [Administration](api/admin.html) |

## Make a request

Include `/api/v1` before the endpoint path. For example, the products page documents `GET /products`; its full path is `/api/v1/products`.

Protected endpoints require a bearer token in the request header:

```http
Authorization: Bearer <JWT>
```

Send JSON bodies with `Content-Type: application/json`. Endpoint pages list required fields, accepted values, query parameters, and any exceptions to these conventions. A path segment such as `:uuid` is a value you replace with the relevant resource ID.

## Read response details

Each endpoint page lists successful response fields and the errors that endpoint can return. Common status codes include `400` for invalid input, `401` for missing or invalid authentication, `403` for insufficient access, and `404` when a resource is unavailable. Error bodies use JSON and include a `message` field.

Pagination parameters and response shapes are documented on the endpoints that support them. A `—` in a route table means that handler does not read input from that location. Routes explicitly marked **Not implemented** currently return the documented error and do not have a success response contract.

