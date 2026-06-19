import mongoose from 'mongoose';
import { apiTransformPlugin } from './plugins.js';

const SettingSchema = new mongoose.Schema({
  clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  key: { type: String, required: true },
  value: { type: String, required: true },
}, { timestamps: true });

SettingSchema.index({ clinicId: 1, key: 1 }, { unique: true });
SettingSchema.plugin(apiTransformPlugin);

export const Setting = mongoose.model('Setting', SettingSchema);
export default Setting;
