"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth, useFirestore, useUser } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';
import {
  Gift,
  Sparkles,
  RefreshCw,
  Laptop,
  AlertTriangle,
  ShieldAlert,
  Globe,
  Lock,
  Search,
  UserPlus,
  Clock,
} from 'lucide-react';
import { DashCreditsDialog } from '@/components/admin/dash-credits-dialog';
import { apiBase } from '@/lib/platform';
import { useToast } from '@/hooks/use-toast';

function parseUserTimestamp(val: any): number {
  if (!val) return 0;
  if (typeof val?.toMillis === 'function') return val.toMillis();
  if (typeof val?.toDate === 'function') return val.toDate().getTime();
  if (typeof val?.seconds === 'number') return val.seconds * 1000;
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'string' || typeof val === 'number') {
    const t = new Date(val).getTime();
    return Number.isNaN(t) ? 0 : t;
  }
  return 0;
}

function formatJoined(val: any): string {
  const ms = parseUserTimestamp(val);
  if (!ms) return 'Unknown';
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function AdminUsersPage() {
  const auth = useAuth();
  const firestore = useFirestore();
  const { user: currentUser, isUserLoading } = useUser();
  const { toast } = useToast();

  const [users, setUsers] = useState<any[]>([]);
  const [deviceMap, setDeviceMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [isSyncingAuth, setIsSyncingAuth] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [planFilter, setPlanFilter] = useState<'all' | 'pro' | 'free'>('all');
  const [isDashOpen, setIsDashOpen] = useState(false);
  const [selectedUserEmail, setSelectedUserEmail] = useState('');
  const hasAutoSyncedRef = useRef(false);

  const loadData = async () => {
    if (!firestore) return;
    try {
      setLoading(true);
      const [usersSnap, devicesSnap] = await Promise.all([
        getDocs(collection(firestore, 'users')),
        getDocs(collection(firestore, 'devices')).catch(() => ({ docs: [] } as any)),
      ]);

      const loadedUsers = usersSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => parseUserTimestamp(b.createdAt) - parseUserTimestamp(a.createdAt));

      const devMap: Record<string, any> = {};
      devicesSnap.docs.forEach((d: any) => {
        const data = d.data();
        devMap[d.id] = data;
        if (Array.isArray(data.registeredEmails)) {
          data.registeredEmails.forEach((email: string) => {
            if (email) devMap[`email_${email.toLowerCase()}`] = data;
          });
        }
      });

      setUsers(loadedUsers);
      setDeviceMap(devMap);
    } catch (e) {
      console.error('Failed to load users & device records', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncAuthUsers = async (silent = false) => {
    const liveUser =
      auth?.currentUser ||
      (currentUser && typeof (currentUser as any).getIdToken === 'function' ? currentUser : null);
    if (!liveUser || isSyncingAuth) {
      if (!silent && !liveUser) {
        toast({
          variant: 'destructive',
          title: 'Still Signing In',
          description: 'Please wait a moment for Firebase Auth to finish loading, then try again.',
        });
      }
      return;
    }
    try {
      setIsSyncingAuth(true);
      const token = await liveUser.getIdToken();
      const base = apiBase();
      const endpoint = base ? `${base}/api/admin/sync-users` : '/api/admin/sync-users';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Sync failed (HTTP ${res.status})`);
      }
      if (data.backfilledCount > 0) {
        toast({
          title: `Synced ${data.backfilledCount} Missing Account${data.backfilledCount === 1 ? '' : 's'}`,
          description:
            data.newlySyncedEmails?.length > 0
              ? `Recovered from Firebase Auth: ${data.newlySyncedEmails.slice(0, 3).join(', ')}`
              : 'All Firebase Auth signups are now visible in Firestore.',
        });
        await loadData();
      } else if (!silent) {
        toast({
          title: 'All Accounts Up to Date',
          description: `Verified ${data.totalAuthUsers ?? users.length} Firebase Auth users — zero missing profiles.`,
        });
        await loadData();
      }
    } catch (err: any) {
      console.warn('Admin Firebase Auth sync failed:', err);
      if (!silent) {
        toast({
          variant: 'destructive',
          title: 'Auth Sync Failed',
          description: err?.message || 'Could not reconcile Firebase Auth users.',
        });
      }
    } finally {
      setIsSyncingAuth(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [firestore]);

  // Automatically reconcile any Firebase Auth users missing Firestore profiles once the REAL
  // Firebase Auth user (not the cached localStorage placeholder) has finished loading.
  useEffect(() => {
    if (isUserLoading) return;
    const liveUser =
      auth?.currentUser ||
      (currentUser && typeof (currentUser as any).getIdToken === 'function' ? currentUser : null);
    if (firestore && liveUser && !hasAutoSyncedRef.current) {
      hasAutoSyncedRef.current = true;
      void handleSyncAuthUsers(true);
    }
  }, [firestore, auth, currentUser, isUserLoading]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      const isProUser =
        u.isPro === true ||
        (u.planTier && String(u.planTier).toLowerCase().includes('pro')) ||
        (u.subscriptionPlan && String(u.subscriptionPlan).toLowerCase().includes('pro'));

      if (planFilter === 'pro' && !isProUser) return false;
      if (planFilter === 'free' && isProUser) return false;

      if (!q) return true;
      const name = String(u.name || u.displayName || '').toLowerCase();
      const email = String(u.email || '').toLowerCase();
      const ip = String(u.ip || '').toLowerCase();
      const uid = String(u.id || '').toLowerCase();
      return name.includes(q) || email.includes(q) || ip.includes(q) || uid.includes(q);
    });
  }, [users, searchQuery, planFilter]);

  const handleOpenDash = (email: string = '') => {
    setSelectedUserEmail(email);
    setIsDashOpen(true);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white font-clash">
            Platform Users & Account Security
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Newest signups first • Auto-reconciled with Firebase Auth, hardware binding, and Pro credits.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => void handleSyncAuthUsers(false)}
            disabled={isSyncingAuth}
            className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 dark:text-blue-300 font-bold text-xs px-3.5 py-2 rounded-xl border border-blue-200 dark:border-blue-800/50 shadow-xs transition-all disabled:opacity-60"
            title="Check Firebase Auth for any signups missing a Firestore user document and backfill them immediately"
          >
            <UserPlus size={14} className={isSyncingAuth ? 'animate-pulse' : ''} />
            {isSyncingAuth ? 'Syncing Auth...' : 'Sync Firebase Auth'}
          </button>
          <button
            onClick={() => void loadData()}
            disabled={loading}
            className="flex items-center gap-1.5 bg-white hover:bg-gray-50 text-gray-700 dark:bg-card dark:hover:bg-muted dark:text-gray-200 font-semibold text-xs px-3 py-2 rounded-xl border border-gray-200 dark:border-border transition-all"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <Link
            href="/admin-imamshaffy/devices"
            className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-950/60 dark:hover:bg-red-900/60 dark:text-red-300 font-bold text-xs px-3.5 py-2 rounded-xl border border-red-200 dark:border-red-800/50 shadow-xs transition-all"
          >
            <ShieldAlert size={14} />
            Fraud Shield
          </Link>
          <div className="text-xs font-semibold bg-orange-100 text-voiceflow-orange px-3 py-1.5 rounded-full">
            Total Users: {users.length}
          </div>
          <button
            onClick={() => handleOpenDash('')}
            className="flex items-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-md transition-all active:scale-95"
          >
            <Gift size={15} />
            Dash Credits
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, UID, or IP..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card text-gray-900 dark:text-white focus:outline-none focus:border-voiceflow-orange"
          />
        </div>
        <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-muted p-1 rounded-xl text-xs font-semibold">
          {(['all', 'pro', 'free'] as const).map((tier) => (
            <button
              key={tier}
              onClick={() => setPlanFilter(tier)}
              className={`px-3 py-1 rounded-lg capitalize transition-colors ${
                planFilter === tier
                  ? 'bg-white dark:bg-card text-voiceflow-orange shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {tier === 'all' ? `All (${users.length})` : tier}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="p-16 text-center text-gray-500 bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-border">
          <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-voiceflow-orange" />
          Loading users and hardware bindings...
        </div>
      ) : (
        <div className="border border-gray-200 dark:border-border rounded-2xl overflow-hidden bg-white dark:bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-gray-50 dark:bg-muted/40 border-b border-gray-200 dark:border-border text-gray-700 dark:text-gray-300 text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th className="p-3.5">User Profile</th>
                  <th className="p-3.5">Joined</th>
                  <th className="p-3.5">Hardware & Security</th>
                  <th className="p-3.5">Subscription Plan</th>
                  <th className="p-3.5">Usage</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-border text-xs">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-gray-500">
                      No users match your search filter.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isProUser =
                      u.isPro === true ||
                      (u.planTier && u.planTier.toLowerCase().includes('pro')) ||
                      (u.subscriptionPlan && u.subscriptionPlan.toLowerCase().includes('pro'));
                    const usedMins = typeof u.usedMinutes === 'number' ? u.usedMinutes : 0;
                    const sessions = typeof u.sessionCount === 'number' ? u.sessionCount : 0;

                    const userEmail = (u.email || '').toLowerCase();
                    const linkedDevice =
                      u.deviceId && deviceMap[u.deviceId]
                        ? deviceMap[u.deviceId]
                        : deviceMap[`email_${userEmail}`] || null;

                    const deviceAccounts = linkedDevice?.registeredEmails || [];
                    const isMultiAccount = deviceAccounts.length > 1;
                    const isDeviceLocked = linkedDevice?.trialExceeded || (linkedDevice?.sessionCount || 0) >= 3;

                    return (
                      <tr
                        key={u.id}
                        className={`hover:bg-gray-50/80 dark:hover:bg-muted/30 transition-colors ${
                          isMultiAccount ? 'bg-red-500/5' : ''
                        }`}
                      >
                        <td className="p-3.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-gray-900 dark:text-white">
                              {u.name || u.displayName || 'User'}
                            </span>
                            {u.authProvider && (
                              <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-muted text-gray-500 dark:text-gray-300">
                                {u.authProvider}
                              </span>
                            )}
                            {u.syncedFromAuth && (
                              <span
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                                title="Recovered from Firebase Auth"
                              >
                                Auth Synced
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">{u.email}</div>
                        </td>

                        <td className="p-3.5 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                          <div className="flex items-center gap-1 text-[11px]">
                            <Clock size={11} className="text-gray-400" />
                            <span>{formatJoined(u.createdAt)}</span>
                          </div>
                        </td>

                        <td className="p-3.5">
                          {linkedDevice ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 font-mono text-[11px] text-gray-800 dark:text-gray-200">
                                <Laptop size={13} className="text-gray-400 shrink-0" />
                                <span className="truncate max-w-[130px]">
                                  {linkedDevice.deviceId ? linkedDevice.deviceId.slice(0, 14) + '...' : 'Bound'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                                <Globe size={11} className="shrink-0" />
                                <span>{linkedDevice.ip || u.ip || 'Unknown IP'}</span>
                              </div>
                              {isMultiAccount ? (
                                <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 font-bold text-[10px] border border-red-200 dark:border-red-800">
                                  <AlertTriangle size={10} />
                                  {deviceAccounts.length} accounts on machine
                                </div>
                              ) : isDeviceLocked && !isProUser ? (
                                <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-orange-100 text-voiceflow-orange dark:bg-orange-950 dark:text-orange-300 font-bold text-[10px]">
                                  <Lock size={10} /> Device Limit Reached
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="text-gray-400 text-[11px] italic">
                              {u.ip ? `IP: ${u.ip}` : 'No hardware record yet'}
                            </div>
                          )}
                        </td>

                        <td className="p-3.5">
                          {isProUser ? (
                            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                              <Sparkles size={11} /> Pro Active
                            </span>
                          ) : (
                            <span className="inline-flex bg-gray-100 text-gray-700 dark:bg-muted dark:text-gray-300 text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                              Free Tier
                            </span>
                          )}
                        </td>

                        <td className="p-3.5">
                          <div className="text-xs font-medium text-gray-800 dark:text-gray-200">
                            {usedMins} mins / {sessions} sessions
                          </div>
                          {u.bonusMinutesGranted && (
                            <div className="text-[10px] text-emerald-600 font-bold">
                              +{u.bonusMinutesGranted} mins gifted
                            </div>
                          )}
                        </td>

                        <td className="p-3.5">
                          <span
                            className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
                              u.status === 'active' || !u.status
                                ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                                : 'bg-gray-100 text-gray-800 dark:bg-muted dark:text-gray-300'
                            }`}
                          >
                            {u.status || 'active'}
                          </span>
                        </td>

                        <td className="p-3.5 text-right">
                          <button
                            onClick={() => handleOpenDash(u.email)}
                            className="inline-flex items-center gap-1.5 bg-orange-50 hover:bg-orange-100 text-voiceflow-orange border border-orange-200 dark:bg-orange-500/10 dark:hover:bg-orange-500/20 dark:border-orange-500/30 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <Gift size={13} />
                            Dash Credit
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DashCreditsDialog
        isOpen={isDashOpen}
        onClose={() => setIsDashOpen(false)}
        prefillEmail={selectedUserEmail}
        onSuccess={loadData}
      />
    </div>
  );
}
