import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { 
  QrCode, 
  Download, 
  Printer, 
  Copy, 
  Check, 
  X, 
  ExternalLink, 
  Building2, 
  Layers, 
  Users, 
  Sparkles,
  CreditCard,
  KeyRound,
  ShieldCheck,
  Lock,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Gift,
  User,
  Phone
} from 'lucide-react';
import { RestaurantTable } from '../../types/rbac';
import { rbacService } from '../../services/rbac.service';
import { printService } from '../../services/print.service';
import { Button } from '../ui/Button';

interface TableQrCardModalProps {
  table: RestaurantTable;
  businessName: string;
  businessId: string;
  onClose: () => void;
  onTableUpdated?: (table: RestaurantTable) => void;
}

export const TableQrCardModal: React.FC<TableQrCardModalProps> = ({
  table,
  businessName,
  businessId,
  onClose,
  onTableUpdated,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  // Credit Configuration State
  const [isCreditOnly, setIsCreditOnly] = useState<boolean>(Boolean(table.credit_only));
  const [customerName, setCustomerName] = useState<string>(table.credit_customer_name || '');
  const [customerPhone, setCustomerPhone] = useState<string>(table.credit_customer_phone || '');
  const [pin, setPin] = useState<string>(table.credit_pin || '');
  const [glAccountNumber, setGlAccountNumber] = useState<string>(table.credit_gl_account_number || '');
  const [glAccountName, setGlAccountName] = useState<string>(table.credit_gl_account_name || '');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [creditSaving, setCreditSaving] = useState<boolean>(false);
  const [creditSuccessMsg, setCreditSuccessMsg] = useState<string | null>(null);
  const [creditErrorMsg, setCreditErrorMsg] = useState<string | null>(null);

  // Complementary Mode State
  const [isCompEnabled, setIsCompEnabled] = useState<boolean>(Boolean(table.comp_enabled));
  const [compOrdererName, setCompOrdererName] = useState<string>(table.comp_orderer_name || '');
  const [compOrdererPhone, setCompOrdererPhone] = useState<string>(table.comp_orderer_phone || '');
  const [compSaving, setCompSaving] = useState<boolean>(false);
  const [compSuccessMsg, setCompSuccessMsg] = useState<string | null>(null);
  const [compErrorMsg, setCompErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!glAccountNumber) {
      const rand5 = Math.floor(10000 + Math.random() * 90000).toString();
      setGlAccountNumber(rand5);
    }
    if (!pin) {
      const rand6 = Math.floor(100000 + Math.random() * 900000).toString();
      setPin(rand6);
    }
  }, []);

  const handleGeneratePin = () => {
    const rand6 = Math.floor(100000 + Math.random() * 900000).toString();
    setPin(rand6);
  };

  const handleGenerateGlNumber = () => {
    const rand5 = Math.floor(10000 + Math.random() * 90000).toString();
    setGlAccountNumber(rand5);
  };

  const handleSaveCreditConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreditErrorMsg(null);
    setCreditSuccessMsg(null);

    if (!isCreditOnly) {
      setCreditSaving(true);
      try {
        await rbacService.updateTableApi(
          table.id,
          { credit_only: false },
          businessId
        );
        setCreditSuccessMsg('Table credit-only mode turned off.');
        if (onTableUpdated) onTableUpdated({ ...table, credit_only: false });
        setTimeout(() => setCreditSuccessMsg(null), 3000);
      } catch (err: any) {
        setCreditErrorMsg(err?.message || 'Failed to update table settings.');
      } finally {
        setCreditSaving(false);
      }
      return;
    }

    if (!customerName.trim()) {
      setCreditErrorMsg('Customer Name is compulsory for Credit-Only tables.');
      return;
    }
    if (!customerPhone.trim()) {
      setCreditErrorMsg('Customer Phone is compulsory for Credit-Only tables.');
      return;
    }
    if (!pin.trim() || !/^\d{6}$/.test(pin.trim())) {
      setCreditErrorMsg('A valid 6-digit numeric PIN is required for authorization.');
      return;
    }
    if (!glAccountNumber.trim()) {
      setCreditErrorMsg('5-digit GL Account Number is required.');
      return;
    }

    setCreditSaving(true);
    try {
      let linkedGlId = table.credit_gl_account_id;
      let linkedGlNumber = glAccountNumber.trim();
      let linkedGlName = glAccountName.trim() || `Credit Settlement - Table ${table.table_number} (${customerName.trim()})`;

      if (!linkedGlId) {
        const createdGl = await rbacService.createGLAccountApi(
          {
            account_name: linkedGlName,
            account_number: linkedGlNumber,
            category: 'ASSET',
            mapping_key: 'CREDIT_SETTLEMENT',
            description: `Table ${table.table_number} dedicated credit ledger - ${customerName.trim()}`,
            customer_name: customerName.trim(),
            customer_phone: customerPhone.trim(),
            is_active: true,
          },
          businessId
        );
        linkedGlId = createdGl.id;
        linkedGlNumber = createdGl.account_number;
        linkedGlName = createdGl.account_name;
      } else {
        try {
          await rbacService.updateGLAccountApi(
            linkedGlId,
            {
              account_name: linkedGlName,
              account_number: linkedGlNumber,
              customer_name: customerName.trim(),
              customer_phone: customerPhone.trim(),
            },
            businessId
          );
        } catch (updateGlErr: any) {
          console.warn('GL account update sync note:', updateGlErr);
        }
      }

      const creditUpdates = {
        credit_only: true,
        pay_first_enabled: true,
        credit_customer_name: customerName.trim(),
        credit_customer_phone: customerPhone.trim(),
        credit_pin: pin.trim(),
        credit_gl_account_id: linkedGlId,
        credit_gl_account_number: linkedGlNumber,
        credit_gl_account_name: linkedGlName,
      };

      await rbacService.updateTableApi(table.id, creditUpdates, businessId);

      setCreditSuccessMsg('Credit Account & GL Linked Successfully! Table is now locked to Credit Only.');
      if (onTableUpdated) onTableUpdated({ ...table, ...creditUpdates });
      setTimeout(() => setCreditSuccessMsg(null), 4000);
    } catch (err: any) {
      setCreditErrorMsg(err?.message || 'Failed to save credit configuration and link GL account.');
    } finally {
      setCreditSaving(false);
    }
  };

  const handleToggleComp = async () => {
    if (isCompEnabled) {
      setCompSaving(true);
      setCompErrorMsg(null);
      setCompSuccessMsg(null);
      try {
        await rbacService.updateTableApi(table.id, { comp_enabled: false }, businessId);
        setIsCompEnabled(false);
        setCompSuccessMsg('Complementary mode disabled.');
        if (onTableUpdated) onTableUpdated({ ...table, comp_enabled: false });
        setTimeout(() => setCompSuccessMsg(null), 3000);
      } catch (err: any) {
        setCompErrorMsg(err?.message || 'Failed to update complementary setting.');
      } finally {
        setCompSaving(false);
      }
    } else {
      setIsCompEnabled(true);
      setCompErrorMsg(null);
      setCompSuccessMsg(null);
    }
  };

  const handleSaveCompConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setCompErrorMsg(null);
    setCompSuccessMsg(null);

    if (!compOrdererName.trim()) {
      setCompErrorMsg('Orderer Name is compulsory for Complementary Mode.');
      return;
    }
    if (!compOrdererPhone.trim()) {
      setCompErrorMsg('Orderer Phone Number is compulsory for Complementary Mode.');
      return;
    }

    setCompSaving(true);
    try {
      const updates = {
        comp_enabled: true,
        comp_orderer_name: compOrdererName.trim(),
        comp_orderer_phone: compOrdererPhone.trim(),
      };
      await rbacService.updateTableApi(table.id, updates, businessId);
      setCompSuccessMsg('Complementary settings saved successfully! Table is ready for authorized comp orders.');
      if (onTableUpdated) onTableUpdated({ ...table, ...updates });
      setTimeout(() => setCompSuccessMsg(null), 3000);
    } catch (err: any) {
      setCompErrorMsg(err?.message || 'Failed to save complementary settings.');
    } finally {
      setCompSaving(false);
    }
  };

  // Target customer URL
  const origin = window.location.origin;
  const menuUrl = `${origin}/t/${encodeURIComponent(table.id)}`;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(
        canvasRef.current,
        menuUrl,
        {
          width: 240,
          margin: 2,
          color: {
            dark: '#18181b', // zinc-900
            light: '#ffffff',
          },
          errorCorrectionLevel: 'H',
        },
        (err) => {
          if (err) console.error('Failed to generate QR canvas:', err);
          else if (canvasRef.current) {
            setQrDataUrl(canvasRef.current.toDataURL('image/png'));
          }
        }
      );
    }
  }, [menuUrl, table]);

  const handleCopyLink = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(menuUrl);
      } else {
        // Fallback for non-HTTPS / LAN IP contexts (http://192.168.x.x:3000)
        const textarea = document.createElement('textarea');
        textarea.value = menuUrl;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Clipboard write error, attempting execCommand fallback:', err);
      try {
        const textarea = document.createElement('textarea');
        textarea.value = menuUrl;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (fallbackErr) {
        console.error('All copy strategies failed:', fallbackErr);
      }
    }
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;

    // Create high-res download with branded border and label
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = 600;
    exportCanvas.height = 760;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.roundRect(0, 0, 600, 760, 24);
    ctx.fill();

    // Top decorative bar
    ctx.fillStyle = '#d97706'; // amber-600
    ctx.fillRect(0, 0, 600, 16);

    // Business Name
    ctx.fillStyle = '#18181b';
    ctx.font = 'bold 30px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(businessName, 300, 75);

    // Subtitle
    ctx.fillStyle = '#71717a';
    ctx.font = '16px system-ui, -apple-system, sans-serif';
    ctx.fillText('Digital Dining & Smart Ordering', 300, 105);

    // Table Badge
    ctx.fillStyle = '#fef3c7';
    ctx.roundRect(175, 130, 250, 48, 24);
    ctx.fill();
    ctx.fillStyle = '#92400e';
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
    ctx.fillText(table.table_number, 300, 162);

    // Location (Floor / Building)
    const locText = [table.building, table.floor].filter(Boolean).join(' • ');
    if (locText) {
      ctx.fillStyle = '#52525b';
      ctx.font = '14px system-ui, -apple-system, sans-serif';
      ctx.fillText(locText, 300, 205);
    }

    // Draw QR Code
    const qrImg = new Image();
    qrImg.src = qrDataUrl;
    qrImg.onload = () => {
      ctx.drawImage(qrImg, 125, 230, 350, 350);

      // Call to action
      ctx.fillStyle = '#18181b';
      ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
      ctx.fillText('Scan with Camera to Order', 300, 630);

      ctx.fillStyle = '#71717a';
      ctx.font = '14px system-ui, -apple-system, sans-serif';
      ctx.fillText('Instant digital menu • No app download required', 300, 660);

      // Footer branding
      ctx.fillStyle = '#a1a1aa';
      ctx.font = '12px system-ui, -apple-system, sans-serif';
      ctx.fillText('Powered by NamasteQR', 300, 720);

      // Download
      const link = document.createElement('a');
      link.download = `QR-${table.table_number.replace(/\s+/g, '_')}-${businessName.replace(/\s+/g, '_')}.png`;
      link.href = exportCanvas.toDataURL('image/png');
      link.click();
    };
  };

  const handlePrintCard = async () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      window.print();
      return;
    }
    const qrDataUrl = canvas.toDataURL('image/png');

    const escapeHtml = (str: any) =>
      String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Table Stand - Table ${escapeHtml(table.table_number)}</title>
          <style>
            @media print {
              @page { margin: 0; size: auto; }
              body { margin: 2mm 3mm; }
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace, sans-serif;
              width: 280px;
              margin: 0 auto;
              padding: 6px 2px;
              color: #000;
              background: #fff;
              text-align: center;
              box-sizing: border-box;
            }
            .badge {
              display: inline-block;
              font-size: 10px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              padding: 2px 8px;
              border: 1px solid #000;
              border-radius: 9999px;
              margin-bottom: 4px;
            }
            .title {
              font-size: 20px;
              font-weight: 900;
              margin: 2px 0 6px 0;
              line-height: 1.2;
              letter-spacing: -0.5px;
            }
            .table-box {
              background: #000;
              color: #fff;
              font-size: 16px;
              font-weight: 900;
              padding: 5px 12px;
              border-radius: 6px;
              display: inline-block;
              margin: 4px 0 6px 0;
              letter-spacing: 0.5px;
            }
            .meta {
              font-size: 11px;
              font-weight: 600;
              color: #333;
              margin-bottom: 6px;
            }
            .divider {
              border-bottom: 1px dashed #000;
              margin: 6px 0 10px 0;
            }
            .qr-container {
              display: block;
              margin: 6px auto;
              text-align: center;
            }
            .qr-image {
              width: 190px;
              height: 190px;
              display: block;
              margin: 0 auto;
              image-rendering: pixelated;
            }
            .instructions {
              margin-top: 8px;
            }
            .instructions h3 {
              font-size: 13px;
              font-weight: 900;
              margin: 0 0 2px 0;
            }
            .instructions p {
              font-size: 10px;
              color: #444;
              margin: 0;
            }
            .cut-line {
              border-bottom: 1px dashed #999;
              margin-top: 14px;
              padding-top: 4px;
              font-size: 9px;
              color: #777;
            }
          </style>
        </head>
        <body>
          <div class="badge">Digital Table Stand</div>
          <div class="title">${escapeHtml(businessName)}</div>
          <div>
            <div class="table-box">TABLE #${escapeHtml(table.table_number)}</div>
          </div>
          <div class="meta">
            ${table.building ? `${escapeHtml(table.building)} • ` : ''}
            ${table.floor ? `${escapeHtml(table.floor)} • ` : ''}
            ${table.capacity ? `${table.capacity} Seats` : ''}
          </div>
          <div class="divider"></div>
          <div class="qr-container">
            <img class="qr-image" src="${qrDataUrl}" alt="Table QR Code" />
          </div>
          <div class="instructions">
            <h3>Scan to View Menu &amp; Order</h3>
            <p>Instant live table ordering with digital menu</p>
          </div>
          <div class="cut-line">- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</div>
        </body>
      </html>
    `;

    const driver = printService.getDriver('browser') as any;
    if (driver && typeof driver.printHtml === 'function') {
      await driver.printHtml(html);
    } else {
      window.print();
    }
  };

  return (
    <>
      <style>{`
        @media print {
          body {
            overflow: visible !important;
            background: #fff !important;
          }
          #table-qr-modal-backdrop {
            position: static !important;
            background: transparent !important;
            padding: 0 !important;
            overflow: visible !important;
            inset: auto !important;
          }
          #qr-stand-card-printable {
            max-height: none !important;
            overflow: visible !important;
            box-shadow: none !important;
            border: 1px solid #ddd !important;
            width: 280px !important;
            max-width: 280px !important;
            margin: 0 auto !important;
          }
          #qr-stand-card-printable canvas {
            max-width: 190px !important;
            max-height: 190px !important;
            height: auto !important;
          }
        }
      `}</style>
      <div 
        id="table-qr-modal-backdrop"
      className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950/70 backdrop-blur-xs p-3 sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="min-h-full flex items-center justify-center py-4">
        {/* Printable Area / Card Container */}
        <div 
          id="qr-stand-card-printable"
          className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-zinc-200 flex flex-col max-h-[90vh] overflow-hidden relative animate-in fade-in zoom-in-95 duration-200 my-auto"
        >
          {/* Card Header (Sticky at top of card) */}
          <div className="p-4 sm:p-5 pb-3 border-b border-zinc-100 flex items-start justify-between gap-3 bg-white z-10 shrink-0">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200/80">
                <Sparkles className="w-3 h-3 text-amber-600" />
                Digital Table Stand
              </div>
              <h2 className="text-lg font-extrabold text-zinc-900 tracking-tight">
                {businessName}
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <span className="font-bold text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded-md">
                  Table #{table.table_number}
                </span>
                {table.building && (
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3 h-3 text-zinc-400" />
                    {table.building}
                  </span>
                )}
                {table.floor && (
                  <span className="flex items-center gap-1">
                    <Layers className="w-3 h-3 text-zinc-400" />
                    {table.floor}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3 text-zinc-400" />
                  {table.capacity} Seats
                </span>
              </div>
            </div>

            {/* Prominent Close Button */}
            <button
              id="btn-close-qr-modal"
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-600 hover:text-zinc-900 border border-zinc-200/80 flex items-center justify-center transition-colors print:hidden cursor-pointer shrink-0"
              title="Close modal (Esc)"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Card Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {/* Central QR Display */}
            <div className="flex flex-col items-center justify-center">
              <div className="p-4 bg-white rounded-2xl border-2 border-zinc-900 shadow-md flex flex-col items-center max-w-[280px] w-full">
                {/* Table Number Pill */}
                <div className="px-4 py-1 rounded-full bg-amber-500 text-white font-extrabold text-sm tracking-wide mb-2 shadow-xs">
                  Table {table.table_number}
                </div>

                {/* Canvas */}
                <div className="p-2 bg-white rounded-xl flex items-center justify-center">
                  <canvas ref={canvasRef} className="rounded-lg max-w-[200px] max-h-[200px] w-full h-auto" />
                </div>

                <div className="mt-2 text-center">
                  <p className="text-xs font-bold text-zinc-900">Scan to View Menu & Order</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">Instant live table ordering</p>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  table.status === 'ACTIVE'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : table.status === 'OCCUPIED'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'bg-zinc-100 text-zinc-600 border border-zinc-200'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    table.status === 'ACTIVE' ? 'bg-emerald-500' : table.status === 'OCCUPIED' ? 'bg-blue-500' : 'bg-zinc-400'
                  }`} />
                  Current Status: {table.status}
                </span>
                {table.credit_only && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200 shadow-2xs">
                    <CreditCard className="w-3 h-3 text-purple-600" />
                    Credit Only Table
                  </span>
                )}
                {isCompEnabled && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 shadow-2xs">
                    <Gift className="w-3 h-3 text-amber-600" />
                    Comp Mode Active
                  </span>
                )}
              </div>
            </div>

            {/* Live URL box (Hidden on print) */}
            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-1.5 print:hidden">
              <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-500">
                <span>Direct Digital Menu Link:</span>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="text-amber-700 hover:text-amber-900 flex items-center gap-1 font-bold cursor-pointer"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
              <p className="text-xs text-zinc-700 font-mono truncate bg-white p-2 rounded-lg border border-zinc-200/80">
                {menuUrl}
              </p>
            </div>

            {/* Direct test preview button */}
            <div className="text-center print:hidden">
              <a
                href={menuUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 font-semibold hover:underline"
              >
                Open Live Customer View in New Tab
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* Credit Account Configuration Section */}
            <div className="pt-2 border-t border-zinc-200/80 space-y-3 print:hidden">
              <div className="flex items-center justify-between bg-purple-50/70 p-3.5 rounded-2xl border border-purple-200/80">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-extrabold text-purple-950 flex items-center gap-1.5">
                      Credit-Only Table Account
                      {table.credit_only && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-purple-200/80 text-purple-900">
                          Active
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-purple-700">
                      Pre-filled customer info, 6-digit PIN & dedicated GL Account
                    </p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isCreditOnly}
                    onChange={(e) => setIsCreditOnly(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-zinc-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>

              {!isCreditOnly && table.credit_only && (
                <div className="p-4 bg-rose-50/80 rounded-2xl border border-rose-200 space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-bold text-rose-900">Credit Only is currently enabled</h4>
                      <p className="text-[11px] text-rose-700">Turn off credit-only requirement and revert table to standard dining mode.</p>
                    </div>
                    <button
                      type="button"
                      disabled={creditSaving}
                      onClick={async () => {
                        setCreditSaving(true);
                        setCreditErrorMsg(null);
                        try {
                          await rbacService.updateTableApi(table.id, { credit_only: false }, businessId);
                          setCreditSuccessMsg('Credit-only mode disabled successfully.');
                          if (onTableUpdated) onTableUpdated({ ...table, credit_only: false });
                          setTimeout(() => setCreditSuccessMsg(null), 3000);
                        } catch (err: any) {
                          setCreditErrorMsg(err?.message || 'Failed to update table settings.');
                        } finally {
                          setCreditSaving(false);
                        }
                      }}
                      className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      {creditSaving ? 'Disabling...' : 'Confirm Disable'}
                    </button>
                  </div>
                  {creditErrorMsg && (
                    <div className="p-2 bg-red-100 text-red-800 rounded-lg text-xs font-medium">
                      {creditErrorMsg}
                    </div>
                  )}
                  {creditSuccessMsg && (
                    <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-medium">
                      {creditSuccessMsg}
                    </div>
                  )}
                </div>
              )}

              {isCreditOnly && (
                <form onSubmit={handleSaveCreditConfig} className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-3.5">
                  {/* Customer Name (Compulsory) */}
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                      Customer Name <span className="text-red-500">* (Compulsory)</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => {
                        setCustomerName(e.target.value);
                        if (!glAccountName || glAccountName.startsWith('Credit Settlement - Table')) {
                          setGlAccountName(`Credit Settlement - Table ${table.table_number} (${e.target.value})`);
                        }
                      }}
                      placeholder="e.g. John Doe / Room 402"
                      className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-xs font-semibold text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                    />
                    <p className="text-[10px] text-zinc-400 mt-0.5">Pre-filled and locked in customer cart view</p>
                  </div>

                  {/* Customer Phone (Compulsory) */}
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                      Customer Phone Number <span className="text-red-500">* (Compulsory)</span>
                    </label>
                    <input
                      type="tel"
                      required
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="e.g. 9841234567"
                      className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-xs font-semibold text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  {/* 6-Digit PIN */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-zinc-700 flex items-center gap-1">
                        <KeyRound className="w-3 h-3 text-purple-600" />
                        6-Digit Authorization PIN <span className="text-red-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleGeneratePin}
                        className="text-[11px] font-bold text-purple-700 hover:text-purple-900 flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Generate PIN
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showPin ? 'text' : 'password'}
                        maxLength={6}
                        required
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="6-digit PIN (e.g. 123456)"
                        className="w-full px-3 py-2 pr-10 bg-white border border-zinc-300 rounded-xl text-xs font-mono font-bold tracking-widest text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPin(!showPin)}
                        className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                        title={showPin ? "Hide PIN" : "Show PIN"}
                      >
                        {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-0.5">Customer enters this 6-digit PIN on phone to confirm Credit or Deposit</p>
                  </div>

                  {/* GL Account Number (Auto-generated 5-digit with editable field) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-zinc-700 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-emerald-600" />
                        GL Account Number <span className="text-red-500">* (5-Digit)</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleGenerateGlNumber}
                        className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Auto-generate
                      </button>
                    </div>
                    <input
                      type="text"
                      required
                      value={glAccountNumber}
                      onChange={(e) => setGlAccountNumber(e.target.value.trim())}
                      placeholder="e.g. 90909 or 51240"
                      className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-xs font-mono font-bold text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    />
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
                      <span className="px-1.5 py-0.5 rounded bg-zinc-200/80 font-mono font-semibold text-zinc-700">Category: ASSET</span>
                      <span className="px-1.5 py-0.5 rounded bg-zinc-200/80 font-mono font-semibold text-zinc-700">Key: CREDIT_SETTLEMENT</span>
                    </div>
                  </div>

                  {/* Feedback Banners */}
                  {creditErrorMsg && (
                    <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{creditErrorMsg}</span>
                    </div>
                  )}

                  {creditSuccessMsg && (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{creditSuccessMsg}</span>
                    </div>
                  )}

                  {/* Save button */}
                  <div className="pt-1">
                    <button
                      type="submit"
                      disabled={creditSaving}
                      className="w-full py-2.5 px-4 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {creditSaving ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving & Linking GL Account...</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          <span>Save Credit Account & Link GL</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Complementary Mode Card */}
            <div className="border border-amber-200 bg-amber-50/40 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                    <Gift className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                      Complementary Mode
                      {table.comp_enabled && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-200 text-amber-900">
                          Active
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-zinc-500 leading-tight">
                      Orderer authorizes complimentary dishes with password
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleToggleComp}
                  disabled={compSaving}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    isCompEnabled ? 'bg-amber-500' : 'bg-zinc-300'
                  } disabled:opacity-50 cursor-pointer`}
                  aria-label="Toggle complementary mode"
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                      isCompEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {isCompEnabled && (
                <form onSubmit={handleSaveCompConfig} className="pt-2 border-t border-amber-200/80 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-zinc-700 flex items-center gap-1 mb-1">
                        <User className="w-3 h-3 text-amber-600" />
                        Orderer Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={compOrdererName}
                        onChange={(e) => setCompOrdererName(e.target.value)}
                        placeholder="e.g. Owner / Manager John"
                        className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-zinc-700 flex items-center gap-1 mb-1">
                        <Phone className="w-3 h-3 text-amber-600" />
                        Orderer Phone <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        required
                        value={compOrdererPhone}
                        onChange={(e) => setCompOrdererPhone(e.target.value)}
                        placeholder="e.g. 9812345678"
                        className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <p className="text-[10px] text-zinc-500">
                    Recorded in the dedicated Complementary Ledger alongside date and time of order.
                  </p>

                  <div className="pt-1">
                    <button
                      type="submit"
                      disabled={compSaving}
                      className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {compSaving ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving Complementary Settings...</span>
                        </>
                      ) : (
                        <>
                          <Gift className="w-3.5 h-3.5" />
                          <span>Save Complementary Settings</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {compSuccessMsg && (
                <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{compSuccessMsg}</span>
                </div>
              )}
              {compErrorMsg && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{compErrorMsg}</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons (Sticky at bottom of card, hidden when printing) */}
          <div className="p-4 sm:p-5 bg-zinc-50 border-t border-zinc-200 flex flex-col sm:flex-row items-center gap-2.5 print:hidden shrink-0">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={handleDownloadQr}
              leftIcon={<Download className="w-4 h-4 text-zinc-600" />}
              className="w-full sm:flex-1 text-xs font-bold"
            >
              Download PNG
            </Button>

            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handlePrintCard}
              leftIcon={<Printer className="w-4 h-4" />}
              className="w-full sm:flex-1 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
            >
              Print Stand Card
            </Button>

            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={onClose}
              className="w-full sm:w-auto text-xs font-bold text-zinc-600 hover:text-zinc-900"
            >
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
};
