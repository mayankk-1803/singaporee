import { Certificate, Clinic, Doctor, Patient, VerificationLog } from '../../models/index.js';
import logger from '../../utils/logger.js';
import { serialize, toObjectId } from '../../utils/mongo.js';

export class AnalyticsController {
  static async getDashboardStats(req, res) {
    try {
      const { role, clinicId } = req.user;

      // 1. Super Admin Stats
      if (role === 'SUPER_ADMIN') {
        const [
          totalClinics,
          totalDoctors,
          totalPatients,
          totalCertificates,
          activeCertificates,
          revokedCertificates,
          expiredCertificates,
          logsToday,
        ] = await Promise.all([
          Clinic.countDocuments(),
          Doctor.countDocuments(),
          Patient.countDocuments(),
          Certificate.countDocuments(),
          Certificate.countDocuments({ status: 'ACTIVE' }),
          Certificate.countDocuments({ status: 'REVOKED' }),
          Certificate.countDocuments({ status: 'EXPIRED' }),
          VerificationLog.countDocuments({
            timestamp: {
              $gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          }),
        ]);

        return res.status(200).json({
          totalClinics,
          totalDoctors,
          totalPatients,
          totalCertificates,
          activeCertificates,
          revokedCertificates,
          expiredCertificates,
          verificationsToday: logsToday,
        });
      }

      // 2. Clinic Admin / Doctor / Staff Stats
      if (!clinicId) {
        return res.status(400).json({ error: 'No clinic context' });
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [
        totalDoctors,
        totalPatients,
        totalCertificates,
        certToday,
        certMonth,
        activeCertificates,
        revokedCertificates,
        expiredCertificates,
        clinicCertificates,
      ] = await Promise.all([
        Doctor.countDocuments({ clinicId }),
        Patient.countDocuments({ clinicId }),
        Certificate.countDocuments({ clinicId }),
        Certificate.countDocuments({ clinicId, issueDate: { $gte: todayStart } }),
        Certificate.countDocuments({ clinicId, issueDate: { $gte: monthStart } }),
        Certificate.countDocuments({ clinicId, status: 'ACTIVE' }),
        Certificate.countDocuments({ clinicId, status: 'REVOKED' }),
        Certificate.countDocuments({ clinicId, status: 'EXPIRED' }),
        Certificate.find({ clinicId }).select('_id'),
      ]);

      const certificateIds = clinicCertificates.map((certificate) => certificate._id);
      const [verificationAttempts, verificationSuccess] = await Promise.all([
        VerificationLog.countDocuments({ certificateId: { $in: certificateIds } }),
        VerificationLog.countDocuments({ certificateId: { $in: certificateIds }, result: 'SUCCESS' }),
      ]);

      const verificationSuccessRate = verificationAttempts > 0 
        ? Math.round((verificationSuccess / verificationAttempts) * 100)
        : 100;

      // Find most active doctor
      const activeDoctors = await Certificate.aggregate([
        { $match: { clinicId: toObjectId(clinicId), deletedAt: null } },
        { $group: { _id: '$doctorId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1 },
      ]);

      let mostActiveDoctor = 'N/A';
      if (activeDoctors.length > 0) {
        const doc = serialize(await Doctor.findById(activeDoctors[0]._id).populate('user'));
        if (doc) {
          mostActiveDoctor = `Dr. ${doc.user.firstName} ${doc.user.lastName}`;
        }
      }

      return res.status(200).json({
        totalDoctors,
        totalPatients,
        totalCertificates,
        certificatesToday: certToday,
        certificatesThisMonth: certMonth,
        activeCertificates,
        revokedCertificates,
        expiredCertificates,
        verificationSuccessRate,
        mostActiveDoctor,
      });
    } catch (error) {
      logger.error('Get dashboard stats error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async getChartData(req, res) {
    try {
      const { clinicId, role } = req.user;
      const { startDate, endDate } = req.query;

      const dateFilter = {};
      if (startDate) dateFilter.gte = new Date(String(startDate));
      if (endDate) dateFilter.lte = new Date(String(endDate));

      // 1. Certificates issued monthly (last 6 months)
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthlyData = [];

      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const year = d.getFullYear();
        const month = d.getMonth();

        const startOfMonth = new Date(year, month, 1);
        const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);

        const count = await Certificate.countDocuments({
          ...(role !== 'SUPER_ADMIN' && { clinicId: clinicId }),
          issueDate: {
            $gte: startOfMonth,
            $lte: endOfMonth,
          },
        });

        monthlyData.push({
          name: `${months[month]} ${year}`,
          count,
        });
      }

      // 2. Verification log trends (past 7 days)
      const verificationTrends = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        
        const nextDay = new Date(d);
        nextDay.setDate(nextDay.getDate() + 1);

        const scopedCertificateIds = role === 'SUPER_ADMIN'
          ? null
          : (await Certificate.find({ clinicId }).select('_id')).map((certificate) => certificate._id);
        const logScope = scopedCertificateIds ? { certificateId: { $in: scopedCertificateIds } } : {};
        const [success, failed] = await Promise.all([
          VerificationLog.countDocuments({
            ...logScope,
            timestamp: { $gte: d, $lt: nextDay },
            result: 'SUCCESS',
          }),
          VerificationLog.countDocuments({
            ...logScope,
            timestamp: { $gte: d, $lt: nextDay },
            result: { $ne: 'SUCCESS' },
          }),
        ]);

        verificationTrends.push({
          date: d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' }),
          success,
          failed,
        });
      }

      // 3. Doctor performance (certificates count per doctor)
      let doctorPerformance = [];
      if (role !== 'SUPER_ADMIN' && clinicId) {
        const doctors = serialize(await Doctor.find({ clinicId }).populate('user'));
        doctorPerformance = await Promise.all(doctors.map(async (doc) => ({
          name: `Dr. ${doc.user.firstName}`,
          certificates: await Certificate.countDocuments({ doctorId: doc.id }),
        })));
      }

      // 4. Patient growth trends (cumulative count)
      const patientGrowth = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);

        const count = await Patient.countDocuments({
          ...(role !== 'SUPER_ADMIN' && { clinicId: clinicId }),
          createdAt: { $lte: endOfMonth },
        });

        patientGrowth.push({
          name: months[d.getMonth()],
          patients: count,
        });
      }

      return res.status(200).json({
        monthlyData,
        verificationTrends,
        doctorPerformance,
        patientGrowth,
      });
    } catch (error) {
      logger.error('Get chart data error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}
