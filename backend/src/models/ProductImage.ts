import mongoose, { Schema, Document } from "mongoose";

export interface IProductImage extends Document {
  id: string;
  product_id: string;
  object_key: string;
  alt_text?: string;
  position: number;
}

const ProductImageSchema = new Schema<IProductImage>(
  {
    product_id: { type: String, required: true },
    object_key: { type: String, required: true },
    alt_text: { type: String },
    position: { type: Number, required: true },
  }
);

ProductImageSchema.index({ product_id: 1, object_key: 1 }, { unique: true });

export default mongoose.model<IProductImage>("ProductImage", ProductImageSchema);
