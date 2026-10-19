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
  AlertTriangle, 
  Sparkles, 
  RefreshCw, 
  Search, 
  Globe, 
  Mail, 
  Lock, 
  Unlock, 
  Trash2, 
  ChevronRight,
  UserCheck,
  CheckCircle2,
  Copy,
  Check
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from '@/components/ui/dialog';

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
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'hoppers' | 'exhausted' | 'pro'>('all');
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  
  // Selected device for modal inspection & management
  const [selectedDevice, setSelectedDevice] = useState<any | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Real-time listener for devices & users collections
  useEffect(() => {
    if (!firestore) return;
    setLoading(true);

    const unsubDevices = onSnapshot(collection(firestore, 'devices'), (snapshot) => {
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

    const unsubUsers = onSnapshot(collection(firestore, 'users'), (snapshot) => {
      const uList = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setUsers(uList);
    }, (err) => {
      console.error('Failed to load users for device matching:', err);
    });

    return () => {
      unsubDevices();
      unsubUsers();
    };
  }, [firestore]);

  // Helper to cross-reference and discover all emails tied to a device
  const getDeviceEmails = (dev: DeviceRecord): string[] => {
    const emailSet = new Set<string>();

    if (dev.primaryEmail && dev.primaryEmail.trim()) {
      emailSet.add(dev.primaryEmail.toLowerCase().trim());
    }
    if (Array.isArray(dev.registeredEmails)) {
      dev.registeredEmails.forEach((e) => {
        if (e && typeof e === 'string' && e.trim()) {
          emailSet.add(e.toLowerCase().trim());
        }
      });
    }

    // Cross-reference with all users from users collection
    users.forEach((u) => {
      if (!u.email) return;
      const cleanEmail = u.email.toLowerCase().trim();

      const matchesDeviceId = 
        u.deviceId === dev.id || 
        u.deviceId === dev.deviceId ||
        (u.deviceId && dev.id && (u.deviceId.includes(dev.id) || dev.id.includes(u.deviceId)));

      const matchesUid = 
        u.id === dev.primaryUid || 
        (Array.isArray(dev.registeredUids) && dev.registeredUids.includes(u.id));

      const matchesIp = u.ip && dev.ip && u.ip === dev.ip;

      if (matchesDeviceId || matchesUid || matchesIp) {
        emailSet.add(cleanEmail);
      }
    });

    return Array.from(emailSet);
  };

  // Enriched devices with real resolved emails
  const enrichedDevices = useMemo(() => {
    return devices.map((dev) => {
      const allEmails = getDeviceEmails(dev);
      return {
        ...dev,
        resolvedEmails: allEmails,
        isHopper: allEmails.length > 1,
      };
    });
  }, [devices, users]);

  // Automatic backfill: persist discovered emails onto device docs in Firestore
  useEffect(() => {
    if (!firestore || enrichedDevices.length === 0 || users.length === 0) return;

    enrichedDevices.forEach(async (dev) => {
      if (dev.resolvedEmails.length > 0) {
        const storedEmails = Array.isArray(dev.registeredEmails) ? dev.registeredEmails : [];
        const hasMissing = dev.resolvedEmails.some((e) => !storedEmails.includes(e));
        if (hasMissing) {
          try {
            await updateDoc(doc(firestore, 'devices', dev.id), {
              registeredEmails: dev.resolvedEmails,
              primaryEmail: dev.primaryEmail || dev.resolvedEmails[0],
            });
          } catch {}
        }
      }
    });
  }, [enrichedDevices, firestore, users]);

  // Derived metrics
  const stats = useMemo(() => {
    const totalDevices = enrichedDevices.length;
    const multiAccountDevices = enrichedDevices.filter((d) => d.isHopper);
    const trialExhaustedDevices = enrichedDevices.filter((d) => {
      const isPro = d.hasPro === true || d.isPro === true;
      return !isPro && (d.trialExceeded === true || (d.sessionCount || 0) >= 3 || (d.usedMinutes || 0) >= 30);
    });
    const proDevices = enrichedDevices.filter((d) => d.hasPro === true || d.isPro === true);

    return {
      totalDevices,
      multiAccountCount: multiAccountDevices.length,
      trialExhaustedCount: trialExhaustedDevices.length,
      proCount: proDevices.length,
    };
  }, [enrichedDevices]);

  // Filtered devices
  const filteredDevices = useMemo(() => {
    return enrichedDevices.filter((d) => {
      // 1. Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesId = d.id?.toLowerCase().includes(q) || d.deviceId?.toLowerCase().includes(q);
        const matchesIp = d.ip?.toLowerCase().includes(q);
        const matchesPlatform = d.platform?.toLowerCase().includes(q);
        const matchesPrimary = d.primaryEmail?.toLowerCase().includes(q);
        const matchesAnyEmail = d.resolvedEmails?.some((em: string) => em.toLowerCase().includes(q));

        if (!matchesId && !matchesIp && !matchesPlatform && !matchesPrimary && !matchesAnyEmail) {
          return false;
        }
      }

      // 2. Filter mode
      const isPro = d.hasPro === true || d.isPro === true;
      const isExhausted = !isPro && (d.trialExceeded === true || (d.sessionCount || 0) >= 3 || (d.usedMinutes || 0) >= 30);
      const isHopper = d.isHopper;

      if (filterMode === 'hoppers') return isHopper;
      if (filterMode === 'exhausted') return isExhausted;
      if (filterMode === 'pro') return isPro;

      return true;
    });
  }, [enrichedDevices, searchQuery, filterMode]);

  // Actions
  const handleResetDeviceTrial = async (dev: any) => {
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

  const handleLockDevice = async (dev: any) => {
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

  const handleTogglePro = async (dev: any) => {
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

  const handleDeleteDevice = async (dev: any) => {
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

  const copyEmailToClipboard = (email: string) => {
    navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    toast({ title: 'Copied', description: `${email} copied to clipboard.` });
    setTimeout(() => setCopiedEmail(null), 2000);
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
    <div className="p-4 sm:p-6 md:p-8 w-full max-w-[1800px] mx-auto space-y-6 animate-fade-in font-jakarta">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-500/10 dark:bg-orange-500/20 rounded-2xl text-voiceflow-orange">
              <ShieldAlert size={28} />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-clash">
                Hardware Fraud Shield & Device Trial Ledger
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Permanent machine fingerprinting & multi-account evasion tracking.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (firestore) {
                setLoading(true);
                Promise.all([
                  getDocs(collection(firestore, 'devices')),
                  getDocs(collection(firestore, 'users'))
                ]).then(([dSnap, uSnap]) => {
                  setDevices(dSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
                  setUsers(uSnap.docs.map((u) => ({ id: u.id, ...(u.data() as any) })));
                  setLoading(false);
                  toast({ title: 'Ledger Refreshed', description: 'Updated device and user bindings.' });
                });
              }
            }}
            className="gap-2"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh Ledger
          </Button>
        </div>
      </div>

      {/* Metrics Row - Styled cleanly with Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border border-border/80 shadow-xs hover:shadow-sm transition-all bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Unique Machines
            </CardTitle>
            <div className="p-2 bg-blue-500/10 rounded-xl text-blue-600 dark:text-blue-400">
              <Laptop size={18} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black tracking-tight text-foreground font-clash">
              {stats.totalDevices}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Identified hardware fingerprints</p>
          </CardContent>
        </Card>

        <Card className="border border-red-200/80 dark:border-red-900/40 shadow-xs hover:shadow-sm transition-all bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400 flex items-center gap-1.5">
              <AlertTriangle size={14} /> Multi-Account Hoppers
            </CardTitle>
            <div className="p-2 bg-red-500/10 rounded-xl text-red-600 dark:text-red-400">
              <ShieldAlert size={18} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black tracking-tight text-red-600 dark:text-red-400 font-clash">
              {stats.multiAccountCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Machines with 2+ Gmail accounts</p>
          </CardContent>
        </Card>

        <Card className="border border-orange-200/80 dark:border-orange-900/40 shadow-xs hover:shadow-sm transition-all bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-voiceflow-orange">
              Trials Exhausted
            </CardTitle>
            <div className="p-2 bg-orange-500/10 rounded-xl text-voiceflow-orange">
              <Lock size={18} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black tracking-tight text-voiceflow-orange font-clash">
              {stats.trialExhaustedCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Hit 30m / 3s limit (locked)</p>
          </CardContent>
        </Card>

        <Card className="border border-emerald-200/80 dark:border-emerald-900/40 shadow-xs hover:shadow-sm transition-all bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Pro Machines
            </CardTitle>
            <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-600 dark:text-emerald-400">
              <Sparkles size={18} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black tracking-tight text-emerald-600 dark:text-emerald-400 font-clash">
              {stats.proCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Active paid subscriptions</p>
          </CardContent>
        </Card>
      </div>

      {/* Multi-Account Hoppers Radar Callout Card */}
      {stats.multiAccountCount > 0 && (
        <Card className="border border-red-500/30 bg-gradient-to-r from-red-500/10 via-orange-500/5 to-transparent shadow-xs">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-1.5">
              <AlertTriangle className="text-red-600 dark:text-red-400 shrink-0" size={18} />
              <h3 className="text-sm font-bold text-red-900 dark:text-red-300">
                Multi-Account Evasion Radar Active ({stats.multiAccountCount} laptops flagged)
              </h3>
            </div>
            <p className="text-xs text-red-800/90 dark:text-red-300/80 mb-3 leading-relaxed">
              These physical machines attempted to create or login with multiple Gmail accounts to bypass the 30-minute / 3-session free trial limit. Our hardware fingerprinting automatically enforces the limit across all subsequent accounts on these machines.
            </p>
            <div className="flex flex-wrap gap-2">
              {enrichedDevices
                .filter((d) => d.isHopper)
                .slice(0, 6)
                .map((d) => (
                  <div
                    key={d.id}
                    onClick={() => {
                      setSelectedDevice(d);
                      setIsDetailOpen(true);
                    }}
                    className="cursor-pointer bg-card hover:bg-muted/80 border border-red-200 dark:border-red-800/50 px-3 py-1.5 rounded-xl text-xs flex items-center gap-2 shadow-xs transition-all"
                  >
                    <Laptop size={13} className="text-red-500" />
                    <span className="font-mono font-bold text-[11px] text-foreground">
                      {d.id.slice(0, 16)}...
                    </span>
                    <Badge variant="destructive" className="text-[10px] py-0 px-1.5 font-bold">
                      {d.resolvedEmails?.length} emails
                    </Badge>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Ledger Card */}
      <Card className="border border-border/80 shadow-xs bg-card overflow-hidden">
        <CardHeader className="p-4 sm:p-5 border-b border-border/60 bg-muted/20">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                type="text"
                placeholder="Search by device ID, IP, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs bg-background"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <Button
                variant={filterMode === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterMode('all')}
                className="h-8 text-xs font-semibold px-3"
              >
                All ({enrichedDevices.length})
              </Button>
              <Button
                variant={filterMode === 'hoppers' ? 'destructive' : 'outline'}
                size="sm"
                onClick={() => setFilterMode('hoppers')}
                className="h-8 text-xs font-semibold px-3 gap-1.5"
              >
                <AlertTriangle size={12} /> Hoppers ({stats.multiAccountCount})
              </Button>
              <Button
                variant={filterMode === 'exhausted' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterMode('exhausted')}
                className={`h-8 text-xs font-semibold px-3 gap-1.5 ${filterMode === 'exhausted' ? 'bg-voiceflow-orange hover:bg-orange-600 text-white' : ''}`}
              >
                <Lock size={12} /> Limit Reached ({stats.trialExhaustedCount})
              </Button>
              <Button
                variant={filterMode === 'pro' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterMode('pro')}
                className={`h-8 text-xs font-semibold px-3 gap-1.5 ${filterMode === 'pro' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
              >
                <Sparkles size={12} /> Pro ({stats.proCount})
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-16 text-center text-muted-foreground">
              <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-voiceflow-orange" />
              Loading hardware ledger & user bindings...
            </div>
          ) : filteredDevices.length === 0 ? (
            <div className="p-16 text-center text-muted-foreground">
              <Laptop size={32} className="mx-auto mb-2 opacity-50" />
              <p className="font-semibold text-foreground">No matching devices found</p>
              <p className="text-xs text-muted-foreground mt-1">Try modifying your search or filter query.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-muted/40 border-b border-border text-muted-foreground text-[11px] font-bold uppercase tracking-wider">
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
                <tbody className="divide-y divide-border/60 text-xs">
                  {filteredDevices.map((dev) => {
                    const isPro = dev.hasPro === true || dev.isPro === true;
                    const isExhausted = !isPro && (dev.trialExceeded === true || (dev.sessionCount || 0) >= 3 || (dev.usedMinutes || 0) >= 30);
                    const isHopper = dev.isHopper;
                    const sessions = dev.sessionCount || 0;
                    const mins = dev.usedMinutes || 0;
                    const emails = dev.resolvedEmails || [];

                    return (
                      <tr 
                        key={dev.id} 
                        className={`hover:bg-muted/30 transition-colors ${
                          isHopper ? 'bg-red-500/[0.03]' : ''
                        }`}
                      >
                        {/* Device & Hardware ID */}
                        <td className="p-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className={`p-2 rounded-xl shrink-0 ${
                              isPro ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                              isHopper ? 'bg-red-500/10 text-red-600 dark:text-red-400' :
                              'bg-muted text-muted-foreground'
                            }`}>
                              <Laptop size={17} />
                            </div>
                            <div>
                              <div className="font-mono font-bold text-foreground flex items-center gap-1.5">
                                {dev.id.startsWith('hw_') ? (
                                  <>
                                    <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                                      MachineGuid
                                    </Badge>
                                    <span>{dev.id.replace('hw_', '').slice(0, 16)}...</span>
                                  </>
                                ) : (
                                  <span>{dev.id.slice(0, 18)}...</span>
                                )}
                              </div>
                              <div className="text-[10px] text-muted-foreground font-sans mt-0.5 truncate max-w-[180px]">
                                First seen: {formatDate(dev.firstSeen)}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* IP & Platform */}
                        <td className="p-3.5">
                          <div className="flex items-center gap-1.5 text-foreground font-medium">
                            <Globe size={13} className="text-muted-foreground shrink-0" />
                            <span className="font-mono text-[11px]">{dev.ip || 'Unknown'}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {dev.platform || 'Desktop App'}
                          </div>
                        </td>

                        {/* Registered Emails - Live Resolved */}
                        <td className="p-3.5">
                          <div className="space-y-1 max-w-[280px]">
                            {emails.length > 0 ? (
                              emails.map((email: string, idx: number) => {
                                const isCopied = copiedEmail === email;
                                return (
                                  <div 
                                    key={idx} 
                                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-medium mr-1.5 mb-1 group transition-colors ${
                                      idx === 0 
                                        ? 'bg-muted text-foreground border border-border/80' 
                                        : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-800/40'
                                    }`}
                                  >
                                    <Mail size={11} className="shrink-0 opacity-70" />
                                    <span className="truncate max-w-[180px] font-mono">{email}</span>
                                    <button
                                      type="button"
                                      onClick={() => copyEmailToClipboard(email)}
                                      title="Copy email"
                                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                                    >
                                      {isCopied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                                    </button>
                                    {idx > 0 && (
                                      <span className="text-[9px] font-bold text-red-600 dark:text-red-400 uppercase tracking-tight">
                                        (Hopper)
                                      </span>
                                    )}
                                  </div>
                                );
                              })
                            ) : (
                              <span className="text-muted-foreground italic text-[11px]">No account recorded</span>
                            )}
                          </div>
                        </td>

                        {/* Usage */}
                        <td className="p-3.5">
                          <div className="font-semibold text-foreground">
                            {sessions}/3 sessions • {mins}/30 mins
                          </div>
                          <div className="w-24 bg-muted h-1.5 rounded-full mt-1.5 overflow-hidden">
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
                            <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/30 gap-1 text-[11px]">
                              <Sparkles size={11} /> Pro Active
                            </Badge>
                          ) : isExhausted ? (
                            <Badge variant="destructive" className="gap-1 text-[11px]">
                              <Lock size={11} /> Limit Reached
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1 text-[11px] text-blue-600 dark:text-blue-400 border-blue-500/30">
                              <Unlock size={11} /> Trial Active
                            </Badge>
                          )}
                        </td>

                        {/* Last Active */}
                        <td className="p-3.5 text-muted-foreground whitespace-nowrap">
                          {formatDate(dev.lastSeen)}
                        </td>

                        {/* Actions */}
                        <td className="p-3.5 text-right whitespace-nowrap">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedDevice(dev);
                              setIsDetailOpen(true);
                            }}
                            className="h-8 text-xs font-semibold gap-1 text-voiceflow-orange hover:text-voiceflow-orange border-orange-200/80 dark:border-orange-500/30"
                          >
                            Inspect & Manage
                            <ChevronRight size={13} />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Inspect & Manage Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-xl bg-card border border-border">
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
            <div className="space-y-4 py-2 font-jakarta">
              {/* ID & Hardware */}
              <div className="p-3.5 bg-muted/40 rounded-xl space-y-2 text-xs border border-border/60">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Device ID / GUID:</span>
                  <span className="font-mono font-bold text-foreground select-all">
                    {selectedDevice.id}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Public IP:</span>
                  <span className="font-mono text-foreground select-all">
                    {selectedDevice.ip || 'Unknown'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Platform / OS:</span>
                  <span className="text-foreground">
                    {selectedDevice.platform || 'Desktop App'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">First Identified:</span>
                  <span className="text-foreground">
                    {formatDate(selectedDevice.firstSeen)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Last Active Heartbeat:</span>
                  <span className="text-foreground">
                    {formatDate(selectedDevice.lastSeen)}
                  </span>
                </div>
              </div>

              {/* Linked Accounts */}
              <div className="border border-border rounded-xl p-3.5 bg-card">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Mail size={14} className="text-voiceflow-orange" />
                    Linked Accounts on this Laptop ({selectedDevice.resolvedEmails?.length || 0})
                  </span>
                  {selectedDevice.isHopper && (
                    <Badge variant="destructive" className="text-[10px] py-0 px-2 font-bold">
                      Multi-Account Evasion Detected
                    </Badge>
                  )}
                </div>

                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  {selectedDevice.resolvedEmails && selectedDevice.resolvedEmails.length > 0 ? (
                    selectedDevice.resolvedEmails.map((em: string, idx: number) => (
                      <div 
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/40 text-xs border border-border/50"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            idx === 0 ? 'bg-orange-100 text-voiceflow-orange dark:bg-orange-950 dark:text-orange-300' : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                          }`}>
                            {idx + 1}
                          </span>
                          <span className="font-mono font-medium text-foreground">{em}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-semibold">
                          {idx === 0 ? 'Primary Creator' : 'Hopper Account'}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-muted-foreground italic py-2 text-center">
                      No user accounts recorded on this machine yet.
                    </div>
                  )}
                </div>
              </div>

              {/* Usage & Trial Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-muted/40 rounded-xl border border-border/50">
                  <div className="text-[11px] text-muted-foreground">Device Session Count</div>
                  <div className="text-lg font-black text-foreground mt-0.5 font-clash">
                    {selectedDevice.sessionCount || 0} / 3 sessions
                  </div>
                </div>
                <div className="p-3 bg-muted/40 rounded-xl border border-border/50">
                  <div className="text-[11px] text-muted-foreground">Device Minutes Used</div>
                  <div className="text-lg font-black text-foreground mt-0.5 font-clash">
                    {selectedDevice.usedMinutes || 0} / 30 mins
                  </div>
                </div>
              </div>

              {/* Admin Management Actions */}
              <div className="pt-2 border-t border-border space-y-2">
                <div className="text-xs font-bold text-foreground">
                  Administrative Overrides:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionLoading}
                    onClick={() => handleResetDeviceTrial(selectedDevice)}
                    className="text-xs font-bold gap-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                  >
                    <Unlock size={14} />
                    Reset Free Trial
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionLoading}
                    onClick={() => handleLockDevice(selectedDevice)}
                    className="text-xs font-bold gap-1.5 text-voiceflow-orange hover:bg-orange-50 dark:hover:bg-orange-950/40"
                  >
                    <Lock size={14} />
                    Force Lock (Limit)
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionLoading}
                    onClick={() => handleTogglePro(selectedDevice)}
                    className="text-xs font-bold gap-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                  >
                    <Sparkles size={14} />
                    {selectedDevice.hasPro || selectedDevice.isPro ? 'Revoke Pro' : 'Grant Pro'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex justify-between items-center sm:justify-between w-full">
            {selectedDevice && (
              <Button
                variant="ghost"
                size="sm"
                disabled={actionLoading}
                onClick={() => handleDeleteDevice(selectedDevice)}
                className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 font-bold gap-1"
              >
                <Trash2 size={13} /> Delete Record
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsDetailOpen(false)}
              className="text-xs font-bold"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
