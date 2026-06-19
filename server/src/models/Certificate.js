import mongoose from 'mongoose';
import { apiTransformPlugin, softDeletePlugin } from './plugins.js';

const CertificateSchema = new mongoose.Schema({
  certificateNumber: { type: String, required: true, unique: true, index: true },
  clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  type: {
    type: String,
    enum: ['MEDICAL_CERTIFICATE', 'FITNESS_CERTIFICATE', 'RETURN_TO_WORK_CERTIFICATE', 'MEDICAL_REPORT', 'VACCINATION_CERTIFICATE', 'TRAVEL_HEALTH_CERTIFICATE'],
    default: 'MEDICAL_CERTIFICATE',
  },
  issueDate: { type: Date, default: Date.now, index: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  durationDays: { type: Number, required: true },
  diagnosis: { type: String, required: true },
  remarks: { type: String, default: null },
  status: {
    type: String,
    enum: ['DRAFT', 'ISSUED', 'ACTIVE', 'EXPIRED', 'REVOKED', 'CANCELLED'],
    default: 'ACTIVE',
    index: true,
  },
  qrCodeUrl: { type: String, default: null },
  qrUrl: { type: String, default: null },
  qrPublicId: { type: String, default: null },
  pdfUrl: { type: String, default: null },
  pdfPublicId: { type: String, default: null },
  verificationHash: { type: String, required: true, unique: true, index: true },
  deletedAt: { type: Date, default: null, index: true },
}, { timestamps: true });

CertificateSchema.virtual('clinic', {
  ref: 'Clinic',
  localField: 'clinicId',
  foreignField: '_id',
  justOne: true,
});
CertificateSchema.virtual('doctor', {
  ref: 'Doctor',
  localField: 'doctorId',
  foreignField: '_id',
  justOne: true,
});
CertificateSchema.virtual('patient', {
  ref: 'Patient',
  localField: 'patientId',
  foreignField: '_id',
  justOne: true,
});
CertificateSchema.virtual('certificatefile', {
  ref: 'CertificateFile',
  localField: '_id',
  foreignField: 'certificateId',
});
CertificateSchema.virtual('verificationlog', {
  ref: 'VerificationLog',
  localField: '_id',
  foreignField: 'certificateId',
});

CertificateSchema.plugin(apiTransformPlugin);
CertificateSchema.plugin(softDeletePlugin);

export const Certificate = mongoose.model('Certificate', CertificateSchema);
export default Certificate;
