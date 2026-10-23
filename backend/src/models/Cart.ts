import mongoose, { Schema, Document } from "mongoose";

export interface ICart extends Document {
  id: string;
  user_id?: string;
  session_id?: string;
  updated_at: Date;
  expires_at?: Date;
}

const CartSchema = new Schema<ICart>(
  {
    user_id: { type: String },
    session_id: { type: String },
    updated_at: { type: Date, default: Date.now },
    expires_at: { type: Date },
  },
  { timestamps: { updatedAt: "updated_at" } }
);

export default mongoose.model<ICart>("Cart", CartSchema);
