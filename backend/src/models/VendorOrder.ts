import mongoose, { Schema, Document } from "mongoose";

export interface IVendorOrder extends Document {
  id: string;
  order_id: string;
  vendor_id: string;
  status: "placed" | "packed" | "shipped" | "in_transit" | "delivered" | "cancelled";
  created_at: Date;
  updated_at: Date;
}

const VendorOrderSchema = new Schema<IVendorOrder>(
  {
    order_id: { type: String, required: true },
    vendor_id: { type: String, required: true },
    status: { type: String, enum: ["placed", "packed", "shipped", "in_transit", "delivered", "cancelled"], default: "placed" },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export default mongoose.model<IVendorOrder>("VendorOrder", VendorOrderSchema);
