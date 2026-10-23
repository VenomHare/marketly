import mongoose, { Schema, Document } from "mongoose";

export interface IShipment extends Document {
  id: string;
  vendor_order_id: string;
  carrier?: string;
  tracking_number?: string;
  tracking_url?: string;
  shipped_at?: Date;
  delivered_at?: Date;
}

const ShipmentSchema = new Schema<IShipment>(
  {
    vendor_order_id: { type: String, required: true },
    carrier: { type: String },
    tracking_number: { type: String },
    tracking_url: { type: String },
    shipped_at: { type: Date },
    delivered_at: { type: Date },
  }
);

export default mongoose.model<IShipment>("Shipment", ShipmentSchema);
