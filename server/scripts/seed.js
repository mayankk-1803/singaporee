import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { connectDB } from '../src/config/database.js';
import {
  AuditLog,
  Certificate,
  Clinic,
  Doctor,
  Patient,
  Staff,
  Subscription,
  User,
} from '../src/models/index.js';
import { calculateCertificateHash } from '../src/utils/hash.js';

dotenv.config();

const main = async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();

  const passwordHash = await bcrypt.hash('Password123!', 12);

  const superAdmin = await User.create({
    email: 'superadmin@healthverify.sg',
    passwordHash,
    firstName: 'System',
    lastName: 'Admin',
    role: 'SUPER_ADMIN',
  });

  const clinic = await Clinic.create({
    name: 'Mount Elizabeth HealthVerify Clinic',
    email: 'info@mountelizabeth.example',
    contactNumber: '+65 6789 0123',
    address: '3 Mount Elizabeth, Singapore',
  });

  const startDate = new Date();
  const endDate = new Date();
  endDate.setFullYear(endDate.getFullYear() + 1);
  await Subscription.create({
    clinicId: clinic._id,
    planName: 'Enterprise Trial',
    status: 'ACTIVE',
    price: 0,
    startDate,
    endDate,
  });

  const clinicAdmin = await User.create({
    email: 'admin@clinic.example',
    passwordHash,
    firstName: 'Sarah',
    lastName: 'Lim',
    phone: '+65 9111 2222',
    role: 'CLINIC_ADMIN',
    clinicId: clinic._id,
  });

  const doctorUser = await User.create({
    email: 'doctor@clinic.example',
    passwordHash,
    firstName: 'Benjamin',
    lastName: 'Tan',
    phone: '+65 9222 3333',
    role: 'DOCTOR',
    clinicId: clinic._id,
  });

  const doctor = await Doctor.create({
    clinicId: clinic._id,
    userId: doctorUser._id,
    licenseNumber: 'MCR-12345',
    specialization: 'General Medicine',
  });

  const staffUser = await User.create({
    email: 'staff@clinic.example',
    passwordHash,
    firstName: 'Mei',
    lastName: 'Wong',
    phone: '+65 9333 4444',
    role: 'STAFF',
    clinicId: clinic._id,
  });

  await Staff.create({
    clinicId: clinic._id,
    userId: staffUser._id,
    position: 'Clinic Receptionist',
  });

  const patient = await Patient.create({
    clinicId: clinic._id,
    fullName: 'Alex Chen',
    identifier: 'S1234567A',
    dob: new Date('1990-05-14'),
    gender: 'Male',
    phone: '+65 9444 5555',
    email: 'alex.chen@example.com',
  });

  await Patient.create({
    clinicId: clinic._id,
    fullName: 'Priya Nair',
    identifier: 'S7654321B',
    dob: new Date('1988-09-22'),
    gender: 'Female',
    phone: '+65 9555 6666',
    email: 'priya.nair@example.com',
  });

  const issueDate = new Date();
  const certStart = new Date();
  const certEnd = new Date();
  certEnd.setDate(certEnd.getDate() + 2);
  const certificateNumber = `MC-${issueDate.getFullYear()}-000001`;

  const certificate = await Certificate.create({
    clinicId: clinic._id,
    doctorId: doctor._id,
    patientId: patient._id,
    certificateNumber,
    type: 'MEDICAL_CERTIFICATE',
    issueDate,
    startDate: certStart,
    endDate: certEnd,
    durationDays: 3,
    diagnosis: 'Acute upper respiratory tract infection',
    remarks: 'Rest and hydration advised.',
    status: 'ACTIVE',
    qrCodeUrl: `${process.env.CLIENT_URL || 'http://localhost:5173'}/verify/${certificateNumber}`,
    verificationHash: calculateCertificateHash(certificateNumber, patient.id, doctor.id, issueDate),
  });

  await AuditLog.create({
    userId: superAdmin._id,
    clinicId: clinic._id,
    action: 'SEED',
    targetType: 'DATABASE',
    targetId: certificate.id,
    details: 'MongoDB seed data initialized.',
    ipAddress: '127.0.0.1',
  });

  console.log('MongoDB seed completed.');
  console.log('Super Admin: superadmin@healthverify.sg / Password123!');
  console.log('Clinic Admin: admin@clinic.example / Password123!');
  console.log('Doctor: doctor@clinic.example / Password123!');
  console.log('Staff: staff@clinic.example / Password123!');
};

main()
  .catch((error) => {
    console.error('MongoDB seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
