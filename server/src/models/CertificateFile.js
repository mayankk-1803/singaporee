import mongoose from 'mongoose';
import { apiTransformPlugin } from './plugins.js';

const CertificateFileSchema = new mongoose.Schema({
  certificateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Certificate', required: true, index: true },
  fileUrl: { type: String, required: true },
  filePublicId: { type: String, default: null },
  fileType: { type: String, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

CertificateFileSchema.virtual('certificate', {
  ref: 'Certificate',
  localField: 'certificateId',
  foreignField: '_id',
  justOne: true,
});
CertificateFileSchema.plugin(apiTransformPlugin);

export const CertificateFile = mongoose.model('CertificateFile', CertificateFileSchema);
export default CertificateFile;
