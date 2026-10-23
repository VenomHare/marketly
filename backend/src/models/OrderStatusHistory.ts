import mongoose, { Schema, Document } from "mongoose";

export interface IOrderStatusHistory extends Document {
  id: string;
  vendor_order_id: string;
  previous_status?: string;
  new_status: string;
  changed_by_user_id: string;
  created_at: Date;
}

const OrderStatusHistorySchema = new Schema<IOrderStatusHistory>(
  {
    vendor_order_id: { type: String, required: true },
    previous_status: { type: String },
    new_status: { type: String, required: true },
    changed_by_user_id: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at" } }
);

export default mongoose.model<IOrderStatusHistory>("OrderStatusHistory", OrderStatusHistorySchema);
