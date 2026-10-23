import mongoose, { Schema, Document } from "mongoose";

export interface ICartItem extends Document {
  id: string;
  cart_id: string;
  product_id: string;
  quantity: number;
  added_at: Date;
}

const CartItemSchema = new Schema<ICartItem>(
  {
    cart_id: { type: String, required: true },
    product_id: { type: String, required: true },
    quantity: { type: Number, required: true },
    added_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "added_at" } }
);

export default mongoose.model<ICartItem>("CartItem", CartItemSchema);
