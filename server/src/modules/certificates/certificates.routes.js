import { Router } from 'express';
import { CertificatesController } from './certificates.controller.js';
import { authenticate, authorize } from '../../middleware/authMiddleware.js';

const router = Router();

router.use(authenticate);

router.get('/', authorize(['CLINIC_ADMIN', 'DOCTOR', 'STAFF', 'SUPER_ADMIN']), CertificatesController.listCertificates);
router.post('/', authorize(['CLINIC_ADMIN', 'DOCTOR']), CertificatesController.createCertificate);
router.get('/:id/download', authorize(['CLINIC_ADMIN', 'DOCTOR', 'STAFF', 'SUPER_ADMIN']), CertificatesController.downloadCertificate);
router.get('/:id', authorize(['CLINIC_ADMIN', 'DOCTOR', 'STAFF', 'SUPER_ADMIN']), CertificatesController.getCertificateDetails);
router.post('/:id/revoke', authorize(['CLINIC_ADMIN', 'DOCTOR']), CertificatesController.revokeCertificate);

export default router;
