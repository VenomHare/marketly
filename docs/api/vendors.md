---
layout: default
title: Vendors
parent: API Reference
nav_order: 3
---

# Vendor routes

Base prefix: `/api/v1`. Vendor-owned routes require a bearer JWT with vendor role and an existing vendor profile. See [authentication](auth.html#authentication-and-user-routes).

## `POST /vendors`

Authenticated customer only. Body is a strict object with non-empty trimmed strings `name`, `display_name`, `address`, `postal_code`. Creates a vendor with pending KYC and promotes the user to vendor.

**Responses:** `201` `{id,user_id,name,display_name,address,postal_code,kyc_status:"pending",commission_rate_bps:0,created_at,updated_at}`; `400` invalid parameters; `401` auth failure; `403` `{message:"Active customer account required"}`; `409` `{message:"Only customers can apply to become a vendor"}` or `{message:"Vendor application already exists"}`; `500` `{message:"Vendor application failed"}`.

## `GET /vendors/me/kyc`

Vendor auth. No inputs. Returns `200` `{vendor_id,status,documents:{address_proof,identity_proof}}`; if no submission, status is `not_submitted` and both flags false. Submitted result may include `rejection_reason`, `reviewed_at`, `submitted_at`, and `updated_at`. Errors: `401`, `403`, `500 {message:"Failed to fetch KYC status"}`.

## `POST /vendors/me/kyc`

Vendor auth. Body is strict: `{address_proof_key,identity_proof_key}`. Keys must be distinct, trimmed strings of 1–1024 chars, valid relative slash-separated keys, and each must begin `kyc/<authenticated vendor id>/`.

**Responses:** `201` for first submission or `200` when resubmitting rejected documents: `{vendor_id,status:"pending",documents:{address_proof:true,identity_proof:true}}`; `400` invalid parameters; `401` auth failure; `403` vendor access failure; `409` `{message:"KYC submission is already pending or verified"}`; `500` `{message:"Failed to submit KYC documents"}`.

## `GET /vendors/me`

Vendor auth and active account required. **Response:** `200` `{id,user_id,name,display_name,address,postal_code,kyc_status,commission_rate_bps,created_at,updated_at}`; `401`, `403 {message:"Active vendor account required"}` or vendor middleware errors, `404 {message:"Vendor profile not found"}`, `500 {message:"Failed to fetch vendor profile"}`.

## `PATCH /vendors/me`

Vendor auth and active account. Strict body must contain at least one of `name` or `display_name`, each a non-empty trimmed string. Other fields (including address and postal code) are rejected. Returns the same profile shape as GET; errors include `400`, `401`, `403`, `404`, and `500 {message:"Failed to update vendor profile"}`.

## `GET /vendors/:uuid`

Public. `uuid` must be a 24-character hexadecimal MongoDB id. **Responses:** `200` `{id,name,display_name,created_at}`; `400 {message:"Invalid vendor id"}`; `404 {message:"Vendor not found"}` for missing/inactive vendor; `500 {message:"Failed to fetch vendor profile"}`.

## `GET /vendors/:uuid/products`

Public. Path `uuid` as above. Query: `page` integer ≥1 default `1`; `limit` integer 1–100 default `20`; no extra query keys. Returns active products only: `200` `{products:[{id,name,description,price,average_rating,review_count,created_at}],pagination:{page,limit,total,pages}}`. Errors: `400 {message:"Invalid parameters"}`, `404 {message:"Vendor not found"}`, `500 {message:"Failed to fetch vendor products"}`.

## `GET /vendors/me/dashboard`

Vendor auth and active account. No inputs. **Response:** `200` `{active_products,total_orders,open_orders,gross_sales_paise,refund_paise,net_earnings_paise,pending_payout_paise}`; `401`, `403`, `500 {message:"Failed to fetch vendor dashboard"}`.

## `GET /vendors/me/orders`

Vendor auth and active account. Query `page` integer ≥1 (default 1), `limit` integer 1–100 (default 20). `200` `{orders:[{id,order_id,status,items:[{product_id,product_name,sku,unit_price_paise,quantity,discount_paise,line_total_paise}],created_at,updated_at}],pagination:{page,limit,total,pages}}`. Errors: `400`, `401`, `403`, `500 {message:"Failed to fetch vendor orders"}`.

## `GET /vendors/me/settlements`

Vendor auth and active account. Same pagination query as vendor orders. `200` `{settlements:[{id,vendor_order_id,gross_paise,commission_paise,refund_paise,net_paise,status,created_at,settled_at}],pagination:{page,limit,total,pages}}`. Provider transfer identifiers are not returned. Errors: `400`, `401`, `403`, `500 {message:"Failed to fetch vendor settlements"}`.

Vendor route tests cover ownership scoping, pagination, private field filtering, and exclusion of KYC document keys from responses.

