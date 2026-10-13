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
  Sparkles 
} from 'lucide-react';
import { RestaurantTable } from '../../types/rbac';
import { Button } from '../ui/Button';

interface TableQrCardModalProps {
  table: RestaurantTable;
  businessName: string;
  businessId: string;
  onClose: () => void;
}

export const TableQrCardModal: React.FC<TableQrCardModalProps> = ({
  table,
  businessName,
  businessId,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  // Target customer URL
  const origin = window.location.origin;
  const menuUrl = `${origin}/menu?businessId=${encodeURIComponent(businessId)}&tableId=${encodeURIComponent(table.id)}&tableNumber=${encodeURIComponent(table.table_number)}${table.floor ? `&floor=${encodeURIComponent(table.floor)}` : ''}${table.building ? `&building=${encodeURIComponent(table.building)}` : ''}`;

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

  const handleCopyLink = () => {
    navigator.clipboard.writeText(menuUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
      ctx.fillText('Powered by ServeFlow', 300, 720);

      // Download
      const link = document.createElement('a');
      link.download = `QR-${table.table_number.replace(/\s+/g, '_')}-${businessName.replace(/\s+/g, '_')}.png`;
      link.href = exportCanvas.toDataURL('image/png');
      link.click();
    };
  };

  const handlePrintCard = () => {
    window.print();
  };

  return (
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
          className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-zinc-200 flex flex-col max-h-[90vh] overflow-hidden relative animate-in fade-in zoom-in-95 duration-200 my-auto"
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
  );
};
