import { z } from 'zod';
import { Certificate, VerificationLog } from '../../models/index.js';
import logger from '../../utils/logger.js';
import { serialize } from '../../utils/mongo.js';

const verifySchema = z.object({
  certificateNumber: z.string(),
  identifier: z.string(), // Passport / NRIC
});

export class VerificationController {
  static async verifyCertificate(req, res) {
    let certificateId = null;
    let resultStatus = 'FAILED_INVALID_CERT';

    try {
      const { certificateNumber, identifier } = verifySchema.parse(req.body);

      // Fetch certificate
      const certificate = serialize(await Certificate.findOne({ certificateNumber })
        .populate('patient')
        .populate({
          path: 'doctor',
          populate: { path: 'user', select: 'firstName lastName' },
        })
        .populate('clinic'));

      // Simple user agent parser for logging
      const userAgent = req.headers['user-agent'] || 'Unknown';
      let browser = 'Unknown Browser';
      let device = 'Desktop';
      if (/mobile/i.test(userAgent)) device = 'Mobile';
      if (/tablet/i.test(userAgent)) device = 'Tablet';
      if (/chrome|crios/i.test(userAgent)) browser = 'Chrome';
      else if (/safari/i.test(userAgent)) browser = 'Safari';
      else if (/firefox|fxios/i.test(userAgent)) browser = 'Firefox';
      else if (/msie|trident/i.test(userAgent)) browser = 'IE';

      const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';
      const country = req.headers['cf-ipcountry'] || 'Singapore'; // Default to SG for local testing

      if (!certificate || certificate.deletedAt) {
        // Log verification failure
        await VerificationLog.create({
          certificateId: null,
          ipAddress,
          device,
          browser,
          country,
          result: 'FAILED_INVALID_CERT',
        });
        return res.status(404).json({ error: 'Certificate not found' });
      }

      certificateId = certificate.id;

      // Validate patient identity
      if (certificate.patient.identifier.toLowerCase().trim() !== identifier.toLowerCase().trim()) {
        await VerificationLog.create({
          certificateId,
          ipAddress,
          device,
          browser,
          country,
          result: 'FAILED_IDENTITY_MISMATCH',
        });
        return res.status(404).json({ error: 'Certificate matches, but patient identity does not match' });
      }

      // Check certificate expiry/status
      const now = new Date();
      let status = certificate.status;
      
      if (status === 'ACTIVE' && now > certificate.endDate) {
        status = 'EXPIRED';
      }

      if (status === 'REVOKED') {
        resultStatus = 'FAILED_REVOKED';
      } else if (status === 'EXPIRED') {
        resultStatus = 'FAILED_EXPIRED';
      } else if (status === 'CANCELLED') {
        resultStatus = 'FAILED_CANCELLED';
      } else {
        resultStatus = 'SUCCESS';
      }

      // Record successful lookup log
      await VerificationLog.create({
        certificateId,
        ipAddress,
        device,
        browser,
        country,
        result: resultStatus,
      });

      return res.status(200).json({
        certificateNumber: certificate.certificateNumber,
        status, // ACTIVE, EXPIRED, REVOKED, CANCELLED
        clinicName: certificate.clinic.name,
        doctorName: `Dr. ${certificate.doctor.user.firstName} ${certificate.doctor.user.lastName}`,
        patientName: certificate.patient.fullName,
        patientIdentifier: certificate.patient.identifier,
        issueDate: certificate.issueDate,
        startDate: certificate.startDate,
        endDate: certificate.endDate,
        durationDays: certificate.durationDays,
        verificationHash: certificate.verificationHash,
        pdfUrl: certificate.pdfUrl,
        qrUrl: certificate.qrUrl,
        clinicLogoUrl: certificate.clinic.logoUrl,
        doctorSignatureUrl: certificate.doctor.signatureUrl,
      });
    } catch (error) {
      logger.error('Verification portal error:', error);
      
      // Fallback log
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  // Verification GET route directly by scanning QR (e.g. /verify/:certNo)
  static async queryCertificateExistence(req, res) {
    try {
      const { certNo } = req.params;

      const certificate = serialize(await Certificate.findOne({ certificateNumber: certNo }).populate('clinic'));

      if (!certificate || certificate.deletedAt) {
        return res.status(404).json({ error: 'Certificate not found' });
      }

      return res.status(200).json({
        certificateNumber: certificate.certificateNumber,
        clinicName: certificate.clinic.name,
        requiresVerification: true,
      });
    } catch (error) {
      logger.error('Certificate check existence error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}
