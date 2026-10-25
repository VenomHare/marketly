import mongoose, { Document, Schema } from "mongoose";

export interface IVendorKyc extends Document {
  id: string;
  vendor_id: string;
  address_proof_key: string;
  identity_proof_key: string;
  status: "pending" | "verified" | "rejected";
  reviewed_by_user_id?: string;
  reviewed_at?: Date;
  rejection_reason?: string;
  submitted_at: Date;
  created_at: Date;
  updated_at: Date;
}

const VendorKycSchema = new Schema<IVendorKyc>(
  {
    vendor_id: { type: String, required: true, unique: true },
    address_proof_key: { type: String, required: true },
    identity_proof_key: { type: String, required: true },
    status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending" },
    reviewed_by_user_id: { type: String },
    reviewed_at: { type: Date },
    rejection_reason: { type: String },
    submitted_at: { type: Date, default: Date.now },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export default mongoose.model<IVendorKyc>("VendorKyc", VendorKycSchema);
