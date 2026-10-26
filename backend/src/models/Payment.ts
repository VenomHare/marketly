import mongoose, { Schema, Document } from "mongoose";

export interface IPayment extends Document {
  id: string;
  order_id: string;
  provider: "razorpay" | "stripe";
  provider_order_id?: string;
  provider_payment_id?: string;
  status: "created" | "processing" | "success" | "failed" | "refunded";
  amount_paise: number;
  currency: "INR";
  idempotency_key: string;
  created_at: Date;
  updated_at: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    order_id: { type: String, required: true },
    provider: { type: String, enum: ["razorpay", "stripe"], required: true },
    provider_order_id: { type: String },
    provider_payment_id: { type: String },
    status: { type: String, enum: ["created", "processing", "success", "failed", "refunded"], default: "created" },
    amount_paise: { type: Number, required: true },
    currency: { type: String, enum: ["INR"], default: "INR" },
    idempotency_key: { type: String, required: true, unique: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export default mongoose.model<IPayment>("Payment", PaymentSchema);
