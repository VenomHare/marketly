import mongoose, { Schema, Document } from "mongoose";

export interface ICouponRedemption extends Document {
  id: string;
  coupon_id: string;
  user_id: string;
  order_id: string;
  discount_paise: number;
  redeemed_at: Date;
}

const CouponRedemptionSchema = new Schema<ICouponRedemption>(
  {
    coupon_id: { type: String, required: true },
    user_id: { type: String, required: true },
    order_id: { type: String, required: true },
    discount_paise: { type: Number, required: true },
    redeemed_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "redeemed_at" } }
);

export default mongoose.model<ICouponRedemption>("CouponRedemption", CouponRedemptionSchema);
