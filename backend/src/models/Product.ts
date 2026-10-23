import mongoose, { Schema, Document } from "mongoose";

export interface IProduct extends Document {
  id: string;
  vendor_id: string;
  category_id: string;
  name: string;
  description: string;
  sku: string;
  price: number;
  stock: number;
  average_rating: number;
  review_count: number;
  status: "draft" | "active" | "archived";
  created_at: Date;
  updated_at: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    vendor_id: { type: String, required: true },
    category_id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    sku: { type: String, required: true },
    price: { type: Number, required: true },
    stock: { type: Number, required: true },
    average_rating: { type: Number, default: 0 },
    review_count: { type: Number, default: 0 },
    status: { type: String, enum: ["draft", "active", "archived"], default: "draft" },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export default mongoose.model<IProduct>("Product", ProductSchema);
