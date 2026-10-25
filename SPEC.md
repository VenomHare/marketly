/vendors/me/dashboard# Ecommerce Platform 
- Clone of amazon, flipkart, etc

## Base Idea
1. Vendor Signs up 
2. Lists Item (Uploads images, adds tags, give details)
3. Customers logs in website 
4. searches for product
5. Products get listed 
6. Customer veiw images, details, reviews
7. Adds to Cart
8. Applies Coupoun - get's a discount
9. Adds Delivery Address 
10. Pays the amount to confirm order
11. Order Tracking Mechanism
12. Analytics page for Website Admin and Vendors 


## Stack
1. **Backend:** Express.js, MongoDB Razorpay, Elastic Search, Redis (Caching)
2. **Frontend:** React, Vite, TailwindCSS, React Router

> [!NOTE]
> AWS S3 is replaced by Cloudflare R2 since both have same API SDK and R2 is free.
## Database Schema

**User**
- id: uuid (string)
- name: string
- email: string (unique)
- password_hash: string
- role: "customer" | "vendor" | "admin"
- status: "active" | "suspended"
- created_at: timestamp
- updated_at: timestamp

**Vendor**
- id: uuid (string)
- user_id: uuid (FK → User)
- name: string
- display_name: string
- address: string
- postal_code: string
- kyc_status: "pending" | "verified" | "rejected"
- commission_rate_bps: number
- created_at: timestamp
- updated_at: timestamp

**VendorKycSubmission**
- id: uuid (string)
- vendor_id: uuid (unique FK → Vendor)
- address_proof_key: string (private R2 object key)
- identity_proof_key: string (private R2 object key)
- status: "pending" | "verified" | "rejected"
- reviewed_by_user_id: uuid (optional FK → User)
- reviewed_at: timestamp (optional)
- rejection_reason: string (optional)
- created_at: timestamp
- updated_at: timestamp

KYC images are stored in a private R2 bucket. Vendors submit one address proof image and one identity proof image using object keys from the upload flow. Submission waits for admin review; rejected vendors may resubmit. Product creation and vendor product changes require verified KYC. Admin document access must use short-lived private download URLs.

**Product**
- id: uuid (string)
- vendor_id: uuid (FK → Vendor)
- category_id: uuid (FK → Category)
- name: string
- description: string
- sku: string
- price: number (in paise)
- stock: number
- average_rating: number (recalculated after every review added)
- review_count: number
- status: "draft" | "active" | "archived"
- created_at: timestamp
- updated_at: timestamp

**ProductImage**
- id: uuid (string)
- product_id: uuid (FK → Product)
- object_key: string (R2 object key)
- alt_text: string (optional)
- position: number

**Category**
- id: uuid (string)
- name: string
- slug: string (unique)
- parent_id: uuid (optional, FK → Category)

**Address**
- id: uuid (string)
- user_id: uuid (FK → User)
- label: string ("Home", "Work", etc.)
- first_line: string
- second_line: string (optional)
- postal_code: string
- city: string
- state: string
- country: string
- addressee_name: string
- contact_number: string
- created_at: timestamp

**Cart**
- id: uuid (string)
- user_id: uuid (optional, FK → User)
- session_id: string (optional)
- updated_at: timestamp
- expires_at: timestamp (optional)

**CartItem**
- id: uuid (string)
- cart_id: uuid (FK → Cart)
- product_id: uuid (FK → Product)
- quantity: number
- added_at: timestamp

**Coupon**
- id: uuid (string)
- code: string (unique)
- discount_type: "percentage" | "fixed"
- discount_value: number
- max_discount_paise: number (optional)
- min_order_paise: number (optional)
- usage_limit: number (optional)
- starts_at: timestamp
- expires_at: timestamp
- is_active: boolean

**CouponRedemption**
- id: uuid (string)
- coupon_id: uuid (FK → Coupon)
- user_id: uuid (FK → User)
- order_id: uuid (FK → Order)
- discount_paise: number
- redeemed_at: timestamp

**Order**
- id: uuid (string)
- user_id: uuid (FK → User)
- address_snapshot: object
- subtotal_paise: number
- discount_paise: number
- shipping_paise: number
- total_paise: number
- payment_status: "pending" | "paid" | "failed" | "partially_refunded" | "refunded"
- status: "pending" | "placed" | "cancelled" | "completed"
- created_at: timestamp
- updated_at: timestamp

**OrderItem**
- id: uuid (string)
- order_id: uuid (FK → Order)
- product_id: uuid (FK → Product)
- vendor_id: uuid (FK → Vendor)
- product_name: string (snapshot)
- sku: string (snapshot)
- unit_price_paise: number
- quantity: number
- discount_paise: number
- line_total_paise: number

**VendorOrder**
- id: uuid (string)
- order_id: uuid (FK → Order)
- vendor_id: uuid (FK → Vendor)
- status: "placed" | "packed" | "shipped" | "in_transit" | "delivered" | "cancelled"
- created_at: timestamp
- updated_at: timestamp

**Payment**
- id: uuid (string)
- order_id: uuid (FK → Order)
- provider: "razorpay" | "stripe"
- provider_order_id: string (optional)
- provider_payment_id: string (optional)
- status: "created" | "processing" | "success" | "failed" | "refunded"
- amount_paise: number
- currency: "INR"
- idempotency_key: string
- created_at: timestamp
- updated_at: timestamp

**VendorSettlement**
- id: uuid (string)
- vendor_order_id: uuid (FK → VendorOrder)
- vendor_id: uuid (FK → Vendor)
- gross_paise: number
- commission_paise: number
- refund_paise: number
- net_paise: number
- status: "pending" | "processing" | "paid" | "failed"
- provider_transfer_id: string (optional)
- created_at: timestamp
- settled_at: timestamp (optional)

**Shipment**
- id: uuid (string)
- vendor_order_id: uuid (FK → VendorOrder)
- carrier: string (optional)
- tracking_number: string (optional)
- tracking_url: string (optional)
- shipped_at: timestamp (optional)
- delivered_at: timestamp (optional)

**OrderStatusHistory**
- id: uuid (string)
- vendor_order_id: uuid (FK → VendorOrder)
- previous_status: string (optional)
- new_status: string
- changed_by_user_id: uuid (FK → User)
- created_at: timestamp

**Review**
- id: uuid (string)
- product_id: uuid (FK → Product)
- user_id: uuid (FK → User)
- order_item_id: uuid (FK → OrderItem)
- rating: number (1–5)
- title: string (optional)
- comment: string
- created_at: timestamp

**PaymentWebhookEvent**
- id: uuid (string)
- provider: "razorpay" | "stripe"
- provider_event_id: string
- event_type: string
- processed_at: timestamp (optional)
- status: "received" | "processed" | "failed"
- received_at: timestamp

**InventoryMovement**
- id: uuid (string)
- product_id: uuid (FK → Product)
- order_item_id: uuid (optional, FK → OrderItem)
- quantity_change: number
- reason: "restock" | "purchase" | "cancellation" | "adjustment"
- created_at: timestamp

**AdminAuditLog**
- id: uuid (string)
- admin_user_id: uuid (FK → User)
- action: string
- entity_type: string
- entity_id: uuid (string)
- created_at: timestamp

## API List
**Base URL:** `/api/v1`

Admin endpoints are listed in a dedicated section below and are registered in the centralized admin router.

### 1. Authentication & Users

Registration creates customer accounts only; clients cannot choose a role. Admin accounts are provisioned manually.

- `POST /auth/register` - Register a customer
- `POST /auth/login` - Login and receive JWT
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - Logout / invalidate refresh session
- `GET /me` - Get current user profile (includes role-specific data)
- `PATCH /users/me` - Update current user profile
- `PATCH /users/me/password` - Change password
- `GET /users/me/orders` - Get current user's orders

### 2. Vendors

- `POST /vendors` - Apply to become a vendor (authenticated customer; requires `name`, `display_name`, `address`, and `postal_code`; creates a pending KYC application and changes the user role to vendor)
- `GET /vendors/me` - Get the authenticated vendor's own profile
- `PATCH /vendors/me` - Update own name and display name; address and postal code cannot be changed after application
- `GET /vendors/me/kyc` - Get own KYC submission status
- `POST /vendors/me/kyc` - Submit address proof and identity proof R2 object keys
- `GET /vendors/{uuid}` - Get an active vendor’s public profile (`id`, `name`, `display_name`, and `created_at`); returns 404 for missing or suspended vendors and does not expose address or postal code
- `GET /vendors/{uuid}/products` - List active products for a verified vendor; supports `page` (default 1) and `limit` (default 20, max 100), and omits SKU and stock quantities
- `GET /vendors/me/dashboard` - Get authenticated vendor’s active product count, total/open order counts, gross sales, refunds, net earnings, and pending payout totals (amounts in paise)
- `GET /vendors/me/orders` - List the authenticated vendor’s orders with that vendor’s line items; supports `page` (default 1) and `limit` (default 20, max 100)
- `GET /vendors/me/settlements` - List the authenticated vendor’s settlement history with gross, commission, refund, net amounts (paise), status, and timestamps; supports `page` (default 1) and `limit` (default 20, max 100). Provider transfer identifiers are private.

### 3. Products

- `POST /products` - Create a product
- `GET /products` - List products with pagination
- `GET /products/{uuid}` - Get product details
- `PATCH /products/{uuid}` - Update a product
- `DELETE /products/{uuid}` - Archive or remove a product
- `GET /vendors/me/products` - List own products, including drafts
- `PATCH /products/{uuid}/status` - Publish, unpublish, or archive a product
- `PATCH /products/{uuid}/stock` - Update product stock
- `POST /products/{uuid}/images` - Generate presigned R2 upload URL
- `DELETE /products/{uuid}/images/{imageId}` - Remove product image
- `PUT /products/{uuid}/images/reorder` - Reorder product images
- `GET /products/{uuid}/reviews` - Get product reviews
- `GET /products/{uuid}/related` - Get related products

### 4. Categories

- `GET /categories` - List categories
- `GET /categories/{uuid}` - Get category details
- `GET /categories/{uuid}/products` - Get products in a category

### 5. Uploads AWS S3 Cloudflare R2

- `POST /uploads/presigned-url` - Generate presigned upload URL
- `POST /uploads/confirm` - Validate uploaded image metadata
- `DELETE /uploads/{uuid}` - Delete an uploaded object

### 6. Cart

- `GET /cart` - Get current cart
- `POST /cart/items` - Add product to cart
- `PATCH /cart/items/{itemId}` - Update item quantity
- `DELETE /cart/items/{itemId}` - Remove item from cart
- `DELETE /cart` - Clear cart
- `POST /cart/merge` - Merge guest cart after login
- `POST /cart/validate` - Validate stock and current prices

### 7. Addresses

- `POST /addresses` - Create an address
- `GET /addresses` - List own addresses
- `GET /addresses/{uuid}` - Get address details
- `PATCH /addresses/{uuid}` - Update an address
- `DELETE /addresses/{uuid}` - Delete an address

### 8. Coupons

- `GET /coupons` - List available coupons
- `GET /coupons/{uuid}` - Get coupon details
- `POST /coupons/validate` - Validate coupon for current cart
- `GET /users/me/coupons` - Get eligible or previously used coupons

### 9. Checkout & Orders

- `POST /checkout/preview` - Calculate subtotal, discounts, shipping, and availability
- `POST /checkout` - Create order and initiate checkout
- `GET /orders` - List current user's orders
- `GET /orders/{uuid}` - Get order details
- `POST /orders/{uuid}/cancel` - Request order cancellation
- `POST /orders/{uuid}/return` - Request a return
- `GET /orders/{uuid}/tracking` - Get order tracking details

### 10. Vendor Order Fulfilment

- `GET /vendor-orders` - List vendor fulfilment orders
- `GET /vendor-orders/{uuid}` - Get fulfilment order details
- `PATCH /vendor-orders/{uuid}/status` - Update fulfilment status
- `POST /vendor-orders/{uuid}/shipment` - Add shipment and tracking details
- `PATCH /vendor-orders/{uuid}/shipment` - Update shipment details
- `GET /vendor-orders/{uuid}/history` - Get order status history

### 11. Payments — Razorpay / Stripe

- `POST /payments/create` - Create a payment attempt
- `GET /payments/{uuid}` - Get payment status
- `POST /payments/{uuid}/verify` - Verify payment with provider
- `POST /payments/{uuid}/retry` - Retry an eligible failed payment
- `POST /payments/{uuid}/refund` - Request a refund
- `POST /webhooks/razorpay` - Receive Razorpay webhook events
- `POST /webhooks/stripe` - Receive Stripe webhook events
- `GET /vendor/settlements` - Get vendor settlement history

### 12. Reviews

- `POST /products/{uuid}/reviews` - Add a review for an eligible purchase
- `GET /products/{uuid}/reviews` - List product reviews
- `GET /reviews/{uuid}` - Get review details
- `PATCH /reviews/{uuid}` - Edit own review
- `DELETE /reviews/{uuid}` - Delete own review
- `GET /users/me/reviews` - List own reviews

### 13. Admin APIs

All routes in this section require the admin role.

#### Users

- `GET /admin/users` - List users
- `GET /admin/users/{uuid}` - Get user details
- `PATCH /admin/users/{uuid}/status` - Suspend or activate user

#### Vendors and KYC

- `GET /admin/vendors` - List vendors and applications
- `GET /admin/vendors/{uuid}` - Get vendor details
- `GET /admin/vendors/{uuid}/kyc` - View vendor KYC status and review metadata
- `GET /admin/vendors/{uuid}/kyc/documents` - Get short-lived private URLs for the two KYC images
- `PATCH /admin/vendors/{uuid}/verify` - Approve or reject KYC (rejection requires a reason)
- `PATCH /admin/vendors/{uuid}/status` - Activate or suspend vendor

#### Categories and coupons

- `POST /admin/categories` - Create category
- `PATCH /admin/categories/{uuid}` - Update category
- `DELETE /admin/categories/{uuid}` - Delete category
- `POST /admin/coupons` - Create coupon
- `PATCH /admin/coupons/{uuid}` - Update coupon
- `DELETE /admin/coupons/{uuid}` - Deactivate or delete coupon

#### Orders and settlements

- `GET /admin/orders` - List all orders
- `PATCH /admin/orders/{uuid}/status` - Update permitted order status
- `GET /admin/settlements` - List settlements
- `POST /admin/settlements/{uuid}/retry` - Retry a failed settlement

#### Reviews

- `PATCH /admin/reviews/{uuid}/moderation` - Moderate a review

#### Analytics

- `GET /admin/analytics/overview` - Get revenue, orders, customers, and vendors
- `GET /admin/analytics/sales` - Get sales over a date range
- `GET /admin/analytics/products` - Get best-selling products
- `GET /admin/analytics/vendors` - Get vendor performance
- `GET /admin/analytics/customers` - Get customer metrics
- `GET /admin/analytics/payments` - Get payment success and failure metrics
- `GET /admin/analytics/commissions` - Get platform commission totals

#### Search index

- `POST /admin/search/reindex` - Trigger product reindexing
- `GET /admin/search/index-status` - Check search index status

### 14. Search & Elasticsearch

- `GET /search/products` - Search products with filters and sorting
- `GET /search/suggestions` - Get autocomplete suggestions
- `GET /search/trending` - Get trending products or searches

Example:

`GET /search/products?q=keyboard&category=electronics&minPrice=500&maxPrice=5000&sortBy=price&order=asc&page=1&limit=20`
