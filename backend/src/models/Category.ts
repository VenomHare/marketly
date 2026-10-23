import mongoose, { Schema, Document } from "mongoose";

export interface ICategory extends Document {
  id: string;
  name: string;
  slug: string;
  parent_id?: string;
}

const CategorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    parent_id: { type: String },
  }
);

export default mongoose.model<ICategory>("Category", CategorySchema);
