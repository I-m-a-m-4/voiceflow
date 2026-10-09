"use client";

import React, { useEffect, useState } from 'react';
import { useFirestore } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';
import type { UserProfile } from '@/types';
import { Users, Shield, Mail, Gift, Sparkles, RefreshCw } from 'lucide-react';
import { DashCreditsDialog } from '@/components/admin/dash-credits-dialog';

export default function AdminUsersPage() {
  const firestore = useFirestore();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDashOpen, setIsDashOpen] = useState(false);
  const [selectedUserEmail, setSelectedUserEmail] = useState('');

  const loadUsers = async () => {
    if (!firestore) return;
    try {
      setLoading(true);
      const snap = await getDocs(collection(firestore, 'users'));
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error('Failed to load users', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [firestore]);

  const handleOpenDash = (email: string = '') => {
    setSelectedUserEmail(email);
    setIsDashOpen(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform Users</h1>
          <p className="text-sm text-gray-500">Manage all registered accounts and dash credits/Pro access.</p>
        </div>
        <div className="flex items-center gap-3">
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
        <div className="p-12 text-center text-gray-500 bg-white rounded-xl border">Loading users...</div>
      ) : (
        <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b text-gray-700 text-xs font-semibold uppercase tracking-wider">
              <tr>
                <th className="p-3.5">User</th>
                <th className="p-3.5">Subscription Plan</th>
                <th className="p-3.5">Usage</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => {
                const isProUser = u.isPro === true || (u.planTier && u.planTier.toLowerCase().includes('pro')) || (u.subscriptionPlan && u.subscriptionPlan.toLowerCase().includes('pro'));
                const usedMins = typeof u.usedMinutes === 'number' ? u.usedMinutes : 0;
                const sessions = typeof u.sessionCount === 'number' ? u.sessionCount : 0;

                return (
                  <tr key={u.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="p-3.5">
                      <div className="font-semibold text-gray-900">{u.name || u.displayName || 'User'}</div>
                      <div className="text-xs text-gray-500">{u.email}</div>
                    </td>
                    <td className="p-3.5">
                      {isProUser ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                          <Sparkles size={11} /> Pro Active
                        </span>
                      ) : (
                        <span className="inline-flex bg-gray-100 text-gray-700 text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                          Free Tier
                        </span>
                      )}
                    </td>
                    <td className="p-3.5">
                      <div className="text-xs font-medium text-gray-800">
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
                        u.status === 'active' || !u.status ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {u.status || 'active'}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => handleOpenDash(u.email)}
                        className="inline-flex items-center gap-1.5 bg-orange-50 hover:bg-orange-100 text-voiceflow-orange border border-orange-200 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
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
      )}

      <DashCreditsDialog
        isOpen={isDashOpen}
        onClose={() => setIsDashOpen(false)}
        prefillEmail={selectedUserEmail}
        onSuccess={loadUsers}
      />
    </div>
  );
}
