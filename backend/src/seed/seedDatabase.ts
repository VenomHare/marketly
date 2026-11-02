import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { encryptBankAccount } from "../utils/bankDetails";
import {
  Address,
  AdminAuditLog,
  Cart,
  CartItem,
  Category,
  Coupon,
  CouponRedemption,
  InventoryMovement,
  Order,
  OrderItem,
  OrderStatusHistory,
  Payment,
  PaymentRefundRequest,
  PaymentWebhookEvent,
  Product,
  ProductImage,
  ReturnRequest,
  Review,
  Shipment,
  User,
  Vendor,
  VendorKyc,
  VendorOrder,
  VendorSettlement,
} from "../models";
import { elasticsearchRequest, indexProduct, resetProductsIndex, type SearchableProduct } from "../utils/elasticsearch";

const MONGODB_URI = process.env.MONGODB_URI;
const DEMO_PASSWORD = "MarketlyDemo!2026";
const categories = [
  ["Electronics", "electronics"],
  ["Fashion & Clothing", "fashion-clothing"],
  ["Home & Kitchen", "home-kitchen"],
  ["Beauty & Personal Care", "beauty-personal-care"],
  ["Sports & Outdoors", "sports-outdoors"],
  ["Books & Stationery", "books-stationery"],
  ["Toys & Games", "toys-games"],
  ["Grocery & Gourmet", "grocery-gourmet"],
  ["Health & Wellness", "health-wellness"],
  ["Automotive", "automotive"],
] as const;

const catalog: Array<[string, string, number]> = [
  ["Wireless Earbuds", "Compact Bluetooth earbuds with charging case", 4999],
  ["USB-C Hub", "Seven-port aluminum USB-C hub", 3299],
  ["Portable Speaker", "Water-resistant portable Bluetooth speaker", 5999],
  ["Mechanical Keyboard", "Hot-swappable compact mechanical keyboard", 7499],
  ["Desk Lamp", "Dimmable LED desk lamp with USB charging", 2799],
  ["Everyday T-Shirt", "Soft cotton crew-neck everyday T-shirt", 1299],
  ["Canvas Backpack", "Durable daypack with padded laptop sleeve", 3499],
  ["Running Jacket", "Lightweight weather-resistant running jacket", 4999],
  ["Woven Scarf", "Lightweight woven scarf for all seasons", 1599],
  ["Leather Wallet", "Slim wallet with six card slots", 2299],
  ["Ceramic Cookware Set", "Three-piece non-stick ceramic cookware set", 8999],
  ["Cotton Bedsheet", "Breathable cotton double bedsheet set", 2999],
  ["Glass Food Containers", "Four-piece airtight glass container set", 2499],
  ["Pour-over Kettle", "Gooseneck kettle for precise pour-over brewing", 3999],
  ["Storage Basket", "Handwoven basket for home organization", 1199],
  ["Daily Moisturizer", "Lightweight fragrance-free daily face moisturizer", 899],
  ["Cleansing Balm", "Gentle plant-based makeup cleansing balm", 1099],
  ["Mineral Sunscreen", "Broad-spectrum mineral sunscreen SPF 50", 799],
  ["Hair Care Set", "Nourishing shampoo and conditioner duo", 1499],
  ["Bath Towel Set", "Two absorbent cotton bath towels", 1799],
  ["Yoga Mat", "Non-slip exercise mat with carry strap", 2199],
  ["Insulated Bottle", "Reusable stainless steel water bottle", 1399],
  ["Resistance Bands", "Five-level resistance band training set", 999],
  ["Camping Lantern", "Rechargeable LED camping lantern", 1899],
  ["Travel Duffel", "Lightweight weekend duffel with shoe pocket", 3299],
  ["Hardcover Notebook", "A5 ruled hardcover notebook", 499],
  ["Gel Pen Set", "Smooth-writing black gel pens, pack of six", 399],
  ["Desk Planner", "Undated weekly desk planner", 699],
  ["Watercolor Set", "Beginner watercolor paints and brush kit", 1299],
  ["Reading Light", "Rechargeable clip-on reading light", 899],
  ["Puzzle Box", "500-piece illustrated landscape puzzle", 999],
  ["Building Bricks", "Creative 300-piece building brick set", 1499],
  ["Board Game", "Family strategy board game for ages eight and up", 1799],
  ["Plush Animal", "Soft recycled-fiber plush companion", 799],
  ["Wooden Train Set", "Classic wooden train and track starter set", 2299],
  ["Organic Tea Sampler", "Assorted organic loose-leaf teas", 899],
  ["Single-origin Coffee", "Medium-roast whole bean coffee, 500 g", 1199],
  ["Almond Butter", "Smooth roasted almond butter, 300 g", 649],
  ["Trail Mix", "Fruit and nut trail mix, 400 g", 499],
  ["Olive Oil", "Cold-pressed extra virgin olive oil, 500 ml", 1399],
  ["Vitamin D3", "Daily vitamin D3 supplement, 60 tablets", 599],
  ["Foam Roller", "Textured recovery foam roller", 1599],
  ["First Aid Kit", "Compact home and travel first aid kit", 999],
  ["Sleep Mask", "Adjustable blackout sleep mask", 499],
  ["Massage Ball Set", "Two-piece muscle massage ball set", 699],
  ["Car Phone Mount", "Adjustable dashboard phone mount", 899],
  ["Microfiber Cloths", "Scratch-safe automotive microfiber cloth set", 499],
  ["Tire Pressure Gauge", "Easy-read digital tire pressure gauge", 799],
  ["Seat Organizer", "Hanging vehicle seat-back organizer", 1199],
  ["Emergency Jumper Cables", "Heavy-duty emergency jumper cable set", 1899],
];

async function idSet(model: any): Promise<Set<string>> {
  const ids = await model.distinct("_id");
  return new Set(ids.map((id: unknown) => String(id)));
}

function assertForeignKeys(label: string, values: Array<string | undefined>, validIds: Set<string>, allowMissing = false) {
  for (const value of values) {
    if (!value) {
      if (allowMissing) continue;
      throw new Error(`${label} is missing a required reference.`);
    }
    if (!validIds.has(value)) throw new Error(`${label} points to a missing record: ${value}`);
  }
}

async function main() {
  if (!MONGODB_URI) throw new Error("Set MONGODB_URI before running the seed script.");
  if (process.env.SEED_ALLOW_RESET !== "true") {
    throw new Error("This script drops the connected database. Set SEED_ALLOW_RESET=true only when you intend to replace all its data.");
  }
  if (catalog.length !== categories.length * 5) {
    throw new Error(`Seed catalog must contain exactly five products per category; found ${catalog.length} products for ${categories.length} categories.`);
  }
  if (!(process.env.BANK_DETAILS_ENCRYPTION_KEY || process.env.JWT_SECRET)) {
    throw new Error("Set BANK_DETAILS_ENCRYPTION_KEY or JWT_SECRET before seeding vendor bank details.");
  }

  await mongoose.connect(MONGODB_URI);
  // Reset search before dropping MongoDB so an unavailable Elasticsearch service cannot leave it wiped.
  await resetProductsIndex();
  const databaseName = mongoose.connection.name;
  console.warn(`Dropping every collection in database '${databaseName}'...`);
  await mongoose.connection.dropDatabase();

  const password_hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const admin = await User.create({ name: "Marketly Admin", email: "admin@marketly.demo", password_hash, role: "admin" });
  const customers = await User.insertMany(Array.from({ length: 10 }, (_, i) => ({
    name: `Demo Customer ${i + 1}`,
    email: `customer${String(i + 1).padStart(2, "0")}@marketly.demo`,
    password_hash,
    role: "customer" as const,
  })));
  const vendorUsers = await User.insertMany(Array.from({ length: 10 }, (_, i) => ({
    name: `Demo Vendor ${i + 1}`,
    email: `vendor${String(i + 1).padStart(2, "0")}@marketly.demo`,
    password_hash,
    role: "vendor" as const,
  })));

  const vendorDocs = await Vendor.insertMany(vendorUsers.map((user, i) => ({
    user_id: user.id,
    name: `Demo Vendor ${i + 1}`,
    display_name: `Marketly Shop ${i + 1}`,
    address: `${100 + i} Market Street, Sample City`,
    postal_code: `5600${i}`,
    kyc_status: "verified" as const,
    commission_rate_bps: 1000,
    bank_account_holder: user.name,
    ...encryptBankAccount(`999990000${String(i).padStart(2, "0")}`),
    bank_ifsc: "DEMO0000001",
    bank_name: "Demo Bank",
    bank_account_type: "current" as const,
    payout_balance_paise: 0,
  })));
  const adminId = admin.id;
  await VendorKyc.insertMany(vendorDocs.map((vendor) => ({
    vendor_id: vendor.id,
    address_proof_key: `kyc/${vendor.id}/demo-address-proof.pdf`,
    identity_proof_key: `kyc/${vendor.id}/demo-identity-proof.pdf`,
    status: "verified",
    reviewed_by_user_id: adminId,
    reviewed_at: new Date(),
    submitted_at: new Date(),
  })));

  const categoryDocs = await Category.insertMany(categories.map(([name, slug]) => ({ name, slug })));
  const products = await Product.insertMany(catalog.map(([name, description, price], i) => ({
    vendor_id: vendorDocs[i % vendorDocs.length]!.id,
    category_id: categoryDocs[Math.floor(i / 5)]!.id,
    name,
    description,
    sku: `MK-${String(i + 1).padStart(4, "0")}`,
    price,
    stock: 20 + (i % 30),
    status: "active" as const,
  })));
  await ProductImage.insertMany(products.map((product) => ({
    product_id: product.id,
    object_key: `products/${product.vendor_id}/replace-image-${product.sku.toLowerCase()}.jpg`,
    alt_text: `${product.name} product image placeholder: replace manually`,
    position: 0,
  })));

  const now = new Date();
  const coupon = await Coupon.create({
    code: "WELCOME10", discount_type: "percentage", discount_value: 10,
    max_discount_paise: 10000, min_order_paise: 1000, usage_limit: 100,
    starts_at: new Date(now.getTime() - 86400000), expires_at: new Date(now.getTime() + 31536000000), is_active: true,
  });

  const addresses = await Address.insertMany(customers.map((user, i) => ({
    user_id: user.id, label: "Home", first_line: `${i + 1} Demo Residency`, second_line: "Sample Road",
    postal_code: `5600${i}`, city: "Bengaluru", state: "Karnataka", country: "India",
    addressee_name: user.name, contact_number: `90000000${String(i).padStart(2, "0")}`,
  })));
  const carts = await Cart.insertMany(customers.map((user, i) => ({ user_id: user.id, expires_at: new Date(now.getTime() + 86400000) })));
  await CartItem.insertMany(carts.map((cart, i) => ({ cart_id: cart.id, product_id: products[i]!.id, quantity: 1 })));

  for (let i = 0; i < customers.length; i++) {
    const user = customers[i]!;
    const product = products[i]!;
    const vendor = vendorDocs[i % vendorDocs.length]!;
    const refunded = i === 0;
    const price = product.price * 100;
    const discount = i === 1 ? Math.min(10000, Math.round(price * 0.1)) : 0;
    const total = price - discount;
    const order = await Order.create({
      user_id: user.id,
      cart_id: carts[i]!.id,
      address_snapshot: { addressee_name: user.name, first_line: addresses[i]!.first_line, postal_code: addresses[i]!.postal_code, city: "Bengaluru", state: "Karnataka", country: "India", contact_number: addresses[i]!.contact_number },
      subtotal_paise: price, discount_paise: discount, shipping_paise: 0, total_paise: total,
      payment_status: refunded ? "refunded" : "paid", status: "completed",
    });
    const item = await OrderItem.create({
      order_id: order.id, product_id: product.id, vendor_id: vendor.id, product_name: product.name,
      sku: product.sku, unit_price_paise: price, quantity: 1, discount_paise: discount, line_total_paise: total,
    });
    const vendorOrder = await VendorOrder.create({ order_id: order.id, vendor_id: vendor.id, status: "delivered" });
    const payment = await Payment.create({
      order_id: order.id, provider: "razorpay", provider_order_id: `demo_order_${i + 1}`,
      provider_payment_id: `demo_payment_${i + 1}`, status: refunded ? "refunded" : "success",
      amount_paise: total, currency: "INR", idempotency_key: `demo-idempotency-${i + 1}`,
    });
    await VendorSettlement.create({
      vendor_order_id: vendorOrder.id, vendor_id: vendor.id, gross_paise: total,
      commission_paise: Math.round(total * vendor.commission_rate_bps / 10000),
      refund_paise: refunded ? total : 0,
      commission_reversed_paise: refunded ? Math.round(total * vendor.commission_rate_bps / 10000) : 0,
      net_paise: refunded ? 0 : Math.round(total * (10000 - vendor.commission_rate_bps) / 10000),
      status: refunded ? "processing" : "paid", provider_transfer_id: refunded ? undefined : `demo_transfer_${i + 1}`,
      payout_balance_offset_paise: 0, simulated_payout: true, settled_at: refunded ? undefined : now,
    });
    await Shipment.create({
      vendor_order_id: vendorOrder.id, carrier: "Demo Express", tracking_number: `MKTRK${String(i + 1).padStart(6, "0")}`,
      tracking_url: "https://example.invalid/track", shipped_at: now, delivered_at: now,
    });
    await OrderStatusHistory.create({ vendor_order_id: vendorOrder.id, previous_status: "shipped", new_status: "delivered", changed_by_user_id: vendor.user_id });
    await InventoryMovement.create({ product_id: product.id, order_item_id: item.id, quantity_change: -1, reason: "purchase" });
    await PaymentWebhookEvent.create({ provider: "razorpay", provider_event_id: `demo_event_${i + 1}`, event_type: "payment.captured", status: "processed", processed_at: now });
    if (i === 0) {
      await PaymentRefundRequest.create({
        payment_id: payment.id, order_id: order.id, user_id: user.id,
        reason: "Demo refund record", status: "refunded", provider_refund_id: "demo_refund_1",
        settlement_adjusted: true, amount_paise: total, reviewed_by: adminId, reviewed_at: now,
      });
      await ReturnRequest.create({ order_id: order.id, user_id: user.id, reason: "Demo return record", status: "refunded" });
    }
    if (i === 1) {
      await CouponRedemption.create({ coupon_id: coupon.id, user_id: user.id, order_id: order.id, discount_paise: discount });
    }
    if (i === 2) {
      await Review.create({ product_id: product.id, user_id: user.id, order_item_id: item.id, rating: 5, title: "Great quality", comment: "A useful demo review." });
    }
  }
  await AdminAuditLog.create({ admin_user_id: adminId, action: "seed.database", entity_type: "database", entity_id: databaseName, created_at: now });

  // MongoDB does not enforce foreign keys. Validate every stored reference before reporting success.
  const [userIds, vendorIds, categoryIds, productIds, cartIds, couponIds, orderIds,
    orderItemIds, vendorOrderIds, paymentIds] = await Promise.all([
    idSet(User), idSet(Vendor), idSet(Category), idSet(Product), idSet(Cart),
    idSet(Coupon), idSet(Order), idSet(OrderItem), idSet(VendorOrder), idSet(Payment),
  ]);
  const [vendorRows, kycRows, productRows, imageRows, addressRows, cartRows, cartItemRows,
    redemptionRows, orderRows, orderItemRows, returnRows, vendorOrderRows, paymentRows,
    settlementRows, shipmentRows, historyRows, reviewRows, refundRows, movementRows, auditRows] = await Promise.all([
    Vendor.find().lean(), VendorKyc.find().lean(), Product.find().lean(), ProductImage.find().lean(),
    Address.find().lean(), Cart.find().lean(), CartItem.find().lean(), CouponRedemption.find().lean(),
    Order.find().lean(), OrderItem.find().lean(), ReturnRequest.find().lean(), VendorOrder.find().lean(),
    Payment.find().lean(), VendorSettlement.find().lean(), Shipment.find().lean(), OrderStatusHistory.find().lean(),
    Review.find().lean(), PaymentRefundRequest.find().lean(), InventoryMovement.find().lean(), AdminAuditLog.find().lean(),
  ]);
  assertForeignKeys("Vendor.user_id", vendorRows.map((row) => row.user_id), userIds);
  assertForeignKeys("VendorKyc.vendor_id", kycRows.map((row) => row.vendor_id), vendorIds);
  assertForeignKeys("VendorKyc.reviewed_by_user_id", kycRows.map((row) => row.reviewed_by_user_id), userIds, true);
  assertForeignKeys("Product.vendor_id", productRows.map((row) => row.vendor_id), vendorIds);
  assertForeignKeys("Product.category_id", productRows.map((row) => row.category_id), categoryIds);
  assertForeignKeys("ProductImage.product_id", imageRows.map((row) => row.product_id), productIds);
  assertForeignKeys("Address.user_id", addressRows.map((row) => row.user_id), userIds);
  assertForeignKeys("Cart.user_id", cartRows.map((row) => row.user_id), userIds);
  assertForeignKeys("CartItem.cart_id", cartItemRows.map((row) => row.cart_id), cartIds);
  assertForeignKeys("CartItem.product_id", cartItemRows.map((row) => row.product_id), productIds);
  assertForeignKeys("CouponRedemption.coupon_id", redemptionRows.map((row) => row.coupon_id), couponIds);
  assertForeignKeys("CouponRedemption.user_id", redemptionRows.map((row) => row.user_id), userIds);
  assertForeignKeys("CouponRedemption.order_id", redemptionRows.map((row) => row.order_id), orderIds);
  assertForeignKeys("Order.user_id", orderRows.map((row) => row.user_id), userIds);
  assertForeignKeys("Order.cart_id", orderRows.map((row) => row.cart_id), cartIds);
  assertForeignKeys("OrderItem.order_id", orderItemRows.map((row) => row.order_id), orderIds);
  assertForeignKeys("OrderItem.product_id", orderItemRows.map((row) => row.product_id), productIds);
  assertForeignKeys("OrderItem.vendor_id", orderItemRows.map((row) => row.vendor_id), vendorIds);
  assertForeignKeys("ReturnRequest.order_id", returnRows.map((row) => row.order_id), orderIds);
  assertForeignKeys("ReturnRequest.user_id", returnRows.map((row) => row.user_id), userIds);
  assertForeignKeys("VendorOrder.order_id", vendorOrderRows.map((row) => row.order_id), orderIds);
  assertForeignKeys("VendorOrder.vendor_id", vendorOrderRows.map((row) => row.vendor_id), vendorIds);
  assertForeignKeys("Payment.order_id", paymentRows.map((row) => row.order_id), orderIds);
  assertForeignKeys("VendorSettlement.vendor_order_id", settlementRows.map((row) => row.vendor_order_id), vendorOrderIds);
  assertForeignKeys("VendorSettlement.vendor_id", settlementRows.map((row) => row.vendor_id), vendorIds);
  assertForeignKeys("Shipment.vendor_order_id", shipmentRows.map((row) => row.vendor_order_id), vendorOrderIds);
  assertForeignKeys("OrderStatusHistory.vendor_order_id", historyRows.map((row) => row.vendor_order_id), vendorOrderIds);
  assertForeignKeys("OrderStatusHistory.changed_by_user_id", historyRows.map((row) => row.changed_by_user_id), userIds);
  assertForeignKeys("Review.product_id", reviewRows.map((row) => row.product_id), productIds);
  assertForeignKeys("Review.user_id", reviewRows.map((row) => row.user_id), userIds);
  assertForeignKeys("Review.order_item_id", reviewRows.map((row) => row.order_item_id), orderItemIds);
  assertForeignKeys("PaymentRefundRequest.payment_id", refundRows.map((row) => row.payment_id), paymentIds);
  assertForeignKeys("PaymentRefundRequest.order_id", refundRows.map((row) => row.order_id), orderIds);
  assertForeignKeys("PaymentRefundRequest.user_id", refundRows.map((row) => row.user_id), userIds);
  assertForeignKeys("PaymentRefundRequest.reviewed_by", refundRows.map((row) => row.reviewed_by), userIds, true);
  assertForeignKeys("InventoryMovement.product_id", movementRows.map((row) => row.product_id), productIds);
  assertForeignKeys("InventoryMovement.order_item_id", movementRows.map((row) => row.order_item_id), orderItemIds, true);
  assertForeignKeys("AdminAuditLog.admin_user_id", auditRows.map((row) => row.admin_user_id), userIds);

  for (const item of orderItemRows) {
    const product = productRows.find((row) => row.id === item.product_id || String(row._id) === item.product_id);
    if (product?.vendor_id !== item.vendor_id) throw new Error(`OrderItem ${item.id} vendor does not own its product.`);
  }
  for (const order of orderRows) {
    const cart = cartRows.find((row) => row.id === order.cart_id || String(row._id) === order.cart_id);
    if (cart?.user_id !== order.user_id) throw new Error(`Order ${order.id} cart belongs to a different user.`);
  }
  for (const redemption of redemptionRows) {
    const order = orderRows.find((row) => row.id === redemption.order_id || String(row._id) === redemption.order_id);
    if (order?.user_id !== redemption.user_id) throw new Error(`Coupon redemption ${redemption.id} user does not own its order.`);
  }
  for (const returnRequest of returnRows) {
    const order = orderRows.find((row) => row.id === returnRequest.order_id || String(row._id) === returnRequest.order_id);
    if (order?.user_id !== returnRequest.user_id) throw new Error(`Return ${returnRequest.id} user does not own its order.`);
  }
  for (const vendorOrder of vendorOrderRows) {
    const hasVendorItem = orderItemRows.some((row) => row.order_id === vendorOrder.order_id && row.vendor_id === vendorOrder.vendor_id);
    if (!hasVendorItem) throw new Error(`Vendor order ${vendorOrder.id} has no order item for its vendor.`);
  }
  for (const movement of movementRows) {
    if (movement.order_item_id) {
      const item = orderItemRows.find((row) => row.id === movement.order_item_id || String(row._id) === movement.order_item_id);
      if (item?.product_id !== movement.product_id) throw new Error(`Inventory movement ${movement.id} product does not match its order item.`);
    }
  }
  for (const settlement of settlementRows) {
    const vendorOrder = vendorOrderRows.find((row) => row.id === settlement.vendor_order_id || String(row._id) === settlement.vendor_order_id);
    if (vendorOrder?.vendor_id !== settlement.vendor_id) throw new Error(`Settlement ${settlement.id} vendor does not match its vendor order.`);
  }
  for (const history of historyRows) {
    const vendorOrder = vendorOrderRows.find((row) => row.id === history.vendor_order_id || String(row._id) === history.vendor_order_id);
    const vendor = vendorRows.find((row) => row.id === vendorOrder?.vendor_id || String(row._id) === vendorOrder?.vendor_id);
    if (vendor?.user_id !== history.changed_by_user_id) throw new Error(`Status history ${history.id} actor does not own its vendor order.`);
  }
  for (const refund of refundRows) {
    const payment = paymentRows.find((row) => row.id === refund.payment_id || String(row._id) === refund.payment_id);
    if (payment?.order_id !== refund.order_id) throw new Error(`Refund ${refund.id} payment belongs to a different order.`);
    const order = orderRows.find((row) => row.id === refund.order_id || String(row._id) === refund.order_id);
    if (order?.user_id !== refund.user_id) throw new Error(`Refund ${refund.id} user does not own its order.`);
  }
  for (const review of reviewRows) {
    const item = orderItemRows.find((row) => row.id === review.order_item_id || String(row._id) === review.order_item_id);
    if (item?.product_id !== review.product_id) throw new Error(`Review ${review.id} product does not match its order item.`);
    const order = orderRows.find((row) => row.id === item?.order_id || String(row._id) === item?.order_id);
    if (order?.user_id !== review.user_id) throw new Error(`Review ${review.id} user does not own its order.`);
  }

  const activeProducts = await Product.find({ status: "active" }).lean();
  for (const product of activeProducts) {
    const searchableProduct: SearchableProduct = {
      id: product._id.toString(),
      vendor_id: product.vendor_id,
      category_id: product.category_id,
      name: product.name,
      description: product.description,
      sku: product.sku,
      price: product.price,
      stock: product.stock,
      average_rating: product.average_rating,
      review_count: product.review_count,
      status: product.status,
      created_at: product.created_at,
      updated_at: product.updated_at,
    };
    await indexProduct(searchableProduct);
  }
  await elasticsearchRequest("POST", "products/_refresh");
  const indexStatus = await elasticsearchRequest("GET", "products/_count");
  if (typeof indexStatus.count !== "number" || indexStatus.count !== activeProducts.length) {
    throw new Error(`Elasticsearch indexed ${String(indexStatus.count)} products; expected ${activeProducts.length}.`);
  }

  const counts = await Promise.all([
    User, Vendor, VendorKyc, Category, Product, ProductImage, Address, Cart, CartItem, Coupon, CouponRedemption,
    Order, OrderItem, ReturnRequest, VendorOrder, Payment, VendorSettlement, Shipment, OrderStatusHistory,
    Review, PaymentWebhookEvent, PaymentRefundRequest, InventoryMovement, AdminAuditLog,
  ].map(async (model) => `${model.collection.collectionName}: ${await model.countDocuments()}`));
  console.log(`Seed complete. ${products.length} products across ${categoryDocs.length} categories.`);
  console.log(`Indexed and verified ${activeProducts.length} active products in Elasticsearch.`);
  console.log(counts.join("\n"));
}

main()
  .catch((error) => { console.error("Seed failed:", error); process.exitCode = 1; })
  .finally(async () => { await mongoose.disconnect(); });
