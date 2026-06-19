import { z } from 'zod';
import { AuditLog, Certificate, Patient } from '../../models/index.js';
import { AuditService } from '../../services/auditService.js';
import logger from '../../utils/logger.js';
import { regexContains, serialize } from '../../utils/mongo.js';

const createPatientSchema = z.object({
  fullName: z.string().min(2),
  identifier: z.string().min(3),
  dob: z.string().or(z.date()),
  gender: z.string(),
  phone: z.string(),
  email: z.string().email(),
});

export class PatientsController {
  static async listPatients(req, res) {
    try {
      const clinicId = req.user?.clinicId;
      const isSuperAdmin = req.user?.role === 'SUPER_ADMIN';

      if (!clinicId && !isSuperAdmin) {
        return res.status(400).json({ error: 'No clinic context' });
      }

      const { q } = req.query;
      const query = {};
      if (q) {
        const regex = regexContains(q);
        query.$or = [
          { fullName: regex },
          { identifier: regex },
          { email: regex },
        ];
      }
      if (!isSuperAdmin) {
        query.clinicId = clinicId;
      }

      const patients = serialize(await Patient.find(query).sort({ createdAt: -1 }));
      const mappedPatients = await Promise.all(patients.map(async (patient) => ({
        ...patient,
        _count: { certificates: await Certificate.countDocuments({ patientId: patient.id }) },
      })));

      return res.status(200).json(mappedPatients);
    } catch (error) {
      logger.error('List patients error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async createPatient(req, res) {
    try {
      const clinicId = req.user?.clinicId;
      if (!clinicId) {
        return res.status(400).json({ error: 'No clinic context' });
      }

      const data = createPatientSchema.parse(req.body);

      const existingPatient = await Patient.findOne({ clinicId, identifier: data.identifier });

      if (existingPatient) {
        return res.status(400).json({ error: 'Patient with this identifier already exists in this clinic' });
      }

      const patient = serialize(await Patient.create({
        clinicId,
        fullName: data.fullName,
        identifier: data.identifier,
        dob: new Date(data.dob),
        gender: data.gender,
        phone: data.phone,
        email: data.email,
      }));

      await AuditService.log({
        userId: req.user?.userId,
        clinicId,
        action: 'PATIENT_CREATE',
        targetType: 'PATIENT',
        targetId: patient.id,
        details: `Patient ${data.fullName} registered with ID ${data.identifier}`,
        ipAddress: req.ip || '',
      });

      return res.status(201).json(patient);
    } catch (error) {
      logger.error('Create patient error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async getPatientDetails(req, res) {
    try {
      const clinicId = req.user?.clinicId;
      const { id } = req.params;

      if (!clinicId) {
        return res.status(400).json({ error: 'No clinic context' });
      }

      const patient = serialize(await Patient.findOne({ _id: id, clinicId }));

      if (!patient) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      const certificates = serialize(await Certificate.find({ patientId: id })
        .sort({ issueDate: -1 })
        .populate({
          path: 'doctor',
          populate: { path: 'user', select: 'firstName lastName' },
        })
        .populate('certificatefile'));

      const timeline = certificates.map((cert) => ({
        id: cert.id,
        type: 'CERTIFICATE_ISSUED',
        date: cert.issueDate,
        title: `${cert.type.replace(/_/g, ' ')} Issued`,
        description: `Issued by Dr. ${cert.doctor.user.firstName} ${cert.doctor.user.lastName} (MC# ${cert.certificateNumber})`,
        status: cert.status,
        meta: {
          diagnosis: cert.diagnosis,
          durationDays: cert.durationDays,
          startDate: cert.startDate,
          endDate: cert.endDate,
        },
      }));

      const audits = serialize(await AuditLog.find({
        clinicId,
        targetType: 'PATIENT',
        targetId: id,
      }).sort({ timestamp: -1 }));

      const auditTimeline = audits.map((audit) => ({
        id: audit.id,
        type: audit.action,
        date: audit.timestamp,
        title: audit.action.replace(/_/g, ' '),
        description: audit.details,
        status: 'INFO',
        meta: {},
      }));

      const completeTimeline = [...timeline, ...auditTimeline].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      return res.status(200).json({
        patient,
        timeline: completeTimeline,
      });
    } catch (error) {
      logger.error('Get patient details error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async updatePatient(req, res) {
    try {
      const clinicId = req.user?.clinicId;
      const { id } = req.params;

      if (!clinicId) {
        return res.status(400).json({ error: 'No clinic context' });
      }

      const data = createPatientSchema.partial().parse(req.body);

      const patient = serialize(await Patient.findOne({ _id: id, clinicId }));

      if (!patient) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      const updated = serialize(await Patient.findByIdAndUpdate(
        id,
        {
          ...data,
          ...(data.dob && { dob: new Date(data.dob) }),
        },
        { new: true }
      ));

      await AuditService.log({
        userId: req.user?.userId,
        clinicId,
        action: 'PATIENT_UPDATE',
        targetType: 'PATIENT',
        targetId: id,
        details: `Patient details updated: ${JSON.stringify(data)}`,
        ipAddress: req.ip || '',
      });

      return res.status(200).json(updated);
    } catch (error) {
      logger.error('Update patient error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async deletePatient(req, res) {
    try {
      const clinicId = req.user?.clinicId;
      const { id } = req.params;

      if (!clinicId) {
        return res.status(400).json({ error: 'No clinic context' });
      }

      const patient = serialize(await Patient.findOne({ _id: id, clinicId }));

      if (!patient) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      await Patient.findByIdAndUpdate(id, { deletedAt: new Date() });

      await AuditService.log({
        userId: req.user?.userId,
        clinicId,
        action: 'PATIENT_DELETE',
        targetType: 'PATIENT',
        targetId: id,
        details: `Patient ${patient.fullName} soft-deleted`,
        ipAddress: req.ip || '',
      });

      return res.status(200).json({ message: 'Patient deleted successfully' });
    } catch (error) {
      logger.error('Delete patient error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export default PatientsController;
