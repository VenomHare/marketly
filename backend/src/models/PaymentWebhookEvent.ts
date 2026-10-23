import mongoose, { Schema, Document } from "mongoose";

export interface IPaymentWebhookEvent extends Document {
  id: string;
  provider: "razorpay" | "stripe";
  provider_event_id: string;
  event_type: string;
  processed_at?: Date;
  status: "received" | "processed" | "failed";
  received_at: Date;
}

const PaymentWebhookEventSchema = new Schema<IPaymentWebhookEvent>(
  {
    provider: { type: String, enum: ["razorpay", "stripe"], required: true },
    provider_event_id: { type: String, required: true },
    event_type: { type: String, required: true },
    processed_at: { type: Date },
    status: { type: String, enum: ["received", "processed", "failed"], default: "received" },
    received_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "received_at" } }
);

export default mongoose.model<IPaymentWebhookEvent>("PaymentWebhookEvent", PaymentWebhookEventSchema);
