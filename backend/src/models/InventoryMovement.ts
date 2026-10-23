import mongoose, { Schema, Document } from "mongoose";

export interface IInventoryMovement extends Document {
  id: string;
  product_id: string;
  order_item_id?: string;
  quantity_change: number;
  reason: "restock" | "purchase" | "cancellation" | "adjustment";
  created_at: Date;
}

const InventoryMovementSchema = new Schema<IInventoryMovement>(
  {
    product_id: { type: String, required: true },
    order_item_id: { type: String },
    quantity_change: { type: Number, required: true },
    reason: { type: String, enum: ["restock", "purchase", "cancellation", "adjustment"], required: true },
    created_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at" } }
);

export default mongoose.model<IInventoryMovement>("InventoryMovement", InventoryMovementSchema);
