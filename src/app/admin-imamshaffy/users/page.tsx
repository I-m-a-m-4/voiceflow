"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useFirestore } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';
import type { UserProfile } from '@/types';
import { 
  Users, 
  Shield, 
  Mail, 
  Gift, 
  Sparkles, 
  RefreshCw, 
  Laptop, 
  AlertTriangle, 
  ShieldAlert, 
  Globe, 
  Lock 
} from 'lucide-react';
import { DashCreditsDialog } from '@/components/admin/dash-credits-dialog';

export default function AdminUsersPage() {
  const firestore = useFirestore();
  const [users, setUsers] = useState<any[]>([]);
  const [deviceMap, setDeviceMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [isDashOpen, setIsDashOpen] = useState(false);
  const [selectedUserEmail, setSelectedUserEmail] = useState('');

  const loadData = async () => {
    if (!firestore) return;
    try {
      setLoading(true);
      const [usersSnap, devicesSnap] = await Promise.all([
        getDocs(collection(firestore, 'users')),
        getDocs(collection(firestore, 'devices')).catch(() => ({ docs: [] } as any)),
      ]);

      const loadedUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const devMap: Record<string, any> = {};

      devicesSnap.docs.forEach((d: any) => {
        const data = d.data();
        devMap[d.id] = data;
        // Also index by registered email for fast reverse lookup
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

  useEffect(() => {
    loadData();
  }, [firestore]);

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
            Manage all registered accounts, hardware binding, and dash credits/Pro access.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin-imamshaffy/devices"
            className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-950/60 dark:hover:bg-red-900/60 dark:text-red-300 font-bold text-xs px-3.5 py-2 rounded-xl border border-red-200 dark:border-red-800/50 shadow-xs transition-all"
          >
            <ShieldAlert size={14} />
            Hardware Fraud Shield
          </Link>
          <div className="text-xs font-semibold bg-orange-100 text-voiceflow-orange px-3 py-1.5 rounded-full">
            Total Users: {users.length}
          </div>
          <button
            onClick={() => handleOpenDash('')}
            className="flex items-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-md transition-all active:scale-95"
          >
            <Gift size={15} />
            Dash Credits by Email
          </button>
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
              <thead className="bg-gray-50 border-b border-gray-200 dark:border-border text-gray-700 dark:text-gray-300 text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th className="p-3.5">User Profile</th>
                  <th className="p-3.5">Hardware & Security</th>
                  <th className="p-3.5">Subscription Plan</th>
                  <th className="p-3.5">Usage</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-border text-xs">
                {users.map((u) => {
                  const isProUser = u.isPro === true || (u.planTier && u.planTier.toLowerCase().includes('pro')) || (u.subscriptionPlan && u.subscriptionPlan.toLowerCase().includes('pro'));
                  const usedMins = typeof u.usedMinutes === 'number' ? u.usedMinutes : 0;
                  const sessions = typeof u.sessionCount === 'number' ? u.sessionCount : 0;

                  // Find linked device
                  const userEmail = (u.email || '').toLowerCase();
                  const linkedDevice = (u.deviceId && deviceMap[u.deviceId]) 
                    ? deviceMap[u.deviceId] 
                    : (deviceMap[`email_${userEmail}`] || null);

                  const deviceAccounts = linkedDevice?.registeredEmails || [];
                  const isMultiAccount = deviceAccounts.length > 1;
                  const isDeviceLocked = linkedDevice?.trialExceeded || (linkedDevice?.sessionCount || 0) >= 3;

                  return (
                    <tr key={u.id} className={`hover:bg-gray-50/80 dark:hover:bg-muted/30 transition-colors ${
                      isMultiAccount ? 'bg-red-500/5' : ''
                    }`}>
                      <td className="p-3.5">
                        <div className="font-semibold text-gray-900 dark:text-white">{u.name || u.displayName || 'User'}</div>
                        <div className="text-xs text-gray-500">{u.email}</div>
                      </td>

                      {/* Hardware & Security */}
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
                        <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
                          u.status === 'active' || !u.status ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' : 'bg-gray-100 text-gray-800 dark:bg-muted dark:text-gray-300'
                        }`}>
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
                })}
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
