"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp,
  getDocs
} from 'firebase/firestore';
import { 
  Laptop, 
  ShieldAlert, 
  ShieldCheck, 
  AlertTriangle, 
  Sparkles, 
  RefreshCw, 
  Search, 
  Filter, 
  Globe, 
  Mail, 
  Clock, 
  Lock, 
  Unlock, 
  Trash2, 
  UserCheck, 
  ExternalLink,
  ChevronRight,
  Info
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

export interface DeviceRecord {
  id: string;
  deviceId: string;
  primaryEmail?: string;
  primaryUid?: string;
  registeredEmails?: string[];
  registeredUids?: string[];
  sessionCount?: number;
  usedMinutes?: number;
  trialExceeded?: boolean;
  hasPro?: boolean;
  isPro?: boolean;
  ip?: string;
  country?: string;
  platform?: string;
  userAgent?: string;
  firstSeen?: any;
  lastSeen?: any;
}

export default function AdminDevicesPage() {
  const firestore = useFirestore();
  const { toast } = useToast();

  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'hoppers' | 'exhausted' | 'pro'>('all');
  
  // Selected device for modal inspection & management
  const [selectedDevice, setSelectedDevice] = useState<DeviceRecord | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Real-time listener for devices collection
  useEffect(() => {
    if (!firestore) return;
    setLoading(true);

    const unsubscribe = onSnapshot(collection(firestore, 'devices'), (snapshot) => {
      const records: DeviceRecord[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));

      // Sort newest / most active first
      records.sort((a, b) => {
        const timeA = a.lastSeen?.seconds ? a.lastSeen.seconds * 1000 : (a.firstSeen?.seconds ? a.firstSeen.seconds * 1000 : 0);
        const timeB = b.lastSeen?.seconds ? b.lastSeen.seconds * 1000 : (b.firstSeen?.seconds ? b.firstSeen.seconds * 1000 : 0);
        return timeB - timeA;
      });

      setDevices(records);
      setLoading(false);
    }, (err) => {
      console.error('Failed to load devices ledger:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [firestore]);

  // Derived metrics
  const stats = useMemo(() => {
    const totalDevices = devices.length;
    const multiAccountDevices = devices.filter((d) => (d.registeredEmails && d.registeredEmails.length > 1));
    const trialExhaustedDevices = devices.filter((d) => {
      const isPro = d.hasPro === true || d.isPro === true;
      return !isPro && (d.trialExceeded === true || (d.sessionCount || 0) >= 3 || (d.usedMinutes || 0) >= 30);
    });
    const proDevices = devices.filter((d) => d.hasPro === true || d.isPro === true);

    return {
      totalDevices,
      multiAccountCount: multiAccountDevices.length,
      trialExhaustedCount: trialExhaustedDevices.length,
      proCount: proDevices.length,
    };
  }, [devices]);

  // Filtered devices
  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      // 1. Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesId = d.id?.toLowerCase().includes(q) || d.deviceId?.toLowerCase().includes(q);
        const matchesIp = d.ip?.toLowerCase().includes(q);
        const matchesPlatform = d.platform?.toLowerCase().includes(q);
        const matchesPrimary = d.primaryEmail?.toLowerCase().includes(q);
        const matchesAnyEmail = d.registeredEmails?.some((em) => em.toLowerCase().includes(q));

        if (!matchesId && !matchesIp && !matchesPlatform && !matchesPrimary && !matchesAnyEmail) {
          return false;
        }
      }

      // 2. Filter mode
      const isPro = d.hasPro === true || d.isPro === true;
      const isExhausted = !isPro && (d.trialExceeded === true || (d.sessionCount || 0) >= 3 || (d.usedMinutes || 0) >= 30);
      const isHopper = (d.registeredEmails && d.registeredEmails.length > 1);

      if (filterMode === 'hoppers') return isHopper;
      if (filterMode === 'exhausted') return isExhausted;
      if (filterMode === 'pro') return isPro;

      return true;
    });
  }, [devices, searchQuery, filterMode]);

  // Actions
  const handleResetDeviceTrial = async (dev: DeviceRecord) => {
    if (!firestore) return;
    setActionLoading(true);
    try {
      await updateDoc(doc(firestore, 'devices', dev.id), {
        sessionCount: 0,
        usedMinutes: 0,
        trialExceeded: false,
        lastSeen: serverTimestamp()
      });
      toast({
        title: 'Trial Reset',
        description: `Reset free trial counters for device ${dev.id.slice(0, 14)}...`,
      });
      setIsDetailOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleLockDevice = async (dev: DeviceRecord) => {
    if (!firestore) return;
    setActionLoading(true);
    try {
      await updateDoc(doc(firestore, 'devices', dev.id), {
        trialExceeded: true,
        sessionCount: Math.max(3, dev.sessionCount || 3),
        usedMinutes: Math.max(30, dev.usedMinutes || 30),
        lastSeen: serverTimestamp()
      });
      toast({
        title: 'Device Locked',
        description: `Enforced trial lock on machine ${dev.id.slice(0, 14)}...`,
      });
      setIsDetailOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleTogglePro = async (dev: DeviceRecord) => {
    if (!firestore) return;
    setActionLoading(true);
    const newPro = !(dev.hasPro === true || dev.isPro === true);
    try {
      await updateDoc(doc(firestore, 'devices', dev.id), {
        hasPro: newPro,
        isPro: newPro,
        trialExceeded: newPro ? false : dev.trialExceeded,
        lastSeen: serverTimestamp()
      });
      toast({
        title: newPro ? 'Pro Granted' : 'Pro Removed',
        description: `Device ${dev.id.slice(0, 14)}... is now ${newPro ? 'Voiceflow Pro' : 'Free Tier'}.`,
      });
      setIsDetailOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteDevice = async (dev: DeviceRecord) => {
    if (!firestore) return;
    if (!window.confirm(`Are you sure you want to delete device record ${dev.id}?`)) return;
    setActionLoading(true);
    try {
      await deleteDoc(doc(firestore, 'devices', dev.id));
      toast({
        title: 'Record Deleted',
        description: 'Device record removed from ledger.',
      });
      setIsDetailOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (val: any) => {
    if (!val) return 'Never';
    const date = val?.toDate ? val.toDate() : new Date(val);
    if (isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-orange-500/10 dark:bg-orange-500/20 rounded-xl text-voiceflow-orange">
              <ShieldAlert size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white font-clash">
                Hardware Fraud Shield & Device Trial Ledger
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Permanent machine fingerprinting & multi-account evasion tracking.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (firestore) {
                setLoading(true);
                getDocs(collection(firestore, 'devices')).then((snap) => {
                  setDevices(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
                  setLoading(false);
                });
              }
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-muted dark:hover:bg-muted/80 text-gray-700 dark:text-gray-300 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh Ledger
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-card border border-gray-200 dark:border-border shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Unique Machines
            </div>
            <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">
              {stats.totalDevices}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">Identified hardware fingerprints</div>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-2xl text-blue-600 dark:text-blue-400">
            <Laptop size={22} />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-card border border-red-200 dark:border-red-900/30 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertTriangle size={13} /> Multi-Account Hoppers
            </div>
            <div className="text-2xl font-black text-red-600 dark:text-red-400 mt-1">
              {stats.multiAccountCount}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">Machines with 2+ Gmail accounts</div>
          </div>
          <div className="p-3 bg-red-50 dark:bg-red-500/10 rounded-2xl text-red-600 dark:text-red-400">
            <ShieldAlert size={22} />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-card border border-orange-200 dark:border-orange-900/30 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-voiceflow-orange">
              Trials Exhausted
            </div>
            <div className="text-2xl font-black text-voiceflow-orange mt-1">
              {stats.trialExhaustedCount}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">Hit 30m / 3s limit (locked)</div>
          </div>
          <div className="p-3 bg-orange-50 dark:bg-orange-500/10 rounded-2xl text-voiceflow-orange">
            <Lock size={22} />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-card border border-emerald-200 dark:border-emerald-900/30 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Pro Machines
            </div>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {stats.proCount}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">Active paid subscriptions</div>
          </div>
          <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl text-emerald-600 dark:text-emerald-400">
            <Sparkles size={22} />
          </div>
        </div>
      </div>

      {/* Multi-Account Hoppers Callout Radar */}
      {stats.multiAccountCount > 0 && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-red-500/10 via-orange-500/10 to-amber-500/10 border border-red-500/30">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="text-red-600 dark:text-red-400 shrink-0" size={18} />
            <h3 className="text-sm font-bold text-red-900 dark:text-red-300">
              Multi-Account Evasion Radar Active ({stats.multiAccountCount} laptops flagged)
            </h3>
          </div>
          <p className="text-xs text-red-800 dark:text-red-300/80 mb-3">
            These physical machines attempted to create or login with multiple Gmail accounts to bypass the 30-minute / 3-session free trial limit. Our hardware fingerprinting automatically enforces the limit across all subsequent accounts on these machines.
          </p>
          <div className="flex flex-wrap gap-2">
            {devices
              .filter((d) => d.registeredEmails && d.registeredEmails.length > 1)
              .slice(0, 6)
              .map((d) => (
                <div
                  key={d.id}
                  onClick={() => {
                    setSelectedDevice(d);
                    setIsDetailOpen(true);
                  }}
                  className="cursor-pointer bg-white/80 dark:bg-card/80 hover:bg-white dark:hover:bg-card border border-red-200 dark:border-red-800/40 px-3 py-1.5 rounded-xl text-xs flex items-center gap-2 shadow-xs transition-all"
                >
                  <Laptop size={13} className="text-red-500" />
                  <span className="font-mono font-bold text-[11px] text-gray-900 dark:text-gray-200">
                    {d.id.slice(0, 16)}...
                  </span>
                  <span className="bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300 px-1.5 py-0.5 rounded-full font-bold text-[10px]">
                    {d.registeredEmails?.length} emails
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white dark:bg-card p-3 rounded-2xl border border-gray-200 dark:border-border shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by device ID, IP, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-gray-50 dark:bg-muted border border-gray-200 dark:border-border rounded-xl focus:outline-hidden focus:ring-1 focus:ring-voiceflow-orange text-gray-900 dark:text-white"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filterMode === 'all'
                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-muted'
            }`}
          >
            All ({devices.length})
          </button>
          <button
            onClick={() => setFilterMode('hoppers')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
              filterMode === 'hoppers'
                ? 'bg-red-600 text-white'
                : 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10'
            }`}
          >
            <AlertTriangle size={12} /> Hoppers ({stats.multiAccountCount})
          </button>
          <button
            onClick={() => setFilterMode('exhausted')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
              filterMode === 'exhausted'
                ? 'bg-voiceflow-orange text-white'
                : 'text-voiceflow-orange hover:bg-orange-50 dark:hover:bg-orange-500/10'
            }`}
          >
            <Lock size={12} /> Limit Reached ({stats.trialExhaustedCount})
          </button>
          <button
            onClick={() => setFilterMode('pro')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
              filterMode === 'pro'
                ? 'bg-emerald-600 text-white'
                : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
            }`}
          >
            <Sparkles size={12} /> Pro ({stats.proCount})
          </button>
        </div>
      </div>

      {/* Main Ledger Table */}
      {loading ? (
        <div className="p-16 text-center text-gray-500 bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-border">
          <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-voiceflow-orange" />
          Loading hardware ledger...
        </div>
      ) : filteredDevices.length === 0 ? (
        <div className="p-16 text-center text-gray-500 bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-border">
          <Laptop size={32} className="mx-auto mb-2 text-gray-400 opacity-60" />
          <p className="font-semibold text-gray-700 dark:text-gray-300">No matching devices found</p>
          <p className="text-xs text-gray-400 mt-1">Try modifying your search or filter query.</p>
        </div>
      ) : (
        <div className="border border-gray-200 dark:border-border rounded-2xl overflow-hidden bg-white dark:bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-gray-50/80 dark:bg-muted/50 border-b border-gray-200 dark:border-border text-gray-700 dark:text-gray-300 text-[11px] font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-3.5">Device & Hardware ID</th>
                  <th className="p-3.5">IP & Platform</th>
                  <th className="p-3.5">Registered Emails</th>
                  <th className="p-3.5">Usage (Sessions / Mins)</th>
                  <th className="p-3.5">Trial Status</th>
                  <th className="p-3.5">Last Active</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-border text-xs">
                {filteredDevices.map((dev) => {
                  const isPro = dev.hasPro === true || dev.isPro === true;
                  const isExhausted = !isPro && (dev.trialExceeded === true || (dev.sessionCount || 0) >= 3 || (dev.usedMinutes || 0) >= 30);
                  const isHopper = dev.registeredEmails && dev.registeredEmails.length > 1;
                  const sessions = dev.sessionCount || 0;
                  const mins = dev.usedMinutes || 0;

                  return (
                    <tr 
                      key={dev.id} 
                      className={`hover:bg-gray-50/80 dark:hover:bg-muted/30 transition-colors ${
                        isHopper ? 'bg-red-500/5' : ''
                      }`}
                    >
                      {/* Device & ID */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-2">
                          <div className={`p-2 rounded-xl shrink-0 ${
                            isPro ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' :
                            isHopper ? 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400' :
                            'bg-gray-100 text-gray-700 dark:bg-muted dark:text-gray-300'
                          }`}>
                            <Laptop size={16} />
                          </div>
                          <div>
                            <div className="font-mono font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                              {dev.id.startsWith('hw_') ? (
                                <>
                                  <span className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 px-1.5 py-0.2 rounded font-sans font-semibold">
                                    MachineGuid
                                  </span>
                                  <span>{dev.id.replace('hw_', '').slice(0, 16)}...</span>
                                </>
                              ) : (
                                <span>{dev.id.slice(0, 18)}...</span>
                              )}
                            </div>
                            <div className="text-[10px] text-gray-400 font-sans mt-0.5 truncate max-w-[180px]">
                              First seen: {formatDate(dev.firstSeen)}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* IP & Platform */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-1.5 text-gray-800 dark:text-gray-200 font-medium">
                          <Globe size={13} className="text-gray-400 shrink-0" />
                          <span className="font-mono text-[11px]">{dev.ip || 'Unknown'}</span>
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {dev.platform || 'Desktop App'}
                        </div>
                      </td>

                      {/* Registered Emails */}
                      <td className="p-3.5">
                        <div className="space-y-1 max-w-[240px]">
                          {dev.registeredEmails && dev.registeredEmails.length > 0 ? (
                            dev.registeredEmails.map((email, idx) => (
                              <div 
                                key={idx} 
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium mr-1.5 mb-0.5 ${
                                  idx === 0 
                                    ? 'bg-gray-100 text-gray-800 dark:bg-muted dark:text-gray-200' 
                                    : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-800/40'
                                }`}
                              >
                                <Mail size={11} className="shrink-0 opacity-70" />
                                <span className="truncate max-w-[150px]">{email}</span>
                                {idx > 0 && (
                                  <span className="text-[9px] font-bold text-red-600 dark:text-red-400 uppercase">
                                    (Hopper)
                                  </span>
                                )}
                              </div>
                            ))
                          ) : (
                            <span className="text-gray-400 italic">No account recorded</span>
                          )}
                        </div>
                      </td>

                      {/* Usage */}
                      <td className="p-3.5">
                        <div className="font-semibold text-gray-900 dark:text-white">
                          {sessions}/3 sessions • {mins}/30 mins
                        </div>
                        <div className="w-24 bg-gray-200 dark:bg-gray-700 h-1.5 rounded-full mt-1.5 overflow-hidden">
                          <div 
                            className={`h-full ${
                              isPro ? 'bg-emerald-500' : isExhausted ? 'bg-red-500' : 'bg-voiceflow-orange'
                            }`}
                            style={{ width: `${Math.min(100, Math.round((mins / 30) * 100))}%` }}
                          />
                        </div>
                      </td>

                      {/* Status */}
                      <td className="p-3.5">
                        {isPro ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[11px] font-bold px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
                            <Sparkles size={11} /> Pro Active
                          </span>
                        ) : isExhausted ? (
                          <span className="inline-flex items-center gap-1 bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 text-[11px] font-bold px-2.5 py-1 rounded-full border border-red-200 dark:border-red-800">
                            <Lock size={11} /> Limit Reached
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 text-[11px] font-bold px-2.5 py-1 rounded-full border border-blue-200 dark:border-blue-800">
                            <Unlock size={11} /> Trial Active
                          </span>
                        )}
                      </td>

                      {/* Last Active */}
                      <td className="p-3.5 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {formatDate(dev.lastSeen)}
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => {
                            setSelectedDevice(dev);
                            setIsDetailOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-orange-50 hover:bg-orange-100 text-voiceflow-orange border border-orange-200 dark:bg-orange-500/10 dark:hover:bg-orange-500/20 dark:border-orange-500/30 transition-colors"
                        >
                          Inspect & Manage
                          <ChevronRight size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Inspect & Manage Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-clash">
              <Laptop size={20} className="text-voiceflow-orange" />
              Hardware Identity Forensics
            </DialogTitle>
            <DialogDescription>
              Detailed machine ledger record, linked Gmail accounts, and fraud controls.
            </DialogDescription>
          </DialogHeader>

          {selectedDevice && (
            <div className="space-y-4 py-2">
              {/* ID & Hardware */}
              <div className="p-3 bg-gray-50 dark:bg-muted/50 rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Device ID / GUID:</span>
                  <span className="font-mono font-bold text-gray-900 dark:text-white select-all">
                    {selectedDevice.id}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Public IP:</span>
                  <span className="font-mono text-gray-900 dark:text-white select-all">
                    {selectedDevice.ip || 'Unknown'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Platform / OS:</span>
                  <span className="text-gray-900 dark:text-white">
                    {selectedDevice.platform || 'Desktop App'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">First Identified:</span>
                  <span className="text-gray-700 dark:text-gray-300">
                    {formatDate(selectedDevice.firstSeen)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Last Active Heartbeat:</span>
                  <span className="text-gray-700 dark:text-gray-300">
                    {formatDate(selectedDevice.lastSeen)}
                  </span>
                </div>
              </div>

              {/* Linked Accounts */}
              <div className="border border-gray-200 dark:border-border rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                    <Mail size={14} className="text-voiceflow-orange" />
                    Linked Accounts on this Laptop ({selectedDevice.registeredEmails?.length || 0})
                  </span>
                  {selectedDevice.registeredEmails && selectedDevice.registeredEmails.length > 1 && (
                    <span className="text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300 px-2 py-0.5 rounded-full">
                      Multi-Account Evasion Detected
                    </span>
                  )}
                </div>

                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {selectedDevice.registeredEmails?.map((em, idx) => (
                    <div 
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-muted/40 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          idx === 0 ? 'bg-orange-100 text-voiceflow-orange' : 'bg-red-100 text-red-700'
                        }`}>
                          {idx + 1}
                        </span>
                        <span className="font-medium text-gray-800 dark:text-gray-200">{em}</span>
                      </div>
                      <span className="text-[10px] text-gray-400 font-semibold">
                        {idx === 0 ? 'Primary Creator' : 'Hopper Account'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Usage & Trial Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-gray-50 dark:bg-muted/40 rounded-xl">
                  <div className="text-[11px] text-gray-500">Device Session Count</div>
                  <div className="text-lg font-black text-gray-900 dark:text-white mt-0.5">
                    {selectedDevice.sessionCount || 0} / 3 sessions
                  </div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-muted/40 rounded-xl">
                  <div className="text-[11px] text-gray-500">Device Minutes Used</div>
                  <div className="text-lg font-black text-gray-900 dark:text-white mt-0.5">
                    {selectedDevice.usedMinutes || 0} / 30 mins
                  </div>
                </div>
              </div>

              {/* Admin Management Actions */}
              <div className="pt-2 border-t border-gray-100 dark:border-border space-y-2">
                <div className="text-xs font-bold text-gray-700 dark:text-gray-300">
                  Administrative Overrides:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    disabled={actionLoading}
                    onClick={() => handleResetDeviceTrial(selectedDevice)}
                    className="flex items-center justify-center gap-1.5 p-2 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 transition-colors"
                  >
                    <Unlock size={14} />
                    Reset Free Trial
                  </button>
                  <button
                    disabled={actionLoading}
                    onClick={() => handleLockDevice(selectedDevice)}
                    className="flex items-center justify-center gap-1.5 p-2 rounded-xl text-xs font-bold bg-orange-50 text-voiceflow-orange hover:bg-orange-100 dark:bg-orange-500/10 dark:text-orange-400 transition-colors"
                  >
                    <Lock size={14} />
                    Force Lock (Limit)
                  </button>
                  <button
                    disabled={actionLoading}
                    onClick={() => handleTogglePro(selectedDevice)}
                    className="flex items-center justify-center gap-1.5 p-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 transition-colors"
                  >
                    <Sparkles size={14} />
                    {selectedDevice.hasPro || selectedDevice.isPro ? 'Revoke Pro' : 'Grant Pro'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex justify-between items-center sm:justify-between w-full">
            {selectedDevice && (
              <button
                disabled={actionLoading}
                onClick={() => handleDeleteDevice(selectedDevice)}
                className="text-xs text-red-600 hover:text-red-700 font-bold flex items-center gap-1 transition-colors"
              >
                <Trash2 size={13} /> Delete Record
              </button>
            )}
            <button
              onClick={() => setIsDetailOpen(false)}
              className="px-4 py-2 text-xs font-bold bg-gray-100 hover:bg-gray-200 dark:bg-muted dark:hover:bg-muted/80 rounded-xl transition-colors"
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
