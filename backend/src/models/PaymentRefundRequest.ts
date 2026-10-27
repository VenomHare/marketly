import mongoose, { Document, Schema } from "mongoose";

export interface IPaymentRefundRequest extends Document {
  id: string;
  payment_id: string;
  order_id: string;
  user_id: string;
  reason: string;
  status: "requested" | "processing" | "refunded" | "failed" | "rejected" | "cancelled";
  provider_refund_id?: string;
  amount_paise: number;
  reviewed_by?: string;
  reviewed_at?: Date;
  created_at: Date;
  updated_at: Date;
}

const PaymentRefundRequestSchema = new Schema<IPaymentRefundRequest>(
  {
    payment_id: { type: String, required: true },
    order_id: { type: String, required: true },
    user_id: { type: String, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    status: { type: String, enum: ["requested", "processing", "refunded", "failed", "rejected", "cancelled"], default: "requested" },
    provider_refund_id: { type: String },
    amount_paise: { type: Number, required: true },
    reviewed_by: { type: String },
    reviewed_at: { type: Date },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

PaymentRefundRequestSchema.index({ payment_id: 1, status: 1 });
export default mongoose.model<IPaymentRefundRequest>("PaymentRefundRequest", PaymentRefundRequestSchema);
