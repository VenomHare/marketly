import mongoose, { Schema, Document } from "mongoose";

export interface IOrder extends Document {
  id: string;
  user_id: string;
  address_snapshot: object;
  subtotal_paise: number;
  discount_paise: number;
  shipping_paise: number;
  total_paise: number;
  payment_status: "pending" | "paid" | "failed" | "partially_refunded" | "refunded";
  status: "pending" | "placed" | "cancelled" | "completed";
  created_at: Date;
  updated_at: Date;
}

const OrderSchema = new Schema<IOrder>(
  {
    user_id: { type: String, required: true },
    address_snapshot: { type: Object, required: true },
    subtotal_paise: { type: Number, required: true },
    discount_paise: { type: Number, required: true },
    shipping_paise: { type: Number, required: true },
    total_paise: { type: Number, required: true },
    payment_status: { type: String, enum: ["pending", "paid", "failed", "partially_refunded", "refunded"], default: "pending" },
    status: { type: String, enum: ["pending", "placed", "cancelled", "completed"], default: "pending" },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export default mongoose.model<IOrder>("Order", OrderSchema);
