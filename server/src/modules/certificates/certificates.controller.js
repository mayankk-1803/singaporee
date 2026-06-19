import { z } from 'zod';
import { Certificate, Clinic, Doctor, Patient } from '../../models/index.js';
import { AuditService } from '../../services/auditService.js';
import { NotificationService } from '../../services/notificationService.js';
import { PDFService } from '../../services/pdfService.js';
import { calculateCertificateHash } from '../../utils/hash.js';
import { config } from '../../config/index.js';
import logger from '../../utils/logger.js';
import { idOrNumberFilter, isObjectId, regexContains, serialize } from '../../utils/mongo.js';

const certificateTypes = [
  'MEDICAL_CERTIFICATE',
  'FITNESS_CERTIFICATE',
  'RETURN_TO_WORK_CERTIFICATE',
  'MEDICAL_REPORT',
  'VACCINATION_CERTIFICATE',
  'TRAVEL_HEALTH_CERTIFICATE',
];

const createCertificateSchema = z.object({
  patientId: z.string(),
  doctorId: z.string().optional(), // optional if logged in user is a DOCTOR
  type: z.enum(certificateTypes).default('MEDICAL_CERTIFICATE'),
  startDate: z.string(),
  endDate: z.string(),
  diagnosis: z.string().min(3),
  remarks: z.string().optional(),
});

const revokeSchema = z.object({
  reason: z.string().min(3),
});

const logDetailedError = (label, error) => {
  logger.error(`========== ${label} ==========`);
  logger.error(error);
  logger.error(`MESSAGE: ${error?.message}`);
  logger.error(`STACK: ${error?.stack}`);

  if (error?.response) {
    logger.error(`STATUS: ${error.response.status}`);
    logger.error(`DATA: ${JSON.stringify(error.response.data)}`);
  }

  if (error?.http_code) {
    logger.error(`HTTP_CODE: ${error.http_code}`);
  }
};

export class CertificatesController {
  static buildCertificatePdfData(certificate) {
    return {
      clinicName: certificate.clinic.name,
      clinicAddress: certificate.clinic.address,
      clinicPhone: certificate.clinic.contactNumber,
      clinicEmail: certificate.clinic.email,
      clinicLogoUrl: certificate.clinic.logoUrl,
      doctorName: `${certificate.doctor.user.firstName} ${certificate.doctor.user.lastName}`,
      doctorLicense: certificate.doctor.licenseNumber,
      doctorSpecialization: certificate.doctor.specialization,
      doctorSignatureUrl: certificate.doctor.signatureUrl,
      patientName: certificate.patient.fullName,
      patientIdentifier: certificate.patient.identifier,
      patientDob: certificate.patient.dob.toISOString(),
      patientGender: certificate.patient.gender,
      certificateNumber: certificate.certificateNumber,
      issueDate: certificate.issueDate.toISOString(),
      startDate: certificate.startDate.toISOString(),
      endDate: certificate.endDate.toISOString(),
      durationDays: certificate.durationDays,
      diagnosis: certificate.diagnosis,
      remarks: certificate.remarks || '',
      verificationHash: certificate.verificationHash,
      verifyUrl: certificate.qrCodeUrl || `${config.clientUrl}/verify/${certificate.certificateNumber}`,
    };
  }

  // List certificates with filters
  static async listCertificates(req, res) {
    try {
      const clinicId = req.user?.clinicId;
      const isSuperAdmin = req.user?.role === 'SUPER_ADMIN';

      if (!clinicId && !isSuperAdmin) {
        return res.status(400).json({ error: 'No clinic context' });
      }

      const { patientId, doctorId, status, q } = req.query;

      const filters = {};
      if (!isSuperAdmin) {
        filters.clinicId = clinicId;
      }
      if (patientId) filters.patientId = String(patientId);
      if (doctorId) filters.doctorId = String(doctorId);
      if (status) filters.status = status;
      
      if (q) {
        const regex = regexContains(q);
        const patients = await Patient.find({
          $or: [{ fullName: regex }, { identifier: regex }],
          ...(isSuperAdmin ? {} : { clinicId }),
        }).select('_id');
        filters.$or = [
          { certificateNumber: regex },
          { patientId: { $in: patients.map((patient) => patient._id) } },
        ];
      }

      const certificates = serialize(await Certificate.find(filters)
        .sort({ createdAt: -1 })
        .populate({ path: 'patient', select: 'fullName identifier email' })
        .populate({
          path: 'doctor',
          populate: { path: 'user', select: 'firstName lastName' },
        }));

      return res.status(200).json(certificates);
    } catch (error) {
      logger.error('List certificates error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  // Create Certificate (DOCTOR or CLINIC_ADMIN)
  static async createCertificate(req, res) {
    let generatedPdf = null;

    try {
      logger.info('[Certificate Pipeline] Step 1: Validating Request');
      const clinicId = req.user?.clinicId;
      if (!clinicId) {
        return res.status(400).json({ error: 'No clinic context' });
      }

      const data = createCertificateSchema.parse(req.body);

      // Determine Doctor context
      let selectedDoctorId = '';
      if (req.user?.role === 'DOCTOR') {
        const doctor = serialize(await Doctor.findOne({ userId: req.user.userId }));
        if (!doctor || doctor.isSuspended) {
          return res.status(403).json({ error: 'Doctor account is not active or suspended' });
        }
        selectedDoctorId = doctor.id;
      } else if (data.doctorId) {
        selectedDoctorId = data.doctorId;
      } else {
        return res.status(400).json({ error: 'Doctor context or doctorId is required' });
      }

      logger.info('[Certificate Pipeline] Step 2: Loading Patient');
      const patient = serialize(await Patient.findOne({ _id: data.patientId, clinicId }));
      if (!patient) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      logger.info('[Certificate Pipeline] Step 3: Loading Doctor');
      const doctor = serialize(await Doctor.findOne({ _id: selectedDoctorId, clinicId }).populate('user'));
      if (!doctor || doctor.isSuspended) {
        return res.status(404).json({ error: 'Doctor not found or suspended' });
      }

      const clinic = serialize(await Clinic.findById(clinicId));
      if (!clinic) {
        return res.status(404).json({ error: 'Clinic not found' });
      }

      const startDate = new Date(data.startDate);
      const endDate = new Date(data.endDate);
      
      if (endDate < startDate) {
        return res.status(400).json({ error: 'End Date cannot be earlier than Start Date' });
      }

      // Calculate Duration
      const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
      const durationDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

      logger.info('[Certificate Pipeline] Step 4: Generating Certificate Number');
      const year = new Date().getFullYear();
      const lastCertificate = serialize(await Certificate.findOne({
        certificateNumber: new RegExp(`^MC-${year}-`),
      }).sort({ certificateNumber: -1 }).select('certificateNumber'));

      const lastSequence = lastCertificate?.certificateNumber
        ? Number.parseInt(lastCertificate.certificateNumber.split('-').at(-1), 10)
        : 0;
      const nextNum = String((Number.isFinite(lastSequence) ? lastSequence : 0) + 1).padStart(6, '0');
      const certificateNumber = `MC-${year}-${nextNum}`;
      const issueDate = new Date();
      const verificationHash = calculateCertificateHash(
        certificateNumber,
        patient.id,
        doctor.id,
        issueDate
      );
      const verifyUrl = `${config.clientUrl}/verify/${certificateNumber}`;

      generatedPdf = await PDFService.generateCertificatePDF({
        clinicName: clinic.name,
        clinicAddress: clinic.address,
        clinicPhone: clinic.contactNumber,
        clinicEmail: clinic.email,
        clinicLogoUrl: clinic.logoUrl,
        doctorName: `${doctor.user.firstName} ${doctor.user.lastName}`,
        doctorLicense: doctor.licenseNumber,
        doctorSpecialization: doctor.specialization,
        doctorSignatureUrl: doctor.signatureUrl,
        patientName: patient.fullName,
        patientIdentifier: patient.identifier,
        patientDob: patient.dob.toISOString(),
        patientGender: patient.gender,
        certificateNumber,
        issueDate: issueDate.toISOString(),
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        durationDays,
        diagnosis: data.diagnosis,
        remarks: data.remarks || '',
        verificationHash,
        verifyUrl,
      });

      const certificatePayload = {
        certificateNumber,
        clinicId,
        doctorId: doctor.id,
        patientId: patient.id,
        type: data.type,
        issueDate,
        startDate,
        endDate,
        durationDays,
        diagnosis: data.diagnosis,
        remarks: data.remarks || null,
        status: 'ACTIVE',
        qrCodeUrl: verifyUrl,
        qrUrl: null,
        qrPublicId: null,
        pdfUrl: null,
        pdfPublicId: null,
        verificationHash,
      };

      logger.info('[Certificate Pipeline] Step 9: Creating Database Record');
      logger.info(`CERTIFICATE PAYLOAD ${JSON.stringify({
        certificateNumber: certificatePayload.certificateNumber,
        patientId: certificatePayload.patientId,
        doctorId: certificatePayload.doctorId,
        pdfAttachment: generatedPdf?.filename,
      })}`);

      const certificate = serialize(await Certificate.create(certificatePayload));

      // Audit Log
      await AuditService.log({
        userId: req.user?.userId,
        clinicId,
        action: 'CERTIFICATE_CREATE',
        targetType: 'CERTIFICATE',
        targetId: certificate.id,
        details: `Certificate ${certificate.certificateNumber} generated for Patient ${patient.fullName}`,
        ipAddress: req.ip || '',
      });

      logger.info('[Certificate Pipeline] Step 10: Sending Email');
      const validityPeriod = `${new Date(data.startDate).toLocaleDateString('en-SG')} to ${new Date(data.endDate).toLocaleDateString('en-SG')}`;
      const emailBody = NotificationService.getCertificateCreatedTemplate(
        clinic.name,
        patient.fullName,
        certificate.certificateNumber,
        validityPeriod,
        certificate.qrCodeUrl || ''
      );

      const emailResult = await NotificationService.sendEmail({
        userId: req.user?.userId || '',
        email: patient.email,
        subject: `Medical Certificate Issued: ${certificate.certificateNumber}`,
        body: emailBody,
        type: 'CERTIFICATE_CREATED',
        attachmentPath: generatedPdf.pdfPath,
        attachmentFilename: generatedPdf.filename,
        attachmentContentType: 'application/pdf',
      });

      if (!emailResult.success) {
        logger.error(`Certificate email failed for ${certificate.certificateNumber}:`, emailResult.error);
      }

      return res.status(201).json(certificate);
    } catch (error) {
      logDetailedError('CERTIFICATE ERROR', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      return res.status(500).json({
        success: false,
        message: error?.message || 'Internal Server Error',
      });
    } finally {
      await PDFService.cleanupTempPDF(generatedPdf?.pdfPath);
    }
  }

  // Revoke Certificate
  static async revokeCertificate(req, res) {
    try {
      const clinicId = req.user?.clinicId;
      const { id } = req.params; // certificateId or certificateNumber
      const { reason } = revokeSchema.parse(req.body);

      if (!clinicId) {
        return res.status(400).json({ error: 'No clinic context' });
      }

      const certificate = serialize(await Certificate.findOne({
        clinicId,
        ...idOrNumberFilter(id),
      })
        .populate('patient')
        .populate('clinic'));

      if (!certificate) {
        return res.status(404).json({ error: 'Certificate not found' });
      }

      if (certificate.status === 'REVOKED') {
        return res.status(400).json({ error: 'Certificate is already revoked' });
      }

      const updated = serialize(await Certificate.findByIdAndUpdate(
        certificate.id,
        { status: 'REVOKED' },
        { new: true }
      ));

      await AuditService.log({
        userId: req.user?.userId,
        clinicId,
        action: 'CERTIFICATE_REVOKE',
        targetType: 'CERTIFICATE',
        targetId: certificate.id,
        details: `Certificate ${certificate.certificateNumber} revoked. Reason: ${reason}`,
        ipAddress: req.ip || '',
      });

      // Send email notification to patient
      const emailBody = NotificationService.getCertificateRevokedTemplate(
        certificate.clinic.name,
        certificate.patient.fullName,
        certificate.certificateNumber,
        reason
      );

      NotificationService.sendEmail({
        userId: req.user?.userId || '',
        email: certificate.patient.email,
        subject: `URGENT: Medical Certificate Revoked - ${certificate.certificateNumber}`,
        body: emailBody,
        type: 'CERTIFICATE_REVOKED',
      }).catch((e) => logger.error('Async notification failed:', e));

      return res.status(200).json({
        message: 'Certificate revoked successfully',
        certificate: updated,
      });
    } catch (error) {
      logger.error('Revoke certificate error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  // Get details
  static async getCertificateDetails(req, res) {
    try {
      const clinicId = req.user?.clinicId;
      const isSuperAdmin = req.user?.role === 'SUPER_ADMIN';
      const { id } = req.params;

      if (!clinicId && !isSuperAdmin) {
        return res.status(400).json({ error: 'No clinic context' });
      }

      const whereClause = { id };
      if (!isSuperAdmin) {
        whereClause.clinicId = clinicId;
      }

      if (!isObjectId(id)) {
        return res.status(404).json({ error: 'Certificate not found' });
      }

      const certificate = serialize(await Certificate.findOne({
        _id: id,
        ...(whereClause.clinicId && { clinicId: whereClause.clinicId }),
      })
        .populate('patient')
        .populate({
          path: 'doctor',
          populate: { path: 'user', select: 'firstName lastName' },
        })
        .populate('clinic')
        .populate('certificatefile'));

      if (!certificate) {
        return res.status(404).json({ error: 'Certificate not found' });
      }

      return res.status(200).json(certificate);
    } catch (error) {
      logger.error('Get certificate details error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async downloadCertificate(req, res) {
    let generatedPdf = null;

    try {
      const clinicId = req.user?.clinicId;
      const isSuperAdmin = req.user?.role === 'SUPER_ADMIN';
      const { id } = req.params;

      if (!clinicId && !isSuperAdmin) {
        return res.status(400).json({ error: 'No clinic context' });
      }

      const whereClause = idOrNumberFilter(id);
      if (!isSuperAdmin) {
        whereClause.clinicId = clinicId;
      }

      const certificate = serialize(await Certificate.findOne(whereClause)
        .populate('patient')
        .populate({
          path: 'doctor',
          populate: { path: 'user', select: 'firstName lastName' },
        })
        .populate('clinic'));

      if (!certificate || certificate.deletedAt) {
        return res.status(404).json({ error: 'Certificate not found' });
      }

      generatedPdf = await PDFService.generateCertificatePDF(CertificatesController.buildCertificatePdfData(certificate));

      res.download(generatedPdf.pdfPath, generatedPdf.filename, async (error) => {
        await PDFService.cleanupTempPDF(generatedPdf?.pdfPath);
        generatedPdf = null;

        if (error && !res.headersSent) {
          logger.error('Certificate download error:', error);
          res.status(500).json({ error: 'Failed to download certificate' });
        }
      });
    } catch (error) {
      await PDFService.cleanupTempPDF(generatedPdf?.pdfPath);
      logger.error('Download certificate error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export default CertificatesController;
