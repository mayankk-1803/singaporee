import bcrypt from 'bcrypt';
import { z } from 'zod';
import { Certificate, Doctor, User } from '../../models/index.js';
import { AuditService } from '../../services/auditService.js';
import { cleanupUploadedFile, deleteAsset, uploadDoctorSignature } from '../../services/cloudinaryService.js';
import logger from '../../utils/logger.js';
import { serialize } from '../../utils/mongo.js';

const createDoctorSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  phone: z.string().optional(),
  licenseNumber: z.string().min(3),
  specialization: z.string().min(3),
});

const updateDoctorSchema = z.object({
  firstName: z.string().min(2).optional(),
  lastName: z.string().min(2).optional(),
  phone: z.string().optional(),
  specialization: z.string().min(3).optional(),
  licenseNumber: z.string().min(3).optional(),
});

export class DoctorsController {
  static async listDoctors(req, res) {
    try {
      const clinicId = req.user?.clinicId;
      const isSuperAdmin = req.user?.role === 'SUPER_ADMIN';

      if (!clinicId && !isSuperAdmin) {
        return res.status(400).json({ error: 'No clinic context' });
      }

      const query = isSuperAdmin ? {} : { clinicId };
      const doctors = serialize(await Doctor.find(query)
        .populate({ path: 'user', select: 'email firstName lastName phone isSuspended' })
        .populate({ path: 'clinic', select: 'name' }));

      const mappedDoctors = await Promise.all(doctors.map(async (doc) => ({
        ...doc,
        _count: { certificates: await Certificate.countDocuments({ doctorId: doc.id }) },
      })));

      return res.status(200).json(mappedDoctors);
    } catch (error) {
      logger.error('List doctors error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async createDoctor(req, res) {
    try {
      const clinicId = req.user?.clinicId;
      if (!clinicId) {
        return res.status(400).json({ error: 'No clinic context' });
      }

      const data = createDoctorSchema.parse(req.body);

      const existingUser = await User.findOne({ email: data.email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }

      const existingLicense = await Doctor.findOne({ licenseNumber: data.licenseNumber });
      if (existingLicense) {
        return res.status(400).json({ error: 'License number already registered' });
      }

      let signatureAsset = null;
      if (req.file) {
        signatureAsset = await uploadDoctorSignature(req.file.path);
        await cleanupUploadedFile(req.file.path);
      }

      const passwordHash = await bcrypt.hash(data.password, 12);
      const userDoc = await User.create({
        email: data.email.toLowerCase(),
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone || null,
        role: 'DOCTOR',
        clinicId,
      });
      const doctorDoc = await Doctor.create({
        userId: userDoc._id,
        clinicId,
        licenseNumber: data.licenseNumber,
        specialization: data.specialization,
        signatureUrl: signatureAsset?.secureUrl || null,
        signaturePublicId: signatureAsset?.publicId || null,
      });
      const result = { user: serialize(userDoc), doctor: serialize(doctorDoc) };

      await AuditService.log({
        userId: req.user?.userId,
        clinicId,
        action: 'DOCTOR_CREATE',
        targetType: 'DOCTOR',
        targetId: result.doctor.id,
        details: `Doctor ${data.firstName} ${data.lastName} registered with license ${data.licenseNumber}`,
        ipAddress: req.ip || '',
      });

      return res.status(201).json({
        message: 'Doctor created successfully',
        doctor: result.doctor,
      });
    } catch (error) {
      await cleanupUploadedFile(req.file?.path);
      logger.error('Create doctor error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async updateDoctor(req, res) {
    try {
      const clinicId = req.user?.clinicId;
      const { id } = req.params;

      if (!clinicId) {
        return res.status(400).json({ error: 'No clinic context' });
      }

      const data = updateDoctorSchema.parse(req.body);

      const doctor = serialize(await Doctor.findOne({ _id: id, clinicId }));

      if (!doctor) {
        return res.status(404).json({ error: 'Doctor not found' });
      }

      let signatureAsset = null;
      if (req.file) {
        signatureAsset = await uploadDoctorSignature(req.file.path);
        await cleanupUploadedFile(req.file.path);
      }

      const updated = serialize(await Doctor.findByIdAndUpdate(
        id,
        {
          specialization: data.specialization || doctor.specialization,
          licenseNumber: data.licenseNumber || doctor.licenseNumber,
          ...(signatureAsset && {
            signatureUrl: signatureAsset.secureUrl,
            signaturePublicId: signatureAsset.publicId,
          }),
        },
        { new: true }
      ));

      await User.findByIdAndUpdate(doctor.userId, {
        ...(data.firstName && { firstName: data.firstName }),
        ...(data.lastName && { lastName: data.lastName }),
        ...(data.phone && { phone: data.phone }),
      });

      if (signatureAsset && doctor.signaturePublicId) {
        await deleteAsset(doctor.signaturePublicId, 'image');
      }

      await AuditService.log({
        userId: req.user?.userId,
        clinicId,
        action: 'DOCTOR_UPDATE',
        targetType: 'DOCTOR',
        targetId: id,
        details: `Doctor profile updated: ${JSON.stringify(data)}`,
        ipAddress: req.ip || '',
      });

      return res.status(200).json({
        message: 'Doctor updated successfully',
        doctor: updated,
      });
    } catch (error) {
      await cleanupUploadedFile(req.file?.path);
      logger.error('Update doctor error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async toggleDoctorStatus(req, res) {
    try {
      const clinicId = req.user?.clinicId;
      const { id } = req.params;
      const { suspend } = z.object({ suspend: z.boolean() }).parse(req.body);

      if (!clinicId) {
        return res.status(400).json({ error: 'No clinic context' });
      }

      const doctor = serialize(await Doctor.findOne({ _id: id, clinicId }));

      if (!doctor) {
        return res.status(404).json({ error: 'Doctor not found' });
      }

      await Promise.all([
        Doctor.findByIdAndUpdate(id, { isSuspended: suspend }),
        User.findByIdAndUpdate(doctor.userId, { isSuspended: suspend }),
      ]);

      await AuditService.log({
        userId: req.user?.userId,
        clinicId,
        action: suspend ? 'DOCTOR_SUSPEND' : 'DOCTOR_ACTIVATE',
        targetType: 'DOCTOR',
        targetId: id,
        details: `Doctor status updated. Suspended: ${suspend}`,
        ipAddress: req.ip || '',
      });

      return res.status(200).json({ message: `Doctor has been ${suspend ? 'suspended' : 'activated'} successfully` });
    } catch (error) {
      logger.error('Toggle doctor status error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async deleteDoctor(req, res) {
    try {
      const clinicId = req.user?.clinicId;
      const { id } = req.params;

      if (!clinicId) {
        return res.status(400).json({ error: 'No clinic context' });
      }

      const doctor = serialize(await Doctor.findOne({ _id: id, clinicId }));

      if (!doctor) {
        return res.status(404).json({ error: 'Doctor not found' });
      }

      const deletedAt = new Date();
      await Promise.all([
        Doctor.findByIdAndUpdate(id, { deletedAt }),
        User.findByIdAndUpdate(doctor.userId, { deletedAt }),
      ]);

      if (doctor.signaturePublicId) {
        await deleteAsset(doctor.signaturePublicId, 'image');
      }

      await AuditService.log({
        userId: req.user?.userId,
        clinicId,
        action: 'DOCTOR_DELETE',
        targetType: 'DOCTOR',
        targetId: id,
        details: `Doctor soft-deleted`,
        ipAddress: req.ip || '',
      });

      return res.status(200).json({ message: 'Doctor deleted successfully' });
    } catch (error) {
      logger.error('Delete doctor error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export default DoctorsController;
