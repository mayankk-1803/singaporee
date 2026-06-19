import { AuditLog, Certificate, User, VerificationLog } from '../../models/index.js';
import logger from '../../utils/logger.js';
import { regexContains, serialize } from '../../utils/mongo.js';

export class LogsController {
  // Retrieve Verification Logs with advanced filtering
  static async getVerificationLogs(req, res) {
    try {
      const { clinicId, role } = req.user;
      const { result, q, startDate, endDate } = req.query;

      const filters = {};

      // Data isolation: only Super Admin can see logs across clinics
      if (role !== 'SUPER_ADMIN') {
        if (!clinicId) {
          return res.status(400).json({ error: 'No clinic context' });
        }
        const clinicCertificates = await Certificate.find({ clinicId }).select('_id');
        filters.certificateId = { $in: clinicCertificates.map((certificate) => certificate._id) };
      }

      if (result) {
        filters.result = String(result);
      }

      if (q) {
        const regex = regexContains(q);
        const matchingCertificates = await Certificate.find({
          certificateNumber: regex,
          ...(role !== 'SUPER_ADMIN' && { clinicId }),
        }).select('_id');
        filters.$or = [
          { ipAddress: regex },
          { browser: regex },
          { country: regex },
          { certificateId: { $in: matchingCertificates.map((certificate) => certificate._id) } },
        ];
      }

      if (startDate || endDate) {
        filters.timestamp = {};
        if (startDate) filters.timestamp.$gte = new Date(String(startDate));
        if (endDate) filters.timestamp.$lte = new Date(String(endDate));
      }

      const logs = serialize(await VerificationLog.find(filters)
        .sort({ timestamp: -1 })
        .populate({
          path: 'certificate',
          select: 'certificateNumber patientId',
          populate: { path: 'patient', select: 'fullName' },
        }));

      return res.status(200).json(logs);
    } catch (error) {
      logger.error('Get verification logs error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  // Retrieve Internal Audit logs
  static async getAuditLogs(req, res) {
    try {
      const { clinicId, role } = req.user;
      const { action, q, startDate, endDate } = req.query;

      const filters = {};

      if (role !== 'SUPER_ADMIN') {
        if (!clinicId) {
          return res.status(400).json({ error: 'No clinic context' });
        }
        filters.clinicId = clinicId;
      }

      if (action) {
        filters.action = String(action);
      }

      if (q) {
        const regex = regexContains(q);
        const matchingUsers = await User.find({
          $or: [{ firstName: regex }, { lastName: regex }],
          ...(role !== 'SUPER_ADMIN' && { clinicId }),
        }).select('_id');
        filters.$or = [
          { details: regex },
          { ipAddress: regex },
          { userId: { $in: matchingUsers.map((user) => user._id) } },
        ];
      }

      if (startDate || endDate) {
        filters.timestamp = {};
        if (startDate) filters.timestamp.$gte = new Date(String(startDate));
        if (endDate) filters.timestamp.$lte = new Date(String(endDate));
      }

      const logs = serialize(await AuditLog.find(filters)
        .sort({ timestamp: -1 })
        .populate({ path: 'user', select: 'firstName lastName email role' }));

      return res.status(200).json(logs);
    } catch (error) {
      logger.error('Get audit logs error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}
