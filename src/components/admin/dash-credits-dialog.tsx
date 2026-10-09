"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Gift, Sparkles, Clock, RotateCcw, Check, Loader2, User, Search } from 'lucide-react';
import { useAuth, useFirestore } from '@/firebase';
import { collection, query, where, getDocs, updateDoc, doc, addDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

interface DashCreditsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  prefillEmail?: string;
  onSuccess?: () => void;
}

export function DashCreditsDialog({ isOpen, onClose, prefillEmail = '', onSuccess }: DashCreditsDialogProps) {
  const auth = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [targetEmail, setTargetEmail] = useState(prefillEmail);
  const [dashType, setDashType] = useState<'pro' | 'minutes' | 'reset'>('pro');
  const [minutesAmount, setMinutesAmount] = useState<number>(300);
  const [customNote, setCustomNote] = useState('Gifted by Admin (Bello Imam)');
  const [isLoading, setIsLoading] = useState(false);

  React.useEffect(() => {
    if (prefillEmail) {
      setTargetEmail(prefillEmail);
    }
  }, [prefillEmail]);

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

    if (!firestore || !auth?.currentUser) {
      toast({
        variant: 'destructive',
        title: 'Network Error',
        description: 'Database connection unavailable.',
      });
      return;
    }

    setIsLoading(true);
    try {
      // Find the user by email in the users collection
      const usersRef = collection(firestore, 'users');
      const q = query(usersRef, where('email', '==', cleanEmail));
      const querySnap = await getDocs(q);

      let targetDocId = '';
      let existingData: any = null;

      if (!querySnap.empty) {
        const foundDoc = querySnap.docs[0];
        targetDocId = foundDoc.id;
        existingData = foundDoc.data();
      }

      const adminEmail = auth.currentUser.email || 'belloimam431@gmail.com';

      if (dashType === 'pro') {
        const payload = {
          isPro: true,
          planTier: 'pro',
          subscriptionPlan: 'Voiceflow Pro (Gifted by Admin)',
          dashedBy: adminEmail,
          dashedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        if (targetDocId) {
          await updateDoc(doc(firestore, 'users', targetDocId), payload);
        } else {
          // Pre-grant for user before they even log in
          const newDocRef = doc(usersRef);
          await setDoc(newDocRef, {
            email: cleanEmail,
            ...payload,
            createdAt: serverTimestamp(),
          });
        }

        toast({
          title: '🎉 Pro Plan Dashed!',
          description: `Successfully gifted lifetime Voiceflow Pro to ${cleanEmail}. They now have unlimited recording and features.`,
        });
      } else if (dashType === 'minutes') {
        const currentUsed = typeof existingData?.usedMinutes === 'number' ? existingData.usedMinutes : 0;
        const newUsed = Math.max(0, currentUsed - minutesAmount);

        const payload = {
          usedMinutes: newUsed,
          bonusMinutesGranted: (existingData?.bonusMinutesGranted || 0) + minutesAmount,
          dashedBy: adminEmail,
          dashedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        if (targetDocId) {
          await updateDoc(doc(firestore, 'users', targetDocId), payload);
        } else {
          const newDocRef = doc(usersRef);
          await setDoc(newDocRef, {
            email: cleanEmail,
            ...payload,
            createdAt: serverTimestamp(),
          });
        }

        toast({
          title: '⏱️ Minutes Dashed!',
          description: `Dashed +${minutesAmount} minutes to ${cleanEmail}. Their usage has been credited.`,
        });
      } else if (dashType === 'reset') {
        const payload = {
          usedMinutes: 0,
          sessionCount: 0,
          dashedBy: adminEmail,
          dashedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        if (targetDocId) {
          await updateDoc(doc(firestore, 'users', targetDocId), payload);
        } else {
          const newDocRef = doc(usersRef);
          await setDoc(newDocRef, {
            email: cleanEmail,
            ...payload,
            createdAt: serverTimestamp(),
          });
        }

        toast({
          title: '🔄 Usage Reset & Dashed!',
          description: `All session and minute counters reset to 0 for ${cleanEmail}.`,
        });
      }

      // Record in audit log
      await addDoc(collection(firestore, 'admin_dashes'), {
        adminEmail,
        recipientEmail: cleanEmail,
        dashType,
        minutesAmount: dashType === 'minutes' ? minutesAmount : null,
        note: customNote,
        createdAt: serverTimestamp(),
      });

      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Failed to dash credits:', err);
      toast({
        variant: 'destructive',
        title: 'Failed to dash credits',
        description: err.message || 'Please check your connection.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-white dark:bg-[#141414] text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-800 p-0 overflow-hidden shadow-2xl">
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-6 text-white">
          <div className="flex items-center gap-2 mb-1">
            <Gift size={24} className="text-white" />
            <DialogTitle className="text-xl font-bold text-white">Dash People Credit</DialogTitle>
          </div>
          <DialogDescription className="text-white/90 text-xs">
            Founder & Admin Privilege: Gift free Pro subscriptions, bonus minutes, or reset usage for any user.
          </DialogDescription>
        </div>

        <form onSubmit={handleDashCredits} className="p-6 space-y-5">
          <div>
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1.5 uppercase tracking-wider">
              Recipient Email Address
            </label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                required
                value={targetEmail}
                onChange={(e) => setTargetEmail(e.target.value)}
                placeholder="friend@example.com"
                className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 dark:bg-[#1E1E1E] border border-gray-200 dark:border-gray-800 rounded-xl text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-voiceflow-orange/50 focus:border-voiceflow-orange"
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Works even if they haven't signed up yet; it activates automatically on login.</p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1.5 uppercase tracking-wider">
              What do you want to dash them?
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setDashType('pro')}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                  dashType === 'pro'
                    ? 'border-voiceflow-orange bg-orange-50 dark:bg-orange-500/10 text-voiceflow-orange font-bold shadow-sm'
                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <Sparkles size={18} className="mb-2 text-voiceflow-orange" />
                <div>
                  <div className="text-xs font-bold">Pro Plan</div>
                  <div className="text-[10px] text-gray-400 font-normal">Full Lifetime Pro</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDashType('minutes')}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                  dashType === 'minutes'
                    ? 'border-voiceflow-orange bg-orange-50 dark:bg-orange-500/10 text-voiceflow-orange font-bold shadow-sm'
                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <Clock size={18} className="mb-2 text-blue-500" />
                <div>
                  <div className="text-xs font-bold">Minutes</div>
                  <div className="text-[10px] text-gray-400 font-normal">Add Free Mins</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDashType('reset')}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                  dashType === 'reset'
                    ? 'border-voiceflow-orange bg-orange-50 dark:bg-orange-500/10 text-voiceflow-orange font-bold shadow-sm'
                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <RotateCcw size={18} className="mb-2 text-emerald-500" />
                <div>
                  <div className="text-xs font-bold">Reset Limit</div>
                  <div className="text-[10px] text-gray-400 font-normal">Fresh 30 mins</div>
                </div>
              </button>
            </div>
          </div>

          {dashType === 'minutes' && (
            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1.5 uppercase tracking-wider">
                Select Minute Allowance
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[60, 120, 300, 1000].map((mins) => (
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
                    +{mins} mins
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1.5 uppercase tracking-wider">
              Note (Optional)
            </label>
            <input
              type="text"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="e.g. Gifted for friend / test team"
              className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-[#1E1E1E] border border-gray-200 dark:border-gray-800 rounded-xl text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-voiceflow-orange"
            />
          </div>

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
              className="bg-voiceflow-orange hover:bg-orange-600 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Dashing Credits...
                </>
              ) : (
                <>
                  <Gift size={14} /> Dash Credits Now
                </>
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
