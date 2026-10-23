import mongoose, { Schema, Document } from "mongoose";

export interface IAdminAuditLog extends Document {
  id: string;
  admin_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: Date;
}

const AdminAuditLogSchema = new Schema<IAdminAuditLog>(
  {
    admin_user_id: { type: String, required: true },
    action: { type: String, required: true },
    entity_type: { type: String, required: true },
    entity_id: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at" } }
);

export default mongoose.model<IAdminAuditLog>("AdminAuditLog", AdminAuditLogSchema);
