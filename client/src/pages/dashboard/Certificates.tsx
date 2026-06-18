import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  Plus, 
  X, 
  Search, 
  Download, 
  AlertTriangle, 
  ShieldCheck, 
  XCircle,
  FileDown,
  Mail,
  Printer
} from 'lucide-react';
import { api } from '../../api/axios';
import { useAuthStore } from '../../store/authStore';

interface Certificate {
  id: string;
  certificateNumber: string;
  type: string;
  issueDate: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  diagnosis: string;
  remarks?: string | null;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'CANCELLED';
  pdfUrl?: string | null;
  qrCodeUrl?: string | null;
  verificationHash: string;
  patient: {
    fullName: string;
    identifier: string;
    email: string;
  };
  doctor: {
    licenseNumber: string;
    user: {
      firstName: string;
      lastName: string;
    };
  };
}

interface Patient {
  id: string;
  fullName: string;
  identifier: string;
}

interface Doctor {
  id: string;
  user: {
    firstName: string;
    lastName: string;
  };
}

export default function Certificates() {
  const { user } = useAuthStore();

  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Issue Certificate Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    patientId: '',
    doctorId: '',
    type: 'MEDICAL_CERTIFICATE',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    diagnosis: '',
    remarks: '',
  });

  // Revocation Modal State
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [selectedCert, setSelectedCert] = useState<Certificate | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [revokeLoading, setRevokeLoading] = useState(false);

  useEffect(() => {
    fetchCertificates();
  }, [searchQuery]);

  useEffect(() => {
    if (modalOpen) {
      fetchPatientsAndDoctors();
    }
  }, [modalOpen]);

  const fetchCertificates = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await api.get(`/certificates?q=${searchQuery}`);
      setCertificates(data);
    } catch (err: any) {
      setError('Failed to fetch certificate database catalog.');
    } finally {
      setLoading(false);
    }
  };

  const fetchPatientsAndDoctors = async () => {
    try {
      const [patRes, docRes] = await Promise.all([
        api.get('/patients'),
        user?.role === 'CLINIC_ADMIN' ? api.get('/doctors') : Promise.resolve({ data: [] })
      ]);
      setPatients(patRes.data);
      setDoctors(docRes.data);
      
      // Auto-select first patient if available
      if (patRes.data.length > 0) {
        setFormData(prev => ({ ...prev, patientId: patRes.data[0].id }));
      }
      // Auto-select first doctor if available and CLINIC_ADMIN
      if (docRes.data.length > 0) {
        setFormData(prev => ({ ...prev, doctorId: docRes.data[0].id }));
      }
    } catch (err: any) {
      console.error('Failed to load modal drop-downs');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleIssueCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setSubmitLoading(true);

    try {
      await api.post('/certificates', formData);
      setModalOpen(false);
      setFormData({
        patientId: '',
        doctorId: '',
        type: 'MEDICAL_CERTIFICATE',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        diagnosis: '',
        remarks: '',
      });
      fetchCertificates();
    } catch (err: any) {
      setModalError(err.response?.data?.error || 'Failed to generate medical certificate.');
    } finally {
      setSubmitLoading(false);
    }
  };

  const openRevokeModal = (cert: Certificate) => {
    setSelectedCert(cert);
    setRevokeReason('');
    setRevokeOpen(true);
  };

  const handleRevokeCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCert || !revokeReason) return;

    try {
      setRevokeLoading(true);
      await api.post(`/certificates/${selectedCert.id}/revoke`, { reason: revokeReason });
      setRevokeOpen(false);
      setSelectedCert(null);
      fetchCertificates();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to revoke certificate');
    } finally {
      setRevokeLoading(false);
    }
  };

  const handleDownloadCertificate = async (cert: Certificate) => {
    try {
      if (cert.pdfUrl) {
        window.open(cert.pdfUrl, '_blank', 'noopener,noreferrer');
        return;
      }

      const response = await api.get(`/certificates/${cert.id}/download`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Medical_Certificate_${cert.certificateNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to download certificate PDF.');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-primary" /> Certificate Document Vault
          </h1>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">Issue, download, verify, and revoke clinical documents</p>
        </div>
        {user?.role !== 'STAFF' && (
          <button 
            onClick={() => setModalOpen(true)}
            className="bg-primary hover:bg-primary-dark text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-primary/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Issue Certificate
          </button>
        )}
      </div>

      {/* Search Filter */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
        <input 
          type="text" 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by certificate number, patient name..."
          className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-10 pr-4 py-2.5 outline-none focus:border-primary text-xs font-semibold transition"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Roster table */}
      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900 text-slate-400 font-bold uppercase border-b border-slate-100 dark:border-slate-800">
                <th className="px-6 py-4">Certificate Number</th>
                <th className="px-6 py-4">Patient Profile</th>
                <th className="px-6 py-4">Leave Range (Days)</th>
                <th className="px-6 py-4">Clinical Diagnosis</th>
                <th className="px-6 py-4">Attending Doctor</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Verification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {certificates.map((cert) => (
                <tr key={cert.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition">
                  <td className="px-6 py-4 font-mono font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    {cert.certificateNumber}
                  </td>
                  <td className="px-6 py-4 leading-tight">
                    <div className="font-bold text-slate-800 dark:text-slate-200">{cert.patient.fullName}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">ID: {cert.patient.identifier}</div>
                  </td>
                  <td className="px-6 py-4 leading-tight">
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      {new Date(cert.startDate).toLocaleDateString('en-SG')} - {new Date(cert.endDate).toLocaleDateString('en-SG')}
                    </div>
                    <div className="text-[10px] text-primary font-bold mt-0.5">{cert.durationDays} Day(s)</div>
                  </td>
                  <td className="px-6 py-4 max-w-xs truncate font-medium">{cert.diagnosis}</td>
                  <td className="px-6 py-4 leading-tight">
                    <div className="font-semibold text-slate-800 dark:text-slate-200">Dr. {cert.doctor.user.firstName} {cert.doctor.user.lastName}</div>
                    <div className="text-[9px] text-slate-400 mt-0.5">Lic: {cert.doctor.licenseNumber}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-extrabold uppercase tracking-wider ${
                      cert.status === 'ACTIVE'
                        ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 border border-emerald-100 dark:border-emerald-900/30'
                        : cert.status === 'EXPIRED'
                        ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 border border-amber-100 dark:border-amber-900/30'
                        : 'bg-red-50 dark:bg-red-950/20 text-red-600 border border-red-100 dark:border-red-900/30'
                    }`}>
                      {cert.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadCertificate(cert)}
                      className="bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 text-slate-600 dark:text-slate-300 p-2 rounded-xl transition cursor-pointer"
                      title="Download PDF"
                    >
                      <FileDown className="w-4 h-4" />
                    </button>
                    {cert.status === 'ACTIVE' && user?.role !== 'STAFF' && (
                      <button 
                        onClick={() => openRevokeModal(cert)}
                        className="bg-red-50 dark:bg-red-950/20 hover:bg-red-100 text-red-500 p-2 rounded-xl transition cursor-pointer"
                        title="Revoke Certificate"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {certificates.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400">
                    No certificates cataloged in the workspace database.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Revocation Modal */}
      {revokeOpen && selectedCert && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-6 relative animate-in zoom-in-95 duration-200">
            <button 
              onClick={() => setRevokeOpen(false)}
              className="absolute top-4 right-4 p-1 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-lg text-slate-500"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <h3 className="font-extrabold text-red-600 text-md flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Revoke Medical Document
              </h3>
              <p className="text-[10px] text-slate-400 font-semibold">
                Revoking certificate <strong>{selectedCert.certificateNumber}</strong>. The patient will be notified automatically via email.
              </p>
            </div>

            <form onSubmit={handleRevokeCertificate} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Reason for Revocation</label>
                <textarea 
                  required
                  rows={3}
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder="e.g. clerical error in diagnostic field / patient leave cancelled"
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold focus:bg-white outline-none focus:border-primary transition resize-none"
                ></textarea>
              </div>

              <div className="flex gap-4">
                <button 
                  type="button"
                  onClick={() => setRevokeOpen(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition border border-slate-200"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={revokeLoading}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-md shadow-red-500/20 cursor-pointer"
                >
                  {revokeLoading ? 'Revoking...' : 'Confirm Revoke'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Certificate Wizard Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-xl shadow-2xl p-6 space-y-6 relative max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
            <button 
              onClick={() => setModalOpen(false)}
              className="absolute top-4 right-4 p-1 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-lg text-slate-500"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className="font-extrabold text-slate-900 dark:text-white text-md">Issue Medical Document</h3>
              <p className="text-[10px] text-slate-400">Generate secure Singapore-style certificates with automated QR verification links</p>
            </div>

            {modalError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-3 rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleIssueCertificate} className="space-y-4">
              {patients.length === 0 ? (
                <div className="space-y-6">
                  <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 text-amber-800 dark:text-amber-300 p-4 rounded-2xl text-xs space-y-2">
                    <p className="font-bold flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="w-4 h-4 text-amber-500" /> No Patients Registered
                    </p>
                    <p className="text-[11px] leading-relaxed">
                      You cannot issue a certificate because there are no patients in the database yet. You must register the patient first in the Patients Directory.
                    </p>
                  </div>
                  <div className="flex gap-4">
                    <button 
                      type="button"
                      onClick={() => setModalOpen(false)}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition border border-slate-200"
                    >
                      Close Modal
                    </button>
                    <a 
                      href="/dashboard/patients" 
                      onClick={() => setModalOpen(false)}
                      className="flex-1 bg-primary hover:bg-primary-dark text-white font-bold py-2.5 rounded-xl text-xs text-center shadow-md shadow-primary/20 transition flex items-center justify-center gap-1"
                    >
                      Go to Patients Registry →
                    </a>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Select Patient</label>
                      <select 
                        name="patientId" 
                        required 
                        value={formData.patientId} 
                        onChange={handleInputChange} 
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs font-semibold focus:bg-white outline-none focus:border-primary transition"
                      >
                        {patients.map(p => (
                          <option key={p.id} value={p.id}>{p.fullName} ({p.identifier})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Certificate Type</label>
                      <select 
                        name="type" 
                        required 
                        value={formData.type} 
                        onChange={handleInputChange} 
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs font-semibold focus:bg-white outline-none focus:border-primary transition"
                      >
                        <option value="MEDICAL_CERTIFICATE">Medical Certificate (MC)</option>
                        <option value="FITNESS_CERTIFICATE">Fitness Certificate</option>
                        <option value="RETURN_TO_WORK_CERTIFICATE">Return to Work Certificate</option>
                        <option value="MEDICAL_REPORT">Medical Report</option>
                        <option value="VACCINATION_CERTIFICATE">Vaccination Certificate</option>
                        <option value="TRAVEL_HEALTH_CERTIFICATE">Travel Health Certificate</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Start Date</label>
                      <input type="date" name="startDate" required value={formData.startDate} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold focus:bg-white outline-none focus:border-primary transition" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">End Date</label>
                      <input type="date" name="endDate" required value={formData.endDate} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold focus:bg-white outline-none focus:border-primary transition" />
                    </div>
                  </div>

                  {user?.role === 'CLINIC_ADMIN' && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Attending Doctor</label>
                      <select 
                        name="doctorId" 
                        required 
                        value={formData.doctorId} 
                        onChange={handleInputChange} 
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs font-semibold focus:bg-white outline-none focus:border-primary transition"
                      >
                        {doctors.map(d => (
                          <option key={d.id} value={d.id}>Dr. {d.user.firstName} {d.user.lastName}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Diagnosis & Assessment</label>
                    <textarea 
                      name="diagnosis"
                      required
                      rows={2}
                      value={formData.diagnosis}
                      onChange={handleInputChange}
                      placeholder="e.g. Acute Gastroenteritis"
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold focus:bg-white outline-none focus:border-primary transition resize-none"
                    ></textarea>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Medical Remarks (Optional)</label>
                    <textarea 
                      name="remarks"
                      rows={2}
                      value={formData.remarks}
                      onChange={handleInputChange}
                      placeholder="e.g. Unfit for heavy physical tasks"
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold focus:bg-white outline-none focus:border-primary transition resize-none"
                    ></textarea>
                  </div>

                  <button 
                    type="submit" 
                    disabled={submitLoading}
                    className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-3.5 rounded-xl text-xs transition shadow-md shadow-primary/20 cursor-pointer"
                  >
                    {submitLoading ? 'Generating Puppeteer PDF...' : 'Confirm & Generate Document'}
                  </button>
                </>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
