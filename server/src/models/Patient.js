import mongoose from 'mongoose';
import { apiTransformPlugin, softDeletePlugin } from './plugins.js';

const PatientSchema = new mongoose.Schema({
  clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  fullName: { type: String, required: true },
  identifier: { type: String, required: true, index: true },
  dob: { type: Date, required: true },
  gender: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true },
  deletedAt: { type: Date, default: null, index: true },
}, { timestamps: true });

PatientSchema.index({ clinicId: 1, identifier: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
PatientSchema.virtual('certificate', {
  ref: 'Certificate',
  localField: '_id',
  foreignField: 'patientId',
});

PatientSchema.plugin(apiTransformPlugin);
PatientSchema.plugin(softDeletePlugin);

export const Patient = mongoose.model('Patient', PatientSchema);
export default Patient;
