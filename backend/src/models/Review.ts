import mongoose, { Schema, Document } from "mongoose";

export interface IReview extends Document {
  id: string;
  product_id: string;
  user_id: string;
  order_item_id: string;
  rating: number;
  title?: string;
  comment: string;
  created_at: Date;
}

const ReviewSchema = new Schema<IReview>(
  {
    product_id: { type: String, required: true },
    user_id: { type: String, required: true },
    order_item_id: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String },
    comment: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at" } }
);

ReviewSchema.index({ order_item_id: 1 }, { unique: true });

export default mongoose.model<IReview>("Review", ReviewSchema);
