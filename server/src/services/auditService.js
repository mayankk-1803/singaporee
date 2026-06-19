import { AuditLog } from '../models/index.js';
import logger from '../utils/logger.js';
import { toObjectIdOrNull } from '../utils/mongo.js';

export class AuditService {
  static async log(params) {
    try {
      const log = await AuditLog.create({
        userId: toObjectIdOrNull(params.userId),
        clinicId: toObjectIdOrNull(params.clinicId),
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId || null,
        details: params.details,
        ipAddress: params.ipAddress,
      });
      logger.info(`Audit Log Created: [${params.action}] by User [${params.userId || 'System/Guest'}] on [${params.targetType} - ${params.targetId || 'N/A'}]`);
      return log;
    } catch (error) {
      logger.error('Failed to create audit log:', error);
    }
  }
}
export default AuditService;
