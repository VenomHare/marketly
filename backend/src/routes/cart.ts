import { Router } from "express";
import mongoose from "mongoose";
import Cart from "../models/Cart.js";
import CartItem from "../models/CartItem.js";
import Product from "../models/Product.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";

const cartRouter = Router();

cartRouter.get("/cart", async (req, res) => {
  const queryKeys = Object.keys(req.query);
  if (queryKeys.some((key) => key !== "session_id")) {
    return res.status(400).json({ message: "Unsupported query parameter" });
  }

  const sessionId = req.query.session_id;
  if (Array.isArray(sessionId) || (sessionId !== undefined && typeof sessionId !== "string")) {
    return res.status(400).json({ message: "session_id must be a single string" });
  }
  if (typeof sessionId === "string" && (!sessionId.trim() || sessionId.length > 200)) {
    return res.status(400).json({ message: "session_id must contain between 1 and 200 characters" });
  }

  try {
    const cart = sessionId
      ? await Cart.findOne({ session_id: sessionId, $or: [{ expires_at: { $exists: false } }, { expires_at: null }, { expires_at: { $gt: new Date() } }] })
      : null;
    if (!cart) return res.status(200).json({ cart: null, items: [] });

    const items = await CartItem.find({ cart_id: cart.id }).sort({ added_at: 1 });
    return res.status(200).json({
      cart: {
        id: cart.id,
        ...(cart.user_id ? { user_id: cart.user_id } : {}),
        ...(cart.session_id ? { session_id: cart.session_id } : {}),
        updated_at: cart.updated_at,
        ...(cart.expires_at ? { expires_at: cart.expires_at } : {}),
      },
      items: items.map((item) => ({
        id: item.id,
        cart_id: item.cart_id,
        product_id: item.product_id,
        quantity: item.quantity,
        added_at: item.added_at,
      })),
    });
  } catch {
    return res.status(500).json({ message: "Failed to retrieve cart" });
  }
});

cartRouter.get("/cart/mine", authenticate, async (req: AuthRequest, res) => {
  if (req.user?.role !== "customer") return res.status(403).json({ message: "Customer access required" });
  try {
    const cart = await Cart.findOne({ user_id: req.user.id, $or: [{ expires_at: { $exists: false } }, { expires_at: null }, { expires_at: { $gt: new Date() } }] });
    if (!cart) return res.status(200).json({ cart: null, items: [] });
    const items = await CartItem.find({ cart_id: cart.id }).sort({ added_at: 1 });
    return res.status(200).json({ cart: { id: cart.id, user_id: cart.user_id, updated_at: cart.updated_at }, items: items.map(item => ({ id: item.id, cart_id: item.cart_id, product_id: item.product_id, quantity: item.quantity, added_at: item.added_at })) });
  } catch {
    return res.status(500).json({ message: "Failed to retrieve cart" });
  }
});

cartRouter.post("/cart/mine/items", authenticate, async (req: AuthRequest, res) => {
  if (req.user?.role !== "customer") return res.status(403).json({ message: "Customer access required" });
  const { product_id: productId, quantity } = req.body ?? {};
  if (Object.keys(req.body ?? {}).some(key => !["product_id", "quantity"].includes(key)) || typeof productId !== "string" || !mongoose.isValidObjectId(productId) || !Number.isSafeInteger(quantity) || quantity < 1) {
    return res.status(400).json({ message: "Invalid cart item" });
  }
  try {
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });
    if (product.status !== "active") return res.status(409).json({ message: "Product is not available" });
    const now = new Date();
    let cart = await Cart.findOne({ user_id: req.user.id, $or: [{ expires_at: { $exists: false } }, { expires_at: null }, { expires_at: { $gt: now } }] });
    if (!cart) cart = await Cart.create({ user_id: req.user.id });
    const item = await CartItem.findOne({ cart_id: cart.id, product_id: productId });
    const nextQuantity = (item?.quantity ?? 0) + quantity;
    if (nextQuantity > product.stock) return res.status(409).json({ message: "Requested quantity exceeds available stock", available_quantity: Math.max(0, product.stock - (item?.quantity ?? 0)), cart_quantity: item?.quantity ?? 0 });
    const savedItem = item
      ? await CartItem.findByIdAndUpdate(item.id, { quantity: nextQuantity }, { new: true })
      : await CartItem.create({ cart_id: cart.id, product_id: productId, quantity });
    if (!savedItem) return res.status(500).json({ message: "Failed to update cart item" });
    return res.status(item ? 200 : 201).json({ cart_id: cart.id, item: { id: savedItem.id, cart_id: savedItem.cart_id, product_id: savedItem.product_id, quantity: savedItem.quantity, added_at: savedItem.added_at } });
  } catch {
    return res.status(500).json({ message: "Failed to add item to cart" });
  }
});

cartRouter.patch("/cart/mine/items/:itemId", authenticate, async (req: AuthRequest, res) => {
  if (req.user?.role !== "customer") return res.status(403).json({ message: "Customer access required" });
  const { itemId } = req.params;
  const quantity = req.body?.quantity;
  if (!mongoose.isValidObjectId(itemId) || !Number.isSafeInteger(quantity) || quantity < 1) return res.status(400).json({ message: "Invalid cart item update" });
  try {
    const cart = await Cart.findOne({ user_id: req.user.id });
    const item = cart ? await CartItem.findOne({ _id: itemId, cart_id: cart.id }) : null;
    const product = item ? await Product.findById(item.product_id) : null;
    if (!item || !product) return res.status(404).json({ message: "Cart item not found" });
    if (product.status !== "active" || quantity > product.stock) return res.status(409).json({ message: "Requested quantity exceeds available stock" });
    item.quantity = quantity;
    await item.save();
    return res.status(200).json({ item: { id: item.id, cart_id: item.cart_id, product_id: item.product_id, quantity: item.quantity, added_at: item.added_at } });
  } catch {
    return res.status(500).json({ message: "Failed to update cart item" });
  }
});

cartRouter.delete("/cart/mine/items/:itemId", authenticate, async (req: AuthRequest, res) => {
  if (req.user?.role !== "customer") return res.status(403).json({ message: "Customer access required" });
  const { itemId } = req.params;
  if (!mongoose.isValidObjectId(itemId)) return res.status(400).json({ message: "itemId must be a valid ID" });
  try {
    const cart = await Cart.findOne({ user_id: req.user.id });
    if (!cart) return res.status(404).json({ message: "Cart item not found" });
    const deleted = await CartItem.deleteOne({ _id: itemId, cart_id: cart.id });
    return deleted.deletedCount ? res.status(204).send() : res.status(404).json({ message: "Cart item not found" });
  } catch {
    return res.status(500).json({ message: "Failed to remove cart item" });
  }
});

cartRouter.post("/cart/items", async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ message: "Request body must be an object" });
  }
  const allowedKeys = ["session_id", "product_id", "quantity"];
  if (Object.keys(body).some((key) => !allowedKeys.includes(key))) {
    return res.status(400).json({ message: "Unsupported request field" });
  }
  const { session_id: sessionId, product_id: productId, quantity } = body;
  if (typeof sessionId !== "string" || !sessionId.trim() || sessionId.length > 200) {
    return res.status(400).json({ message: "session_id must contain between 1 and 200 characters" });
  }
  if (typeof productId !== "string" || !mongoose.isValidObjectId(productId)) {
    return res.status(400).json({ message: "product_id must be a valid ID" });
  }
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    return res.status(400).json({ message: "quantity must be a positive safe integer" });
  }

  try {
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });
    if (product.status !== "active") return res.status(409).json({ message: "Product is not available" });

    const now = new Date();
    let cart = await Cart.findOne({
      session_id: sessionId,
      $or: [{ expires_at: { $exists: false } }, { expires_at: null }, { expires_at: { $gt: now } }],
    });
    const item = cart ? await CartItem.findOne({ cart_id: cart.id, product_id: product.id }) : null;
    const nextQuantity = (item?.quantity ?? 0) + quantity;
    if (nextQuantity > product.stock) {
      return res.status(409).json({ message: "Requested quantity exceeds available stock", available_quantity: Math.max(0, product.stock - (item?.quantity ?? 0)), cart_quantity: item?.quantity ?? 0 });
    }
    if (!cart) cart = await Cart.create({ session_id: sessionId });

    const savedItem = item
      ? await CartItem.findByIdAndUpdate(item.id, { quantity: nextQuantity }, { new: true })
      : await CartItem.create({ cart_id: cart.id, product_id: product.id, quantity });
    if (!savedItem) return res.status(500).json({ message: "Failed to update cart item" });

    return res.status(item ? 200 : 201).json({
      cart_id: cart.id,
      item: {
        id: savedItem.id,
        cart_id: savedItem.cart_id,
        product_id: savedItem.product_id,
        quantity: savedItem.quantity,
        added_at: savedItem.added_at,
      },
    });
  } catch {
    return res.status(500).json({ message: "Failed to add item to cart" });
  }
});

cartRouter.patch("/cart/items/:itemId", async (req, res) => {
  const { itemId } = req.params;
  if (!mongoose.isValidObjectId(itemId)) return res.status(400).json({ message: "itemId must be a valid ID" });

  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ message: "Request body must be an object" });
  }
  if (Object.keys(body).some((key) => !["session_id", "quantity"].includes(key))) {
    return res.status(400).json({ message: "Unsupported request field" });
  }
  const { session_id: sessionId, quantity } = body;
  if (typeof sessionId !== "string" || !sessionId.trim() || sessionId.length > 200) {
    return res.status(400).json({ message: "session_id must contain between 1 and 200 characters" });
  }
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    return res.status(400).json({ message: "quantity must be a positive safe integer" });
  }

  try {
    const cart = await Cart.findOne({
      session_id: sessionId,
      $or: [{ expires_at: { $exists: false } }, { expires_at: null }, { expires_at: { $gt: new Date() } }],
    });
    if (!cart) return res.status(404).json({ message: "Cart item not found" });

    const item = await CartItem.findOne({ _id: itemId, cart_id: cart.id });
    if (!item) return res.status(404).json({ message: "Cart item not found" });
    const product = await Product.findById(item.product_id);
    if (!product || product.status !== "active") {
      return res.status(409).json({ message: "Product is not available" });
    }
    if (quantity > product.stock) {
      return res.status(409).json({ message: "Requested quantity exceeds available stock" });
    }

    item.quantity = quantity;
    await item.save();
    return res.status(200).json({
      item: {
        id: item.id,
        cart_id: item.cart_id,
        product_id: item.product_id,
        quantity: item.quantity,
        added_at: item.added_at,
      },
    });
  } catch {
    return res.status(500).json({ message: "Failed to update cart item" });
  }
});

cartRouter.delete("/cart/items/:itemId", async (req, res) => {
  const { itemId } = req.params;
  if (!mongoose.isValidObjectId(itemId)) return res.status(400).json({ message: "itemId must be a valid ID" });
  if (Object.keys(req.query).some((key) => key !== "session_id")) {
    return res.status(400).json({ message: "Unsupported query parameter" });
  }
  const sessionId = req.query.session_id;
  if (typeof sessionId !== "string" || !sessionId.trim() || sessionId.length > 200) {
    return res.status(400).json({ message: "session_id must contain between 1 and 200 characters" });
  }

  try {
    const cart = await Cart.findOne({
      session_id: sessionId,
      $or: [{ expires_at: { $exists: false } }, { expires_at: null }, { expires_at: { $gt: new Date() } }],
    });
    if (!cart) return res.status(404).json({ message: "Cart item not found" });

    const result = await CartItem.deleteOne({ _id: itemId, cart_id: cart.id });
    if (result.deletedCount === 0) return res.status(404).json({ message: "Cart item not found" });
    return res.status(204).send();
  } catch {
    return res.status(500).json({ message: "Failed to remove cart item" });
  }
});

cartRouter.delete("/cart", async (req, res) => {
  if (Object.keys(req.query).some((key) => key !== "session_id")) {
    return res.status(400).json({ message: "Unsupported query parameter" });
  }
  const sessionId = req.query.session_id;
  if (typeof sessionId !== "string" || !sessionId.trim() || sessionId.length > 200) {
    return res.status(400).json({ message: "session_id must contain between 1 and 200 characters" });
  }

  try {
    const cart = await Cart.findOne({
      session_id: sessionId,
      $or: [{ expires_at: { $exists: false } }, { expires_at: null }, { expires_at: { $gt: new Date() } }],
    });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    await CartItem.deleteMany({ cart_id: cart.id });
    return res.status(204).send();
  } catch {
    return res.status(500).json({ message: "Failed to clear cart" });
  }
});

cartRouter.post("/cart/merge", authenticate, async (req, res) => {
  const authReq = req as AuthRequest;
  if (authReq.user?.role !== "customer") {
    return res.status(403).json({ message: "Customer access required" });
  }
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ message: "Request body must be an object" });
  }
  if (Object.keys(body).some((key) => key !== "session_id")) {
    return res.status(400).json({ message: "Unsupported request field" });
  }
  const sessionId = body.session_id;
  if (typeof sessionId !== "string" || sessionId.trim() !== sessionId || sessionId.length < 32 || sessionId.length > 200) {
    return res.status(400).json({ message: "session_id must contain between 32 and 200 characters with no surrounding whitespace" });
  }

  try {
    const now = new Date();
    const session = await mongoose.startSession();
    let result: {
      missing: boolean;
      cart_id?: string;
      merged?: Array<{ product_id: string; quantity: number }>;
      partial?: Array<{ product_id: string; merged_quantity: number; remaining_quantity: number }>;
      skipped?: Array<{ product_id: string; quantity: number; reason: string }>;
    } | undefined;
    try {
      await session.withTransaction(async () => {
        const sourceCart = await Cart.findOne({
          session_id: sessionId,
          user_id: { $exists: false },
          $or: [{ expires_at: { $exists: false } }, { expires_at: null }, { expires_at: { $gt: now } }],
        }).session(session);
        if (!sourceCart) {
          result = { missing: true };
          return;
        }

        let targetCart = await Cart.findOne({
          user_id: authReq.user!.id,
          $or: [{ expires_at: { $exists: false } }, { expires_at: null }, { expires_at: { $gt: now } }],
        }).session(session);
        if (!targetCart) {
          const [createdCart] = await Cart.create([{ user_id: authReq.user!.id }], { session });
          targetCart = createdCart!;
        }

        const sourceItems = await CartItem.find({ cart_id: sourceCart.id }).sort({ added_at: 1, _id: 1 }).session(session);
        const merged: Array<{ product_id: string; quantity: number }> = [];
        const partial: Array<{ product_id: string; merged_quantity: number; remaining_quantity: number }> = [];
        const skipped: Array<{ product_id: string; quantity: number; reason: string }> = [];

        for (const sourceItem of sourceItems) {
          if (!Number.isSafeInteger(sourceItem.quantity) || sourceItem.quantity < 1) {
            skipped.push({ product_id: sourceItem.product_id, quantity: sourceItem.quantity, reason: "invalid_quantity" });
            continue;
          }
          const product = await Product.findById(sourceItem.product_id).session(session);
          if (!product || product.status !== "active" || !Number.isSafeInteger(product.stock) || product.stock < 0) {
            skipped.push({ product_id: sourceItem.product_id, quantity: sourceItem.quantity, reason: "product_unavailable" });
            continue;
          }

          const targetItem = await CartItem.findOne({ cart_id: targetCart.id, product_id: sourceItem.product_id }).session(session);
          const targetQuantity = targetItem?.quantity ?? 0;
          if (!Number.isSafeInteger(targetQuantity) || targetQuantity < 0) {
            skipped.push({ product_id: sourceItem.product_id, quantity: sourceItem.quantity, reason: "invalid_target_quantity" });
            continue;
          }
          const amountToMerge = Math.min(sourceItem.quantity, Math.max(0, product.stock - targetQuantity));
          if (amountToMerge === 0) {
            skipped.push({ product_id: sourceItem.product_id, quantity: sourceItem.quantity, reason: "out_of_stock" });
            continue;
          }

          if (targetItem) {
            targetItem.quantity = targetQuantity + amountToMerge;
            await targetItem.save({ session });
          } else {
            await CartItem.create([{
              cart_id: targetCart.id, product_id: sourceItem.product_id, quantity: amountToMerge,
            }], { session });
          }

          const remaining = sourceItem.quantity - amountToMerge;
          if (remaining === 0) {
            await sourceItem.deleteOne({ session });
            merged.push({ product_id: sourceItem.product_id, quantity: amountToMerge });
          } else {
            sourceItem.quantity = remaining;
            await sourceItem.save({ session });
            partial.push({ product_id: sourceItem.product_id, merged_quantity: amountToMerge, remaining_quantity: remaining });
          }
        }

        result = { missing: false, cart_id: targetCart.id, merged, partial, skipped };
      });
    } finally {
      await session.endSession();
    }
    if (!result || result.missing) return res.status(404).json({ message: "Guest cart not found" });
    return res.status(200).json({ cart_id: result.cart_id, merged: result.merged, partial: result.partial, skipped: result.skipped });
  } catch {
    return res.status(500).json({ message: "Failed to merge carts" });
  }
});

cartRouter.post("/cart/validate", async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ message: "Request body must be an object" });
  }
  if (Object.keys(body).some((key) => key !== "session_id")) {
    return res.status(400).json({ message: "Unsupported request field" });
  }
  const sessionId = body.session_id;
  if (typeof sessionId !== "string" || sessionId.trim() !== sessionId || sessionId.length < 32 || sessionId.length > 200) {
    return res.status(400).json({ message: "session_id must contain between 32 and 200 characters with no surrounding whitespace" });
  }

  try {
    const cart = await Cart.findOne({
      session_id: sessionId,
      user_id: { $exists: false },
      $or: [{ expires_at: { $exists: false } }, { expires_at: null }, { expires_at: { $gt: new Date() } }],
    });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    const items = await CartItem.find({ cart_id: cart.id }).sort({ added_at: 1, _id: 1 });
    const productIds = [...new Set(items.map((item) => item.product_id))];
    const products = await Product.find({ _id: { $in: productIds } });
    const productsById = new Map(products.map((product) => [product.id, product]));
    let subtotal = 0;
    let valid = true;
    const validatedItems = items.map((item) => {
      const product = productsById.get(item.product_id);
      const validQuantity = Number.isSafeInteger(item.quantity) && item.quantity > 0;
      const activeProduct = product && product.status === "active" && Number.isFinite(product.price) && product.price > 0 &&
        Number.isSafeInteger(product.stock) && product.stock >= 0 ? product : undefined;
      const inStock = validQuantity && activeProduct !== undefined && activeProduct.stock >= item.quantity;
      const currentUnitPrice = activeProduct ? activeProduct.price : null;
      const computedLineTotal = activeProduct && validQuantity ? activeProduct.price * item.quantity : null;
      const lineTotal = computedLineTotal !== null && Number.isFinite(computedLineTotal) ? computedLineTotal : null;
      if (lineTotal !== null) subtotal += lineTotal;
      if (!inStock) valid = false;
      return {
        id: item.id,
        product_id: item.product_id,
        quantity: item.quantity,
        available: Boolean(inStock),
        reason: !validQuantity ? "invalid_quantity" : !activeProduct ? "product_unavailable" :
          computedLineTotal !== null && !Number.isFinite(computedLineTotal) ? "invalid_price" : !inStock ? "insufficient_stock" : null,
        stock: activeProduct ? activeProduct.stock : 0,
        current_unit_price: currentUnitPrice,
        line_total: lineTotal,
      };
    });

    return res.status(200).json({ cart_id: cart.id, valid, subtotal, items: validatedItems });
  } catch {
    return res.status(500).json({ message: "Failed to validate cart" });
  }
});

export default cartRouter;
