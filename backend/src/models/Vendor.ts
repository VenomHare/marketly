import mongoose, { Schema, Document } from "mongoose";

export interface IVendor extends Document {
  id: string;
  user_id: string;
  name: string;
  display_name: string;
  address: string;
  postal_code: string;
  kyc_status: "pending" | "verified" | "rejected";
  commission_rate_bps: number;
  created_at: Date;
  updated_at: Date;
}

const VendorSchema = new Schema<IVendor>(
  {
    user_id: { type: String, required: true },
    name: { type: String, required: true },
    display_name: { type: String, required: true },
    address: { type: String, required: true },
    postal_code: { type: String, required: true },
    kyc_status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending" },
    commission_rate_bps: { type: Number, required: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export default mongoose.model<IVendor>("Vendor", VendorSchema);
