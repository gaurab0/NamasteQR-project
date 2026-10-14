import React, { useState } from 'react';
import { 
  Building2, 
  Mail, 
  Phone, 
  MapPin, 
  Clock, 
  MessageSquare, 
  ShieldCheck, 
  CheckCircle2, 
  Send, 
  Sparkles,
  ArrowRight,
  HelpCircle,
  FileText,
  Lock
} from 'lucide-react';
import { Logo } from '../ui/Logo';
import { Button } from '../ui/Button';

interface FooterProps {
  onNavigate: (route: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    message: '',
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.email || !contactForm.message) return;

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSubmitted(true);
      setContactForm({ name: '', email: '', message: '' });
      setTimeout(() => setIsSubmitted(false), 5000);
    }, 600);
  };

  return (
    <footer className="bg-zinc-950 text-zinc-300 border-t border-zinc-800">
      {/* Main Footer Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8">
          
          {/* Column 1: About Section (id="about") */}
          <div id="about" className="lg:col-span-4 space-y-5 scroll-mt-24">
            <Logo onClick={() => onNavigate('/')} />
            
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400 mb-2 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" />
                About NamasteQR
              </h3>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                NamasteQR is the modern operating system engineered exclusively for the hospitality sector. We empower fine dining restaurants, luxury hotels, artisan cafés, and multi-venue groups with cryptographically verified email authentication, relational kitchen architecture, and contactless digital dining operations.
              </p>
            </div>

            {/* Core Pillars */}
            <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
              <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-zinc-300 font-medium">Email OTP Security</span>
              </div>
              <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-zinc-300 font-medium">Multi-Venue Scales</span>
              </div>
              <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center gap-2">
                <Lock className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="text-zinc-300 font-medium">Encrypted Sessions</span>
              </div>
              <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-400 shrink-0" />
                <span className="text-zinc-300 font-medium">24/7 Operations</span>
              </div>
            </div>
          </div>

          {/* Column 2: Quick Links & Hospitality Navigation */}
          <div className="lg:col-span-3 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              Platform & Access
            </h3>
            <ul className="space-y-2.5 text-xs sm:text-sm">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('/')}
                  className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  Home & Overview
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('/signup')}
                  className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  Register Business Account
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('/login')}
                  className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  Portal Sign In
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('/forgot-password')}
                  className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  Credential Recovery
                </button>
              </li>
              <li>
                <a
                  href="#about"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('/#about');
                  }}
                  className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  About Platform
                </a>
              </li>
              <li>
                <a
                  href="#contact"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('/#contact');
                  }}
                  className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  Contact & Support
                </a>
              </li>
            </ul>

            <div className="pt-3 border-t border-zinc-800/80">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-2">
                Supported Venues
              </span>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Fine Dining • Luxury Hotels • Artisan Bakeries • Craft Coffee Bars • Lounges
              </p>
            </div>
          </div>

          {/* Column 3: Contact Us Section (id="contact") */}
          <div id="contact" className="lg:col-span-5 space-y-4 scroll-mt-24">
            <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <Mail className="w-4 h-4 text-amber-400" />
              Contact Us & Support
            </h3>
            
            <p className="text-xs sm:text-sm text-zinc-400">
              Our hospitality systems team is available 24/7 to assist owners, general managers, and IT teams.
            </p>

            {/* Direct Contact Information */}
            <div className="space-y-2.5 text-xs text-zinc-300">
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800">
                <Mail className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <span className="text-zinc-500 block text-[11px]">Direct Support & Inquiries</span>
                  <a href="mailto:support@namasteqr.com" className="font-mono text-white hover:text-amber-400 transition-colors">
                    support@namasteqr.com
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800">
                <MessageSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <span className="text-zinc-500 block text-[11px]">Customer Concierge Hotline</span>
                  <span className="font-mono text-white">+1 (555) 019-2834</span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800">
                <Phone className="w-4 h-4 text-blue-400 shrink-0" />
                <div>
                  <span className="text-zinc-500 block text-[11px]">Toll-Free Enterprise Support</span>
                  <span className="font-mono text-white">+1 (800) 555-SERV</span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800">
                <MapPin className="w-4 h-4 text-rose-400 shrink-0" />
                <div>
                  <span className="text-zinc-500 block text-[11px]">Global Headquarters</span>
                  <span className="text-zinc-300">100 Hospitality Way, Suite 400, San Francisco, CA 94105</span>
                </div>
              </div>
            </div>

            {/* Quick Contact Box */}
            <div className="mt-4 p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
              <h4 className="text-xs font-bold text-white mb-2 flex items-center justify-between">
                <span>Send Quick Message</span>
                <span className="text-[10px] text-amber-400 uppercase font-semibold">Priority Queue</span>
              </h4>

              {isSubmitted ? (
                <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>Thank you! Your message has been routed to our support team.</span>
                </div>
              ) : (
                <form onSubmit={handleContactSubmit} className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Your Name"
                      value={contactForm.name}
                      onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                    />
                    <input
                      type="email"
                      required
                      placeholder="Email or Phone"
                      value={contactForm.email}
                      onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <textarea
                    required
                    rows={2}
                    placeholder="How can we help your venue?"
                    value={contactForm.message}
                    onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-none"
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={isSubmitting}
                    leftIcon={<Send className="w-3.5 h-3.5" />}
                    className="w-full"
                  >
                    {isSubmitting ? 'Dispatching Message...' : 'Send Inquiry'}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Bar: Copyright & Compliance */}
        <div className="mt-12 pt-8 border-t border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <p>© 2026 NamasteQR Inc. Restaurant & Hospitality Operating System. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1.5 text-zinc-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Systems Operational (99.99%)
            </span>
            <span className="text-zinc-700">•</span>
            <span className="hover:text-zinc-300 cursor-pointer" onClick={() => onNavigate('/#about')}>
              Terms & Security
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
