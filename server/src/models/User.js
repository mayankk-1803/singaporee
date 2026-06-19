import mongoose from 'mongoose';
import { apiTransformPlugin, softDeletePlugin } from './plugins.js';

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role: {
    type: String,
    enum: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF', 'PATIENT'],
    default: 'PATIENT',
    index: true,
  },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phone: { type: String, default: null },
  isSuspended: { type: Boolean, default: false },
  clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', default: null, index: true },
  deletedAt: { type: Date, default: null, index: true },
}, { timestamps: true });

UserSchema.virtual('clinic', {
  ref: 'Clinic',
  localField: 'clinicId',
  foreignField: '_id',
  justOne: true,
});
UserSchema.virtual('doctor', {
  ref: 'Doctor',
  localField: '_id',
  foreignField: 'userId',
  justOne: true,
});
UserSchema.virtual('staff', {
  ref: 'Staff',
  localField: '_id',
  foreignField: 'userId',
  justOne: true,
});

UserSchema.plugin(apiTransformPlugin);
UserSchema.plugin(softDeletePlugin);

export const User = mongoose.model('User', UserSchema);
export default User;
