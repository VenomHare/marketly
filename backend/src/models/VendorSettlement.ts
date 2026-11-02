import mongoose, { Schema, Document } from "mongoose";

export interface IVendorSettlement extends Document {
  id: string;
  vendor_order_id: string;
  vendor_id: string;
  gross_paise: number;
  commission_paise: number;
  refund_paise: number;
  commission_reversed_paise: number;
  net_paise: number;
  status: "pending" | "processing" | "paid" | "failed";
  provider_transfer_id?: string;
  payout_balance_offset_paise: number;
  simulated_payout: boolean;
  created_at: Date;
  settled_at?: Date;
}

const VendorSettlementSchema = new Schema<IVendorSettlement>(
  {
    vendor_order_id: { type: String, required: true },
    vendor_id: { type: String, required: true },
    gross_paise: { type: Number, required: true },
    commission_paise: { type: Number, required: true },
    refund_paise: { type: Number, required: true },
    commission_reversed_paise: { type: Number, default: 0 },
    net_paise: { type: Number, required: true },
    status: { type: String, enum: ["pending", "processing", "paid", "failed"], default: "pending" },
    provider_transfer_id: { type: String },
    payout_balance_offset_paise: { type: Number, default: 0 },
    simulated_payout: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now },
    settled_at: { type: Date },
  },
  { timestamps: { createdAt: "created_at" } }
);

VendorSettlementSchema.index({ vendor_order_id: 1 }, { unique: true });

export default mongoose.model<IVendorSettlement>("VendorSettlement", VendorSettlementSchema);
