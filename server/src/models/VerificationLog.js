import mongoose from 'mongoose';
import { apiTransformPlugin } from './plugins.js';

const VerificationLogSchema = new mongoose.Schema({
  certificateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Certificate', default: null, index: true },
  ipAddress: { type: String, required: true },
  device: { type: String, required: true },
  browser: { type: String, required: true },
  country: { type: String, required: true },
  result: { type: String, required: true, index: true },
  timestamp: { type: Date, default: Date.now, index: true },
});

VerificationLogSchema.virtual('certificate', {
  ref: 'Certificate',
  localField: 'certificateId',
  foreignField: '_id',
  justOne: true,
});
VerificationLogSchema.plugin(apiTransformPlugin);

export const VerificationLog = mongoose.model('VerificationLog', VerificationLogSchema);
export default VerificationLog;
