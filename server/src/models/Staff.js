import mongoose from 'mongoose';
import { apiTransformPlugin, softDeletePlugin } from './plugins.js';

const StaffSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  position: { type: String, required: true },
  isSuspended: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null, index: true },
}, { timestamps: true });

StaffSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true,
});
StaffSchema.virtual('clinic', {
  ref: 'Clinic',
  localField: 'clinicId',
  foreignField: '_id',
  justOne: true,
});

StaffSchema.plugin(apiTransformPlugin);
StaffSchema.plugin(softDeletePlugin);

export const Staff = mongoose.model('Staff', StaffSchema);
export default Staff;
