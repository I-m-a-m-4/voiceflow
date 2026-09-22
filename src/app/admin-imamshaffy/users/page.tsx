"use client";

import React, { useEffect, useState } from 'react';
import { useFirestore } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';
import type { UserProfile } from '@/types';
import { Users, Shield, Mail } from 'lucide-react';

export default function AdminUsersPage() {
  const firestore = useFirestore();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUsers() {
      try {
        const snap = await getDocs(collection(firestore, 'users'));
        setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() }) as UserProfile));
      } catch (e) {
        console.error('Failed to load users', e);
      } finally {
        setLoading(false);
      }
    }
    loadUsers();
  }, [firestore]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform Users</h1>
          <p className="text-sm text-gray-500">Manage all registered accounts across Voiceflow.</p>
        </div>
        <div className="text-sm font-medium bg-orange-100 text-voiceflow-orange px-3 py-1 rounded-full">
          Total Users: {users.length}
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-500">Loading users...</div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b text-gray-700">
              <tr>
                <th className="p-3">User</th>
                <th className="p-3">Role</th>
                <th className="p-3">Status</th>
                <th className="p-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="p-3">
                    <div className="font-semibold text-gray-900">{u.name || 'Unnamed'}</div>
                    <div className="text-xs text-gray-500">{u.email}</div>
                  </td>
                  <td className="p-3 capitalize">{u.role}</td>
                  <td className="p-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
                      u.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {u.status || 'active'}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-gray-500">
                    {u.createdAt ? new Date(u.createdAt.seconds ? u.createdAt.seconds * 1000 : u.createdAt).toLocaleDateString() : 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
