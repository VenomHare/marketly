import mongoose, { Schema, Document } from "mongoose";

export interface IReturnRequest extends Document {
  id: string;
  order_id: string;
  user_id: string;
  reason: string;
  status: "requested" | "approved" | "rejected" | "received" | "refunded";
  created_at: Date;
  updated_at: Date;
}

const ReturnRequestSchema = new Schema<IReturnRequest>(
  {
    order_id: { type: String, required: true, unique: true },
    user_id: { type: String, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    status: { type: String, enum: ["requested", "approved", "rejected", "received", "refunded"], default: "requested" },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export default mongoose.model<IReturnRequest>("ReturnRequest", ReturnRequestSchema);
