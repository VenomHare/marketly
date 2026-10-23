import mongoose, { Schema, Document } from "mongoose";

export interface IOrderItem extends Document {
  id: string;
  order_id: string;
  product_id: string;
  vendor_id: string;
  product_name: string;
  sku: string;
  unit_price_paise: number;
  quantity: number;
  discount_paise: number;
  line_total_paise: number;
}

const OrderItemSchema = new Schema<IOrderItem>(
  {
    order_id: { type: String, required: true },
    product_id: { type: String, required: true },
    vendor_id: { type: String, required: true },
    product_name: { type: String, required: true },
    sku: { type: String, required: true },
    unit_price_paise: { type: Number, required: true },
    quantity: { type: Number, required: true },
    discount_paise: { type: Number, required: true },
    line_total_paise: { type: Number, required: true },
  }
);

export default mongoose.model<IOrderItem>("OrderItem", OrderItemSchema);
