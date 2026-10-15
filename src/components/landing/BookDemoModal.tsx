import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  Building2,
  User,
  Mail,
  Phone,
  MapPin,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { contactApi, BookDemoData } from '../../api/contactApi';

interface BookDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BookDemoModal: React.FC<BookDemoModalProps> = ({ isOpen, onClose }) => {
  const [formData, setFormData] = useState<BookDemoData>({
    name: '',
    businessName: '',
    email: '',
    phone: '',
    location: '',
    queries: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validate fields
    if (!formData.name.trim() || !formData.businessName.trim() || !formData.email.trim() || !formData.phone.trim() || !formData.location.trim()) {
      setErrorMessage('Please fill in all required fields (Name, Business Name, Email, Phone, and Location).');
      return;
    }

    setIsSubmitting(true);
    try {
      await contactApi.bookDemo(formData);
      setIsSuccess(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to book demo at this time. Please email info@namasteqr.com directly.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setIsSuccess(false);
    setErrorMessage(null);
    setFormData({
      name: '',
      businessName: '',
      email: '',
      phone: '',
      location: '',
      queries: '',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      {/* Modal Dialog Card */}
      <div 
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-zinc-200 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-modal-title"
      >
        {/* Header Bar */}
        <div className="relative p-5 sm:p-6 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white shrink-0">
          <button
            type="button"
            onClick={handleResetAndClose}
            className="absolute right-4 top-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[11px] font-bold tracking-wide backdrop-blur-xs">
              <Sparkles className="w-3 h-3 text-amber-300" /> Live Product Walkthrough
            </span>
          </div>

          <h3 id="demo-modal-title" className="text-xl sm:text-2xl font-extrabold tracking-tight">
            Book a Personalized Demo
          </h3>
          <p className="mt-1 text-xs sm:text-sm text-blue-100 max-w-sm leading-relaxed">
            See how NamasteQR streamlines digital table ordering, kitchen KDS, POS tax billing, and multi-venue analytics.
          </p>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto p-5 sm:p-6 space-y-4">
          {isSuccess ? (
            /* Success State */
            <div className="py-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h4 className="text-xl font-black text-zinc-900">Demo Request Submitted!</h4>
                <p className="mt-2 text-xs sm:text-sm text-zinc-600 max-w-md mx-auto leading-relaxed">
                  Thank you, <strong className="text-zinc-900">{formData.name}</strong>! Your demo request for <strong className="text-zinc-900">{formData.businessName}</strong> has been routed directly to <strong className="text-blue-600">info@namasteqr.com</strong>.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200 text-left text-xs text-zinc-600 space-y-1.5 max-w-sm mx-auto">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Contact:</span>
                  <span className="font-semibold text-zinc-800">{formData.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Phone:</span>
                  <span className="font-semibold text-zinc-800">{formData.phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Location:</span>
                  <span className="font-semibold text-zinc-800">{formData.location}</span>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleResetAndClose}
                  className="w-full sm:w-auto px-8"
                >
                  Done
                </Button>
              </div>
            </div>
          ) : (
            /* Booking Form */
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {errorMessage && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* 1. Your Name & 2. Business Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-zinc-700">
                    Your Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Chef Marco / Sarah"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-zinc-700">
                    Business / Venue Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. 7 Spices Bistro & Bar"
                      value={formData.businessName}
                      onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                      className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Email Address & 4. Phone Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-zinc-700">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type="email"
                      required
                      placeholder="you@yourvenue.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-zinc-700">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type="tel"
                      required
                      placeholder="+977 98XXXXXXXX / +1..."
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* 5. Location */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-zinc-700">
                  Venue Location / City <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Kathmandu / Pokhara / San Francisco / London"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* 6. Other Queries */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-zinc-700 flex items-center justify-between">
                  <span>Other Queries & Special Requirements</span>
                  <span className="text-[10px] font-normal text-zinc-400">Optional</span>
                </label>
                <div className="relative">
                  <MessageSquare className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
                  <textarea
                    rows={2}
                    placeholder="Table count, current POS software, specific feature questions, or convenient demo time..."
                    value={formData.queries}
                    onChange={(e) => setFormData({ ...formData, queries: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white resize-none"
                  />
                </div>
              </div>

              {/* Routing Notice */}
              <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200/60 flex items-center gap-2 text-[11px] text-blue-800 font-medium">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Information is routed directly to <strong className="font-semibold">info@namasteqr.com</strong>. No spam, ever.</span>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isSubmitting}
                  className="w-full font-bold shadow-md bg-blue-600 hover:bg-blue-700 py-2.5 text-xs sm:text-sm flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Scheduling Your Demo...</span>
                    </>
                  ) : (
                    <>
                      <Calendar className="w-4 h-4" />
                      <span>Confirm Demo Request</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
