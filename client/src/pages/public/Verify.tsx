import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import gsap from 'gsap';
import { 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Download, 
  Search, 
  ChevronRight, 
  Building,
  User,
  Calendar,
  Clock,
  Fingerprint,
  Info
} from 'lucide-react';
import { api } from '../../api/axios';
import { getApiErrorMessage } from '../../utils/apiError';

interface VerificationResult {
  certificateNumber: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'CANCELLED';
  clinicName: string;
  doctorName: string;
  patientName: string;
  patientIdentifier: string;
  issueDate: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  verificationHash: string;
  pdfUrl?: string | null;
  qrUrl?: string | null;
  clinicLogoUrl?: string | null;
  doctorSignatureUrl?: string | null;
}

export default function Verify() {
  const { certNo } = useParams<{ certNo?: string }>();
  
  const [certificateNumber, setCertificateNumber] = useState(certNo || '');
  const [identifier, setIdentifier] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (result) {
        gsap.from('.gsap-verify-results', {
          opacity: 0,
          y: 30,
          duration: 0.8,
          ease: 'power3.out'
        });
        gsap.from('.gsap-result-item', {
          opacity: 0,
          x: -15,
          duration: 0.5,
          stagger: 0.08,
          ease: 'power2.out'
        });
      } else {
        gsap.from('.gsap-verify-title', { opacity: 0, y: -20, duration: 0.8, ease: 'power3.out' });
        gsap.from('.gsap-verify-card', { opacity: 0, y: 30, duration: 1, ease: 'power3.out' });
      }
    }, containerRef);

    return () => ctx.revert();
  }, [result]);

  // Set certNo from URL params
  useEffect(() => {
    if (certNo) {
      setCertificateNumber(certNo);
      // Automatically check existence of cert if passed in url
      checkExistence(certNo);
    }
  }, [certNo]);

  const [existenceClinic, setExistenceClinic] = useState<string | null>(null);
  const [checkingExistence, setCheckingExistence] = useState(false);

  const checkExistence = async (num: string) => {
    try {
      setCheckingExistence(true);
      setError(null);
      const { data } = await api.get(`/verify/${num}`);
      if (!data?.clinicName) {
        throw new Error('Invalid response from verification service.');
      }
      setExistenceClinic(data.clinicName);
    } catch (err: unknown) {
      console.error(err);
      setError(getApiErrorMessage(err, 'Certificate not found in database.'));
      setExistenceClinic(null);
    } finally {
      setCheckingExistence(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certificateNumber || !identifier) {
      setError('Please fill in both fields.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const { data } = await api.post('/verify', {
        certificateNumber: certificateNumber.trim(),
        identifier: identifier.trim(),
      });

      if (!data) {
        throw new Error('Invalid response from verification service.');
      }

      setResult(data);
    } catch (err: unknown) {
      console.error(err);
      setError(getApiErrorMessage(err, 'Verification failed. Please check the credentials and try again.'));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setResult(null);
    setIdentifier('');
    if (!certNo) {
      setCertificateNumber('');
      setExistenceClinic(null);
    }
  };

  return (
    <div ref={containerRef} className="bg-medical-bg min-h-screen flex flex-col justify-between text-slate-800">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 py-6 px-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-primary to-secondary flex items-center justify-center text-white font-bold text-sm">
              HV
            </div>
            <span className="font-extrabold text-lg text-slate-900 font-sans">Health<span className="text-primary">Verify</span></span>
          </Link>
          <Link to="/login" className="text-sm font-semibold text-slate-600 hover:text-primary transition">
            Sign In to Dashboard
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 py-12 px-6 max-w-4xl mx-auto w-full">
        <div className="space-y-8">
          <div className="gsap-verify-title text-center space-y-2">
            <h1 className="text-3xl font-extrabold text-slate-900 font-sans flex items-center justify-center gap-2">
              <ShieldCheck className="w-8 h-8 text-primary" /> Certificate Verification Portal
            </h1>
            <p className="text-slate-500 text-sm max-w-md mx-auto">
              Verify the authenticity of digital medical documents instantly. Compliant with Singapore Health Ministry security rules.
            </p>
          </div>

          {!result ? (
            /* Verification Request Form */
            <div className="gsap-verify-card bg-white border border-slate-200 rounded-3xl p-8 shadow-xl relative overflow-hidden border-t-4 border-t-primary">
              
              <form onSubmit={handleVerify} className="space-y-6">
                {checkingExistence && (
                  <div className="bg-slate-50 border border-slate-200 text-slate-500 text-xs px-4 py-2 rounded-xl">
                    Querying document catalog...
                  </div>
                )}
                
                {existenceClinic && (
                  <div className="bg-primary/5 border border-primary/20 text-primary-dark text-xs px-4 py-3 rounded-xl flex items-center gap-2">
                    <Building className="w-4 h-4 text-primary shrink-0" />
                    <span>Found document catalog registered under <strong>{existenceClinic}</strong>. Enter NRIC/Passport below to challenge and verify details.</span>
                  </div>
                )}

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-3 rounded-xl flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Certificate Number</label>
                    <div className="relative">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <input 
                        type="text"
                        required
                        disabled={!!certNo}
                        value={certificateNumber}
                        onChange={(e) => setCertificateNumber(e.target.value)}
                        onBlur={() => !certNo && certificateNumber && checkExistence(certificateNumber)}
                        placeholder="e.g. MC-2026-000001"
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3.5 outline-none focus:bg-white focus:border-primary text-sm font-semibold transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Passport / NRIC Number</label>
                    <input 
                      type="text"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="e.g. S1234567A"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 outline-none focus:bg-white focus:border-primary text-sm font-semibold transition"
                    />
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex gap-3 text-xs text-slate-500">
                  <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <p>
                    <strong>Secure Verification:</strong> Full patient details are shown only after the certificate number and matching NRIC/Passport challenge are verified. Medical diagnosis details remain omitted.
                  </p>
                </div>

                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 rounded-2xl transition shadow-lg shadow-primary/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? 'Performing Challenge...' : 'Verify Certificate'} <ChevronRight className="w-5 h-5" />
                </button>
              </form>
            </div>
          ) : (
            /* Verification Successful Results Screen */
            <div className="gsap-verify-results bg-white border border-slate-200 rounded-3xl shadow-2xl relative overflow-hidden">
              {/* Badge Headers depending on status */}
              {result.status === 'ACTIVE' && (
                <div className="bg-emerald-500 text-white px-8 py-5 flex items-center justify-between shadow-inner">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-lg uppercase tracking-wider">Authenticity Verified</h3>
                      <p className="text-emerald-100 text-xs">This certificate is genuine and active in the registry.</p>
                    </div>
                  </div>
                  <div className="border border-white/30 rounded px-3 py-1 text-xs font-black bg-white/10 uppercase tracking-widest glow-green">
                    VALID
                  </div>
                </div>
              )}

              {result.status === 'EXPIRED' && (
                <div className="bg-amber-500 text-white px-8 py-5 flex items-center justify-between shadow-inner">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                      <Clock className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-lg uppercase tracking-wider">Validity Period Expired</h3>
                      <p className="text-amber-100 text-xs">This certificate is genuine but the leave period has elapsed.</p>
                    </div>
                  </div>
                  <div className="border border-white/30 rounded px-3 py-1 text-xs font-black bg-white/10 uppercase tracking-widest">
                    EXPIRED
                  </div>
                </div>
              )}

              {result.status === 'REVOKED' && (
                <div className="bg-red-600 text-white px-8 py-5 flex items-center justify-between shadow-inner">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                      <XCircle className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-lg uppercase tracking-wider">Certificate Revoked</h3>
                      <p className="text-red-100 text-xs">This document was revoked by the issuing clinic and is invalid.</p>
                    </div>
                  </div>
                  <div className="border border-white/30 rounded px-3 py-1 text-xs font-black bg-white/10 uppercase tracking-widest glow-red">
                    REVOKED
                  </div>
                </div>
              )}

              {result.status === 'CANCELLED' && (
                <div className="bg-slate-600 text-white px-8 py-5 flex items-center justify-between shadow-inner">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                      <XCircle className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-lg uppercase tracking-wider">Certificate Cancelled</h3>
                      <p className="text-slate-100 text-xs">This document has been cancelled and is no longer active.</p>
                    </div>
                  </div>
                  <div className="border border-white/30 rounded px-3 py-1 text-xs font-black bg-white/10 uppercase tracking-widest">
                    CANCELLED
                  </div>
                </div>
              )}

              {/* Data Rows */}
              <div className="p-8 space-y-6">
                <div className="grid md:grid-cols-2 gap-6 pb-6 border-b border-slate-100">
                  <div className="gsap-result-item flex items-start gap-3">
                    <User className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Patient Name</span>
                      <span className="text-md font-bold text-slate-900">{result.patientName}</span>
                    </div>
                  </div>

                  <div className="gsap-result-item flex items-start gap-3">
                    <Building className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Issuing Clinic</span>
                      <span className="text-md font-bold text-slate-900">{result.clinicName}</span>
                    </div>
                  </div>
                  
                  <div className="gsap-result-item flex items-start gap-3">
                    <Fingerprint className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">NRIC / Passport</span>
                      <span className="text-md font-bold text-slate-900">{result.patientIdentifier}</span>
                    </div>
                  </div>

                  <div className="gsap-result-item flex items-start gap-3">
                    <User className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Attending Doctor</span>
                      <span className="text-md font-bold text-slate-900">{result.doctorName}</span>
                    </div>
                  </div>
                </div>

                <div className="gsap-result-item grid md:grid-cols-3 gap-6 bg-slate-50 rounded-2xl p-6 border border-slate-200">
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Validity Start Date</span>
                    <span className="text-sm font-semibold text-slate-800">
                      {new Date(result.startDate).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Validity End Date</span>
                    <span className="text-sm font-semibold text-slate-800">
                      {new Date(result.endDate).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Duration Days</span>
                    <span className="text-sm font-extrabold text-primary">
                      {result.durationDays} Day(s)
                    </span>
                  </div>
                </div>

                <div className="gsap-result-item space-y-1.5 font-mono text-[9px] text-slate-400 bg-slate-50 border border-slate-200 p-4 rounded-xl break-all">
                  <span className="font-bold text-slate-500 block uppercase tracking-wider mb-1">SHA-256 Cryptographic Signature</span>
                  {result.verificationHash}
                </div>

                {(result.qrUrl || result.clinicLogoUrl || result.doctorSignatureUrl) && (
                  <div className="gsap-result-item grid sm:grid-cols-3 gap-4">
                    {result.qrUrl && (
                      <div className="border border-slate-200 rounded-xl p-4 bg-white flex items-center justify-center min-h-32">
                        <img src={result.qrUrl} alt="Certificate QR code" className="max-h-24 object-contain" />
                      </div>
                    )}
                    {result.clinicLogoUrl && (
                      <div className="border border-slate-200 rounded-xl p-4 bg-white flex items-center justify-center min-h-32">
                        <img src={result.clinicLogoUrl} alt="Clinic logo" className="max-h-20 object-contain" />
                      </div>
                    )}
                    {result.doctorSignatureUrl && (
                      <div className="border border-slate-200 rounded-xl p-4 bg-white flex items-center justify-center min-h-32">
                        <img src={result.doctorSignatureUrl} alt="Doctor signature" className="max-h-20 object-contain" />
                      </div>
                    )}
                  </div>
                )}

                <div className="gsap-result-item flex flex-col sm:flex-row gap-4 pt-4">
                  {result.pdfUrl && (
                    <a 
                      href={result.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 bg-primary hover:bg-primary-dark text-white font-bold py-3.5 rounded-xl transition shadow-md shadow-primary/20 flex items-center justify-center gap-2"
                    >
                      <Download className="w-5 h-5" /> Download Digital Certificate (PDF)
                    </a>
                  )}
                  <button 
                    onClick={resetForm}
                    className="sm:w-48 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 rounded-xl border border-slate-300 transition"
                  >
                    Verify Another
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-slate-100 border-t border-slate-200 py-6 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>© 2026 HealthVerify. Secure Multi-Tenant Verification Gateway.</div>
          <div className="flex gap-4 font-semibold text-slate-600">
            <Link to="/" className="hover:text-primary">Landing Page</Link>
            <Link to="/login" className="hover:text-primary">Sign In</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
