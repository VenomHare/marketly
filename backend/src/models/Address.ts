import mongoose, { Schema, Document } from "mongoose";

export interface IAddress extends Document {
  id: string;
  user_id: string;
  label: string;
  first_line: string;
  second_line?: string;
  postal_code: string;
  city: string;
  state: string;
  country: string;
  addressee_name: string;
  contact_number: string;
  created_at: Date;
}

const AddressSchema = new Schema<IAddress>(
  {
    user_id: { type: String, required: true },
    label: { type: String, required: true },
    first_line: { type: String, required: true },
    second_line: { type: String },
    postal_code: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, required: true },
    addressee_name: { type: String, required: true },
    contact_number: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at" } }
);

export default mongoose.model<IAddress>("Address", AddressSchema);
