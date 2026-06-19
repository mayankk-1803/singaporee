import mongoose from 'mongoose';
import { apiTransformPlugin, softDeletePlugin } from './plugins.js';

const DoctorSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  licenseNumber: { type: String, required: true, unique: true },
  specialization: { type: String, required: true },
  signatureUrl: { type: String, default: null },
  signaturePublicId: { type: String, default: null },
  isSuspended: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null, index: true },
}, { timestamps: true });

DoctorSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true,
});
DoctorSchema.virtual('clinic', {
  ref: 'Clinic',
  localField: 'clinicId',
  foreignField: '_id',
  justOne: true,
});
DoctorSchema.virtual('certificate', {
  ref: 'Certificate',
  localField: '_id',
  foreignField: 'doctorId',
});

DoctorSchema.plugin(apiTransformPlugin);
DoctorSchema.plugin(softDeletePlugin);

export const Doctor = mongoose.model('Doctor', DoctorSchema);
export default Doctor;
