"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Gift, Sparkles, Clock, RotateCcw, Loader2, User, ShieldOff, History, CheckCircle2 } from 'lucide-react';
import { useAuth, useFirestore } from '@/firebase';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { apiBase } from '@/lib/platform';

interface DashCreditsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  prefillEmail?: string;
  onSuccess?: () => void;
}

interface DashHistoryItem {
  id: string;
  recipientEmail: string;
  dashType: string;
  minutesAmount?: number | null;
  note?: string;
  resolutionMode?: string;
  createdAt?: any;
}

export function DashCreditsDialog({ isOpen, onClose, prefillEmail = '', onSuccess }: DashCreditsDialogProps) {
  const auth = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [targetEmail, setTargetEmail] = useState(prefillEmail);
  const [dashType, setDashType] = useState<'pro' | 'minutes' | 'reset' | 'revoke'>('pro');
  const [minutesAmount, setMinutesAmount] = useState<number>(300);
  const [customNote, setCustomNote] = useState('Gifted by Admin (Bello Imam)');
  const [isLoading, setIsLoading] = useState(false);
  const [recentDashes, setRecentDashes] = useState<DashHistoryItem[]>([]);
  const [knownEmails, setKnownEmails] = useState<Array<{ email: string; name: string; isPro: boolean }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (prefillEmail) {
      setTargetEmail(prefillEmail);
    }
  }, [prefillEmail]);

  useEffect(() => {
    if (!isOpen || !firestore) return;
    let cancelled = false;

    Promise.all([
      getDocs(query(collection(firestore, 'admin_dashes'), orderBy('createdAt', 'desc'), limit(6))).catch(() => null),
      getDocs(collection(firestore, 'users')).catch(() => null),
    ]).then(([dashesSnap, usersSnap]) => {
      if (cancelled) return;
      if (dashesSnap) {
        setRecentDashes(dashesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      }
      if (usersSnap) {
        const list = usersSnap.docs
          .map((d) => {
            const data = d.data() as any;
            return {
              email: String(data.email || '').trim(),
              name: String(data.name || data.displayName || '').trim(),
              isPro: Boolean(data.isPro || String(data.planTier || '').toLowerCase().includes('pro')),
            };
          })
          .filter((u) => u.email.includes('@'));
        setKnownEmails(list);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, firestore]);

  const matchingSuggestions = useMemo(() => {
    const q = targetEmail.trim().toLowerCase();
    if (!q || !showSuggestions) return [];
    return knownEmails
      .filter((u) => u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q))
      .slice(0, 5);
  }, [knownEmails, targetEmail, showSuggestions]);

  const handleDashCredits = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = targetEmail.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      toast({
        variant: 'destructive',
        title: 'Invalid Email',
        description: 'Please enter a valid recipient email address to dash credits.',
      });
      return;
    }

    if (!auth?.currentUser) {
      toast({
        variant: 'destructive',
        title: 'Not Authenticated',
        description: 'Please sign in as Super Admin to dash credits.',
      });
      return;
    }

    setIsLoading(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const base = apiBase();
      const endpoint = base ? `${base}/api/admin/dash-credits` : '/api/admin/dash-credits';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: cleanEmail,
          dashType,
          minutesAmount: dashType === 'minutes' ? minutesAmount : undefined,
          note: customNote,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `Failed to dash credits (HTTP ${res.status})`);
      }

      const modeHint =
        data.resolutionMode === 'backfilled_auth_user'
          ? ' (Synced their Firebase Auth account into Firestore automatically!)'
          : data.resolutionMode === 'pre_granted_pending'
            ? ' (Pre-granted — activates automatically when they sign up!)'
            : data.devicesUnblocked > 0
              ? ` (${data.devicesUnblocked} device lock${data.devicesUnblocked === 1 ? '' : 's'} cleared!)`
              : '';

      const titleMap: Record<typeof dashType, string> = {
        pro: 'Pro Plan Dashed!',
        minutes: `+${minutesAmount} Minutes Dashed!`,
        reset: 'Usage Limits Reset!',
        revoke: 'Pro Access Revoked',
      };

      toast({
        title: titleMap[dashType],
        description: `Applied to ${cleanEmail}${modeHint}`,
      });

      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Failed to dash credits:', err);
      toast({
        variant: 'destructive',
        title: 'Failed to dash credits',
        description: err?.message || 'Please check your connection and try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[540px] bg-white dark:bg-[#141414] text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-800 p-0 overflow-hidden shadow-2xl">
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-5 text-white">
          <div className="flex items-center gap-2 mb-1">
            <Gift size={22} className="text-white" />
            <DialogTitle className="text-lg font-bold text-white">Dash People Credit</DialogTitle>
          </div>
          <DialogDescription className="text-white/90 text-xs">
            Server-verified Admin tool: Gifts Pro, bonus minutes, or resets limits across Auth, Firestore, Workspace &amp; Hardware locks.
          </DialogDescription>
        </div>

        <form onSubmit={handleDashCredits} className="p-5 space-y-4 max-h-[78vh] overflow-y-auto">
          <div className="relative">
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1.5 uppercase tracking-wider">
              Recipient Email Address
            </label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                required
                value={targetEmail}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
                onChange={(e) => {
                  setTargetEmail(e.target.value);
                  setShowSuggestions(true);
                }}
                placeholder="Search user or type any email (e.g. friend@gmail.com)"
                className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 dark:bg-[#1E1E1E] border border-gray-200 dark:border-gray-800 rounded-xl text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-voiceflow-orange/50 focus:border-voiceflow-orange"
              />
            </div>

            {matchingSuggestions.length > 0 && (
              <div className="absolute z-30 mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1f] shadow-xl overflow-hidden">
                {matchingSuggestions.map((u) => (
                  <button
                    key={u.email}
                    type="button"
                    onMouseDown={() => {
                      setTargetEmail(u.email);
                      setShowSuggestions(false);
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-orange-50 dark:hover:bg-white/10 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 dark:text-white truncate">{u.name || u.email}</div>
                      <div className="text-[11px] text-gray-500 truncate">{u.email}</div>
                    </div>
                    {u.isPro && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 shrink-0">
                        Pro
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-gray-400 mt-1">
              Works case-insensitively across Firebase Auth, Firestore, or even before the user signs up.
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1.5 uppercase tracking-wider">
              Action
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setDashType('pro')}
                className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                  dashType === 'pro'
                    ? 'border-voiceflow-orange bg-orange-50 dark:bg-orange-500/10 text-voiceflow-orange font-bold shadow-sm'
                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <Sparkles size={16} className="mb-1.5 text-voiceflow-orange" />
                <div>
                  <div className="text-xs font-bold">Pro Plan</div>
                  <div className="text-[10px] text-gray-400 font-normal">Unlimited Pro</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDashType('minutes')}
                className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                  dashType === 'minutes'
                    ? 'border-voiceflow-orange bg-orange-50 dark:bg-orange-500/10 text-voiceflow-orange font-bold shadow-sm'
                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <Clock size={16} className="mb-1.5 text-blue-500" />
                <div>
                  <div className="text-xs font-bold">Minutes</div>
                  <div className="text-[10px] text-gray-400 font-normal">Add Bonus Mins</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDashType('reset')}
                className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                  dashType === 'reset'
                    ? 'border-voiceflow-orange bg-orange-50 dark:bg-orange-500/10 text-voiceflow-orange font-bold shadow-sm'
                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <RotateCcw size={16} className="mb-1.5 text-emerald-500" />
                <div>
                  <div className="text-xs font-bold">Reset</div>
                  <div className="text-[10px] text-gray-400 font-normal">Zero Counters</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDashType('revoke')}
                className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                  dashType === 'revoke'
                    ? 'border-red-500 bg-red-50 dark:bg-red-500/10 text-red-600 font-bold shadow-sm'
                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <ShieldOff size={16} className="mb-1.5 text-red-500" />
                <div>
                  <div className="text-xs font-bold">Revoke Pro</div>
                  <div className="text-[10px] text-gray-400 font-normal">Back to Free</div>
                </div>
              </button>
            </div>
          </div>

          {dashType === 'minutes' && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block uppercase tracking-wider">
                Bonus Minutes Allowance
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[60, 180, 300, 1000].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setMinutesAmount(mins)}
                    className={`py-2 text-xs rounded-lg border font-semibold transition-all ${
                      minutesAmount === mins
                        ? 'border-voiceflow-orange bg-orange-50 dark:bg-orange-500/10 text-voiceflow-orange'
                        : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    +{mins}m
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-500 whitespace-nowrap">Custom mins:</span>
                <input
                  type="number"
                  min={1}
                  max={100000}
                  value={minutesAmount}
                  onChange={(e) => setMinutesAmount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-28 px-2.5 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#1E1E1E]"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1 uppercase tracking-wider">
              Note (Optional)
            </label>
            <input
              type="text"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="e.g. Gifted for beta tester / friend"
              className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-[#1E1E1E] border border-gray-200 dark:border-gray-800 rounded-xl text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-voiceflow-orange"
            />
          </div>

          {recentDashes.length > 0 && (
            <div className="pt-2 border-t border-gray-200 dark:border-gray-800 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <History size={11} /> Recent Admin Dashes
              </div>
              <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                {recentDashes.slice(0, 4).map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between text-[11px] px-2.5 py-1 rounded-lg bg-gray-50 dark:bg-white/5"
                  >
                    <span className="truncate font-medium text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
                      <CheckCircle2 size={11} className="text-emerald-500 shrink-0" />
                      {d.recipientEmail}
                    </span>
                    <span className="font-mono text-[10px] text-voiceflow-orange font-bold shrink-0 ml-2">
                      {d.dashType === 'minutes' ? `+${d.minutesAmount}m` : d.dashType.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className={`font-bold text-xs px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50 text-white ${
                dashType === 'revoke'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-voiceflow-orange hover:bg-orange-600'
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Applying...
                </>
              ) : (
                <>
                  <Gift size={14} /> {dashType === 'revoke' ? 'Revoke Pro' : 'Dash Credits Now'}
                </>
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
