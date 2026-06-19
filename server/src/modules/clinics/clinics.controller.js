import { z } from 'zod';
import { Clinic, Doctor, Staff, User } from '../../models/index.js';
import { AuditService } from '../../services/auditService.js';
import { cleanupUploadedFile, deleteAsset, uploadClinicLogo } from '../../services/cloudinaryService.js';
import logger from '../../utils/logger.js';
import { serialize } from '../../utils/mongo.js';

const updateClinicSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  contactNumber: z.string().optional(),
  address: z.string().optional(),
  themeConfig: z.string().optional(),
});

export class ClinicsController {
  static async getClinicProfile(req, res) {
    try {
      const clinicId = req.user?.clinicId;
      if (!clinicId) {
        return res.status(400).json({ error: 'No clinic context' });
      }

      const clinic = serialize(await Clinic.findById(clinicId).populate({
        path: 'subscription',
        options: { sort: { createdAt: -1 } },
        perDocumentLimit: 1,
      }));

      if (!clinic) {
        return res.status(404).json({ error: 'Clinic not found' });
      }

      return res.status(200).json(clinic);
    } catch (error) {
      logger.error('Get clinic profile error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async updateClinicProfile(req, res) {
    try {
      const clinicId = req.user?.clinicId;
      if (!clinicId) {
        return res.status(400).json({ error: 'No clinic context' });
      }

      const updateData = updateClinicSchema.parse(req.body);
      
      const previousClinic = serialize(await Clinic.findById(clinicId).select('logoPublicId'));

      let logoAsset = null;
      if (req.file) {
        logoAsset = await uploadClinicLogo(req.file.path);
        await cleanupUploadedFile(req.file.path);
      }

      const clinic = serialize(await Clinic.findByIdAndUpdate(
        clinicId,
        {
          ...updateData,
          ...(logoAsset && { logoUrl: logoAsset.secureUrl, logoPublicId: logoAsset.publicId }),
        },
        { new: true }
      ));

      if (logoAsset && previousClinic?.logoPublicId) {
        await deleteAsset(previousClinic.logoPublicId, 'image');
      }

      await AuditService.log({
        userId: req.user?.userId,
        clinicId,
        action: 'CLINIC_UPDATE',
        targetType: 'CLINIC',
        targetId: clinicId,
        details: `Clinic profile updated: ${JSON.stringify(updateData)}`,
        ipAddress: req.ip || '',
      });

      return res.status(200).json({
        message: 'Clinic profile updated successfully',
        clinic,
      });
    } catch (error) {
      await cleanupUploadedFile(req.file?.path);
      logger.error('Update clinic profile error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async listAllClinics(req, res) {
    try {
      const clinics = serialize(await Clinic.find()
        .populate({
          path: 'user',
          match: { role: 'CLINIC_ADMIN', deletedAt: null },
          select: 'email firstName lastName isSuspended',
        })
        .populate({
          path: 'subscription',
          options: { sort: { createdAt: -1 } },
          perDocumentLimit: 1,
        }));

      const mappedClinics = clinics.map((clinic) => ({
        ...clinic,
        users: clinic.user || [],
        subscriptions: clinic.subscription || [],
      }));

      return res.status(200).json(mappedClinics);
    } catch (error) {
      logger.error('List clinics error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async toggleClinicStatus(req, res) {
    try {
      const { id } = req.params;
      const { suspend } = z.object({ suspend: z.boolean() }).parse(req.body);

      const clinic = serialize(await Clinic.findById(id));

      if (!clinic) {
        return res.status(404).json({ error: 'Clinic not found' });
      }

      await Promise.all([
        User.updateMany({ clinicId: id, deletedAt: null }, { isSuspended: suspend }),
        Doctor.updateMany({ clinicId: id, deletedAt: null }, { isSuspended: suspend }),
        Staff.updateMany({ clinicId: id, deletedAt: null }, { isSuspended: suspend }),
      ]);

      await AuditService.log({
        userId: req.user?.userId,
        clinicId: null,
        action: suspend ? 'CLINIC_SUSPEND' : 'CLINIC_ACTIVATE',
        targetType: 'CLINIC',
        targetId: id,
        details: `Clinic ${clinic.name} ${suspend ? 'suspended' : 'activated'} by Super Admin`,
        ipAddress: req.ip || '',
      });

      return res.status(200).json({
        message: `Clinic has been successfully ${suspend ? 'suspended' : 'activated'}.`,
      });
    } catch (error) {
      logger.error('Toggle clinic status error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export default ClinicsController;
