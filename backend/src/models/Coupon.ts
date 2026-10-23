import mongoose, { Schema, Document } from "mongoose";

export interface ICoupon extends Document {
  id: string;
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  max_discount_paise?: number;
  min_order_paise?: number;
  usage_limit?: number;
  starts_at: Date;
  expires_at: Date;
  is_active: boolean;
}

const CouponSchema = new Schema<ICoupon>(
  {
    code: { type: String, required: true, unique: true },
    discount_type: { type: String, enum: ["percentage", "fixed"], required: true },
    discount_value: { type: Number, required: true },
    max_discount_paise: { type: Number },
    min_order_paise: { type: Number },
    usage_limit: { type: Number },
    starts_at: { type: Date, required: true },
    expires_at: { type: Date, required: true },
    is_active: { type: Boolean, default: true },
  }
);

export default mongoose.model<ICoupon>("Coupon", CouponSchema);
