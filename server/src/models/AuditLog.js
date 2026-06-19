import mongoose from 'mongoose';
import { apiTransformPlugin } from './plugins.js';

const AuditLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', default: null, index: true },
  action: { type: String, required: true },
  targetType: { type: String, required: true },
  targetId: { type: String, default: null },
  details: { type: String, required: true },
  ipAddress: { type: String, required: true },
  timestamp: { type: Date, default: Date.now, index: true },
});

AuditLogSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true,
});
AuditLogSchema.virtual('clinic', {
  ref: 'Clinic',
  localField: 'clinicId',
  foreignField: '_id',
  justOne: true,
});
AuditLogSchema.plugin(apiTransformPlugin);

export const AuditLog = mongoose.model('AuditLog', AuditLogSchema);
export default AuditLog;
