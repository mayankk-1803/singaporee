import mongoose from 'mongoose';
import { apiTransformPlugin, softDeletePlugin } from './plugins.js';

const ClinicSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  contactNumber: { type: String, required: true },
  email: { type: String, required: true },
  logoUrl: { type: String, default: null },
  logoPublicId: { type: String, default: null },
  themeConfig: { type: String, default: null },
  deletedAt: { type: Date, default: null, index: true },
}, { timestamps: true });

ClinicSchema.virtual('user', {
  ref: 'User',
  localField: '_id',
  foreignField: 'clinicId',
});
ClinicSchema.virtual('subscription', {
  ref: 'Subscription',
  localField: '_id',
  foreignField: 'clinicId',
});

ClinicSchema.plugin(apiTransformPlugin);
ClinicSchema.plugin(softDeletePlugin);

export const Clinic = mongoose.model('Clinic', ClinicSchema);
export default Clinic;
