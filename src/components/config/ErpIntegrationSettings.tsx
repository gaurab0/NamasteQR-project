import React, { useState, useEffect } from 'react';
import {
  Building2,
  Server,
  Key,
  Globe,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Save,
  Layers,
  ArrowRight,
  ShieldCheck,
  FileSpreadsheet
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export interface ERPConfigData {
  provider: 'NONE' | 'LOCAL_POS' | 'CLOUD_WEBHOOK';
  apiUrl?: string;
  apiKey?: string;
  companyCode?: string;
  branchCode?: string;
  syncKot: boolean;
  syncSettlement: boolean;
  isActive: boolean;
}

interface ErpIntegrationSettingsProps {
  businessId?: string;
}

export const ErpIntegrationSettings: React.FC<ErpIntegrationSettingsProps> = ({ businessId: propBusinessId }) => {
  const { user, activeBusiness, currentBusiness } = useAuth();
  const effectiveBusinessId = propBusinessId || activeBusiness?.id || currentBusiness?.id || user?.business?.id || 'namaste-bistro';
  const [config, setConfig] = useState<ERPConfigData>({
    provider: 'NONE',
    apiUrl: '',
    apiKey: '',
    companyCode: '',
    branchCode: '',
    syncKot: true,
    syncSettlement: true,
    isActive: false,
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/rbac/erp-integration?businessId=${effectiveBusinessId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setConfig({
            provider: json.data.provider || 'NONE',
            apiUrl: json.data.apiUrl || '',
            apiKey: json.data.apiKey || '',
            companyCode: json.data.companyCode || '',
            branchCode: json.data.branchCode || '',
            syncKot: json.data.syncKot !== false,
            syncSettlement: json.data.syncSettlement !== false,
            isActive: Boolean(json.data.isActive),
          });
        }
      }
    } catch (err: any) {
      console.error('Failed to load ERP integration settings:', err);
      setError('Could not connect to server to load ERP settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (effectiveBusinessId) {
      fetchConfig();
    }
  }, [effectiveBusinessId]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      setSaveSuccess(null);
      const res = await fetch(`/api/rbac/erp-integration?businessId=${effectiveBusinessId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setSaveSuccess('Accounting & ERP integration settings saved successfully.');
        setTimeout(() => setSaveSuccess(null), 4000);
      } else {
        setError(json.error?.message || json.message || 'Failed to save settings.');
      }
    } catch (err: any) {
      setError(err.message || 'Error communicating with server.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      setTestResult(null);
      setError(null);
      const res = await fetch(`/api/rbac/erp-integration/test?businessId=${effectiveBusinessId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      const json = await res.json();
      setTestResult({
        success: Boolean(json.success),
        message: json.message || (json.success ? 'Connection successful!' : 'Connection failed'),
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Network error reaching ERP endpoint',
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-5 h-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-zinc-200/90 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-purple-50 text-purple-600 border border-purple-100">
              <Layers className="w-4 h-4" />
            </span>
            <h3 className="text-base font-bold text-zinc-900">3rd-Party Accounting & ERP System Sync</h3>
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed max-w-2xl">
            Keep NamasteQR as your high-speed ordering, KDS, and thermal printing engine while automatically 
            pushing KOTs and sales records to your accounting software or POS system in real time.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchConfig}
            className="p-2 rounded-xl border border-zinc-200 hover:bg-zinc-50 text-zinc-600 transition cursor-pointer"
            title="Reload settings"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Step 1: Choose Provider */}
        <div className="bg-white border border-zinc-200/90 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <div>
              <h4 className="text-sm font-bold text-zinc-900">Select Accounting Provider</h4>
              <p className="text-xs text-zinc-500">Choose the software your accountant or POS terminal currently operates</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
              Multi-Tenant
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { id: 'NONE', label: 'Standalone / None', desc: 'No external ERP sync (NamasteQR handles operations only)' },
              { id: 'LOCAL_POS', label: 'Local POS / Accounting System', desc: 'Sync with software running on your local network/PC (supports pre-tax rates & KOTs)' },
              
              { id: 'CLOUD_WEBHOOK', label: 'Cloud Accounting / Webhook', desc: 'Dispatch live order payloads to any cloud endpoint or web service' },
            ].map((p) => {
              const isSelected = config.provider === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setConfig({ ...config, provider: p.id as any, isActive: p.id !== 'NONE' })}
                  className={`p-4 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between gap-2 ${
                    isSelected
                      ? 'border-purple-600 bg-purple-50/40 ring-2 ring-purple-600/10'
                      : 'border-zinc-200 hover:border-zinc-300 bg-white hover:bg-zinc-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className={`text-xs font-bold ${isSelected ? 'text-purple-900' : 'text-zinc-800'}`}>
                      {p.label}
                    </span>
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />}
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-normal">{p.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Connection Credentials (Shown if not NONE) */}
        {config.provider !== 'NONE' && (
          <div className="bg-white border border-zinc-200/90 rounded-2xl p-6 shadow-xs space-y-5 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div>
                <h4 className="text-sm font-bold text-zinc-900">API Connection Credentials</h4>
                <p className="text-xs text-zinc-500">Target server endpoint and authentication keys</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.isActive}
                  onChange={(e) => setConfig({ ...config, isActive: e.target.checked })}
                  className="rounded border-zinc-300 text-purple-600 focus:ring-purple-500 w-4 h-4"
                />
                <span className="text-xs font-semibold text-zinc-700">Enable Live Integration</span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-zinc-700">API URL / Server Endpoint *</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                    <Globe className="w-3.5 h-3.5" />
                  </span>
                  <input
                    type="text"
                    required
                    value={config.apiUrl || ''}
                    onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
                    placeholder="e.g. http://192.168.1.100:8080 or https://api.yourprovider.com"
                    className="w-full text-xs pl-9 pr-3 py-2.5 border border-zinc-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-purple-600 font-mono"
                  />
                </div>
                <span className="text-[10px] text-zinc-400">Can be a local IP on your restaurant's WiFi network or a cloud URL.</span>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-zinc-700">API Key / Secret Token</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                    <Key className="w-3.5 h-3.5" />
                  </span>
                  <input
                    type="password"
                    value={config.apiKey || ''}
                    onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                    placeholder="Enter authentication key or leave blank if none"
                    className="w-full text-xs pl-9 pr-3 py-2.5 border border-zinc-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-purple-600 font-mono"
                  />
                </div>
                <span className="text-[10px] text-zinc-400">Encrypted and securely stored on the server.</span>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-zinc-700">Company ID / Database Name</label>
                <input
                  type="text"
                  value={config.companyCode || ''}
                  onChange={(e) => setConfig({ ...config, companyCode: e.target.value })}
                  placeholder="e.g. 01, COMP_2081, or Himalayan_Cafe"
                  className="w-full text-xs px-3 py-2.5 border border-zinc-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-purple-600 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-zinc-700">Branch / Counter Code</label>
                <input
                  type="text"
                  value={config.branchCode || ''}
                  onChange={(e) => setConfig({ ...config, branchCode: e.target.value })}
                  placeholder="e.g. BR-01 or MAIN_POS"
                  className="w-full text-xs px-3 py-2.5 border border-zinc-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-purple-600 font-mono"
                />
              </div>
            </div>

            {/* Sync Toggles */}
            <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-zinc-800">Automated Dispatch Triggers</span>
                <p className="text-[11px] text-zinc-500">Configure when NamasteQR communicates with the external software</p>
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-zinc-700">
                  <input
                    type="checkbox"
                    checked={config.syncKot}
                    onChange={(e) => setConfig({ ...config, syncKot: e.target.checked })}
                    className="rounded border-zinc-300 text-purple-600 focus:ring-purple-500 w-4 h-4"
                  />
                  <span>Dispatch KOTs</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-zinc-700">
                  <input
                    type="checkbox"
                    checked={config.syncSettlement}
                    onChange={(e) => setConfig({ ...config, syncSettlement: e.target.checked })}
                    className="rounded border-zinc-300 text-purple-600 focus:ring-purple-500 w-4 h-4"
                  />
                  <span>Sync Invoices</span>
                </label>
              </div>
            </div>

            {/* Test Connection Button & Result */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing || !config.apiUrl}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-300 hover:border-zinc-400 bg-white hover:bg-zinc-50 text-xs font-bold text-zinc-800 transition cursor-pointer disabled:opacity-50"
              >
                {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-600" /> : <Server className="w-3.5 h-3.5 text-purple-600" />}
                <span>Test Connection</span>
              </button>

              {testResult && (
                <div className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
                  testResult.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}>
                  {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Save Bar */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Save Integration Settings</span>
          </button>
        </div>
      </form>
    </div>
  );
};
