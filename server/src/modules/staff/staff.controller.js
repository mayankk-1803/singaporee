import bcrypt from 'bcrypt';
import { z } from 'zod';
import { Staff, User } from '../../models/index.js';
import { AuditService } from '../../services/auditService.js';
import logger from '../../utils/logger.js';
import { serialize } from '../../utils/mongo.js';

const createStaffSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  phone: z.string().optional(),
  position: z.string().min(2),
});

const updateStaffSchema = z.object({
  firstName: z.string().min(2).optional(),
  lastName: z.string().min(2).optional(),
  phone: z.string().optional(),
  position: z.string().min(2).optional(),
});

export class StaffController {
  static async listStaff(req, res) {
    try {
      const clinicId = req.user?.clinicId;
      if (!clinicId) {
        return res.status(400).json({ error: 'No clinic context' });
      }

      const staff = serialize(await Staff.find({ clinicId }).populate({
        path: 'user',
        select: 'email firstName lastName phone isSuspended',
      }));

      return res.status(200).json(staff);
    } catch (error) {
      logger.error('List staff error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async createStaff(req, res) {
    try {
      const clinicId = req.user?.clinicId;
      if (!clinicId) {
        return res.status(400).json({ error: 'No clinic context' });
      }

      const data = createStaffSchema.parse(req.body);

      const existingUser = await User.findOne({ email: data.email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      const passwordHash = await bcrypt.hash(data.password, 12);
      const userDoc = await User.create({
        email: data.email.toLowerCase(),
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone || null,
        role: 'STAFF',
        clinicId,
      });
      const staffDoc = await Staff.create({
        userId: userDoc._id,
        clinicId,
        position: data.position,
      });
      const result = { user: serialize(userDoc), staff: serialize(staffDoc) };

      await AuditService.log({
        userId: req.user?.userId,
        clinicId,
        action: 'STAFF_CREATE',
        targetType: 'STAFF',
        targetId: result.staff.id,
        details: `Staff ${data.firstName} ${data.lastName} registered as ${data.position}`,
        ipAddress: req.ip || '',
      });

      return res.status(201).json({
        message: 'Staff created successfully',
        staff: result.staff,
      });
    } catch (error) {
      logger.error('Create staff error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async updateStaff(req, res) {
    try {
      const clinicId = req.user?.clinicId;
      const { id } = req.params;

      if (!clinicId) {
        return res.status(400).json({ error: 'No clinic context' });
      }

      const data = updateStaffSchema.parse(req.body);

      const staff = serialize(await Staff.findOne({ _id: id, clinicId }));

      if (!staff) {
        return res.status(404).json({ error: 'Staff not found' });
      }

      const updated = serialize(await Staff.findByIdAndUpdate(
        id,
        { position: data.position || staff.position },
        { new: true }
      ));

      await User.findByIdAndUpdate(staff.userId, {
        ...(data.firstName && { firstName: data.firstName }),
        ...(data.lastName && { lastName: data.lastName }),
        ...(data.phone && { phone: data.phone }),
      });

      await AuditService.log({
        userId: req.user?.userId,
        clinicId,
        action: 'STAFF_UPDATE',
        targetType: 'STAFF',
        targetId: id,
        details: `Staff profile updated: ${JSON.stringify(data)}`,
        ipAddress: req.ip || '',
      });

      return res.status(200).json({
        message: 'Staff updated successfully',
        staff: updated,
      });
    } catch (error) {
      logger.error('Update staff error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async toggleStaffStatus(req, res) {
    try {
      const clinicId = req.user?.clinicId;
      const { id } = req.params;
      const { suspend } = z.object({ suspend: z.boolean() }).parse(req.body);

      if (!clinicId) {
        return res.status(400).json({ error: 'No clinic context' });
      }

      const staff = serialize(await Staff.findOne({ _id: id, clinicId }));

      if (!staff) {
        return res.status(404).json({ error: 'Staff not found' });
      }

      await Promise.all([
        Staff.findByIdAndUpdate(id, { isSuspended: suspend }),
        User.findByIdAndUpdate(staff.userId, { isSuspended: suspend }),
      ]);

      await AuditService.log({
        userId: req.user?.userId,
        clinicId,
        action: suspend ? 'STAFF_SUSPEND' : 'STAFF_ACTIVATE',
        targetType: 'STAFF',
        targetId: id,
        details: `Staff status updated. Suspended: ${suspend}`,
        ipAddress: req.ip || '',
      });

      return res.status(200).json({ message: `Staff has been ${suspend ? 'suspended' : 'activated'} successfully` });
    } catch (error) {
      logger.error('Toggle staff status error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async deleteStaff(req, res) {
    try {
      const clinicId = req.user?.clinicId;
      const { id } = req.params;

      if (!clinicId) {
        return res.status(400).json({ error: 'No clinic context' });
      }

      const staff = serialize(await Staff.findOne({ _id: id, clinicId }));

      if (!staff) {
        return res.status(404).json({ error: 'Staff not found' });
      }

      const deletedAt = new Date();
      await Promise.all([
        Staff.findByIdAndUpdate(id, { deletedAt }),
        User.findByIdAndUpdate(staff.userId, { deletedAt }),
      ]);

      await AuditService.log({
        userId: req.user?.userId,
        clinicId,
        action: 'STAFF_DELETE',
        targetType: 'STAFF',
        targetId: id,
        details: `Staff soft-deleted`,
        ipAddress: req.ip || '',
      });

      return res.status(200).json({ message: 'Staff deleted successfully' });
    } catch (error) {
      logger.error('Delete staff error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export default StaffController;
