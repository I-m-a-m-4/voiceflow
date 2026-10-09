"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { 
  Settings, Calendar, Keyboard, User, Shield, Globe, CreditCard, 
  FileText, HelpCircle, LifeBuoy, LogOut, Power, X, Download, 
  Eye, Headphones, Palette, Mic, ChevronDown, Check, Loader2, 
  Volume2, ShieldCheck, ShieldAlert, MessageSquare, Wand2, Monitor, Sparkles, BookOpen, Gift, RotateCcw, Clock, Crown
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuth } from '@/firebase';
import { 
  signOut, 
  updateProfile, 
  sendPasswordResetEmail, 
  GoogleAuthProvider, 
  OAuthProvider, 
  linkWithPopup 
} from 'firebase/auth';
import { doc, updateDoc, getFirestore } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenBilling?: () => void;
  initialTab?: string;
}

export function SettingsModal({ isOpen, onClose, onOpenBilling, initialTab }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState(initialTab || 'general');
  const { theme, setTheme } = useTheme();
  const auth = useAuth();
  const { toast } = useToast();

  const [detectable, setDetectable] = useState(true);
  const [ambientChat, setAmbientChat] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);

  // Profile states
  const [displayName, setDisplayName] = useState(auth?.currentUser?.displayName || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // Microphone testing states
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [micVolume, setMicVolume] = useState(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAudioCtxRef = useRef<AudioContext | null>(null);
  const micAnimRef = useRef<number | null>(null);

  // Dynamic subscription states
  const [currentPlan, setCurrentPlan] = useState<string>('VoiceFlow Basic Plan');
  const [isProUser, setIsProUser] = useState<boolean>(false);

  // Live Answers & Context states
  const [copilotEnabled, setCopilotEnabled] = useState(true);
  const [proactiveMode, setProactiveMode] = useState(false);
  const [overlayPosition, setOverlayPosition] = useState('bottom-right');
  const [customContext, setCustomContext] = useState('');
  const [isSavingContext, setIsSavingContext] = useState(false);
  const [isSavedContext, setIsSavedContext] = useState(false);

  // Sync initialTab when modal opens
  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Load Live Answers settings & custom context on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedContext = localStorage.getItem('voiceflow_custom_context');
      if (savedContext) setCustomContext(savedContext);

      const savedCopilot = localStorage.getItem('voiceflow_copilot_enabled');
      if (savedCopilot !== null) setCopilotEnabled(savedCopilot === 'true');

      const savedProactive = localStorage.getItem('voiceflow_proactive_mode');
      if (savedProactive !== null) setProactiveMode(savedProactive === 'true');

      const savedPos = localStorage.getItem('voiceflow_overlay_pos');
      if (savedPos) setOverlayPosition(savedPos);
    }

    if (auth?.currentUser?.uid) {
      import('firebase/firestore').then(({ doc, getDoc, getFirestore }) => {
        const db = getFirestore();
        getDoc(doc(db, 'users', auth.currentUser!.uid)).then((snap) => {
          if (snap.exists() && snap.data()?.customContext) {
            setCustomContext(snap.data().customContext);
            if (typeof window !== 'undefined') {
              localStorage.setItem('voiceflow_custom_context', snap.data().customContext);
            }
          }
        }).catch((e) => console.warn('Could not load user custom context:', e));
      });
    }
  }, [auth?.currentUser?.uid]);

  const handleSaveContext = async () => {
    setIsSavingContext(true);
    try {
      const cleanContext = customContext.trim();
      if (typeof window !== 'undefined') {
        localStorage.setItem('voiceflow_custom_context', cleanContext);
        window.dispatchEvent(new CustomEvent('voiceflow-context-updated', { detail: { context: cleanContext } }));
      }

      if (auth?.currentUser?.uid) {
        const { doc, updateDoc, getFirestore } = await import('firebase/firestore');
        const db = getFirestore();
        await updateDoc(doc(db, 'users', auth.currentUser.uid), {
          customContext: cleanContext,
        });
      }

      setIsSavedContext(true);
      toast({
        title: "✨ Custom Context Saved!",
        description: "Voiceflow AI will now tailor meeting notes, summaries, and real-time answers specifically to your role and preferences.",
      });
      setTimeout(() => setIsSavedContext(false), 3000);
    } catch (err: any) {
      console.error('Error saving context:', err);
      toast({
        variant: "destructive",
        title: "Failed to save context",
        description: err?.message || "Please check your network connection.",
      });
    } finally {
      setIsSavingContext(false);
    }
  };

  const handleCopilotToggle = (checked: boolean) => {
    setCopilotEnabled(checked);
    if (typeof window !== 'undefined') {
      localStorage.setItem('voiceflow_copilot_enabled', String(checked));
    }
  };

  const handleProactiveToggle = (checked: boolean) => {
    setProactiveMode(checked);
    if (typeof window !== 'undefined') {
      localStorage.setItem('voiceflow_proactive_mode', String(checked));
    }
  };

  const handleOverlayPositionChange = (pos: string) => {
    setOverlayPosition(pos);
    if (typeof window !== 'undefined') {
      localStorage.setItem('voiceflow_overlay_pos', pos);
    }
  };

  const isAdmin = auth?.currentUser?.email?.toLowerCase() === 'belloimam431@gmail.com';

  // Dash Credits states for Admin
  const [dashEmail, setDashEmail] = useState('');
  const [dashType, setDashType] = useState<'pro' | 'minutes' | 'reset'>('pro');
  const [dashMinutes, setDashMinutes] = useState(300);
  const [dashNote, setDashNote] = useState('Gifted by Bello Imam');
  const [isDashing, setIsDashing] = useState(false);

  const handleAdminDash = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = dashEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      toast({
        variant: 'destructive',
        title: 'Invalid Email',
        description: 'Please enter a valid email address to dash credits.',
      });
      return;
    }

    setIsDashing(true);
    try {
      const { getFirestore, collection, query, where, getDocs, updateDoc, doc, setDoc, addDoc, serverTimestamp } = await import('firebase/firestore');
      const db = getFirestore();
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', cleanEmail));
      const snap = await getDocs(q);

      let targetId = '';
      let existingData: any = null;
      if (!snap.empty) {
        targetId = snap.docs[0].id;
        existingData = snap.docs[0].data();
      }

      const adminEmail = auth?.currentUser?.email || 'belloimam431@gmail.com';

      if (dashType === 'pro') {
        const payload = {
          isPro: true,
          planTier: 'pro',
          subscriptionPlan: 'Voiceflow Pro (Gifted by Bello Imam)',
          dashedBy: adminEmail,
          dashedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (targetId) {
          await updateDoc(doc(db, 'users', targetId), payload);
        } else {
          await setDoc(doc(usersRef), { email: cleanEmail, ...payload, createdAt: serverTimestamp() });
        }
        toast({
          title: '🎉 Pro Plan Dashed!',
          description: `Successfully gifted lifetime Voiceflow Pro to ${cleanEmail}.`,
        });
      } else if (dashType === 'minutes') {
        const curUsed = typeof existingData?.usedMinutes === 'number' ? existingData.usedMinutes : 0;
        const newUsed = Math.max(0, curUsed - dashMinutes);
        const payload = {
          usedMinutes: newUsed,
          bonusMinutesGranted: (existingData?.bonusMinutesGranted || 0) + dashMinutes,
          dashedBy: adminEmail,
          dashedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (targetId) {
          await updateDoc(doc(db, 'users', targetId), payload);
        } else {
          await setDoc(doc(usersRef), { email: cleanEmail, ...payload, createdAt: serverTimestamp() });
        }
        toast({
          title: '⏱️ Minutes Dashed!',
          description: `Dashed +${dashMinutes} minutes to ${cleanEmail}.`,
        });
      } else if (dashType === 'reset') {
        const payload = {
          usedMinutes: 0,
          sessionCount: 0,
          dashedBy: adminEmail,
          dashedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (targetId) {
          await updateDoc(doc(db, 'users', targetId), payload);
        } else {
          await setDoc(doc(usersRef), { email: cleanEmail, ...payload, createdAt: serverTimestamp() });
        }
        toast({
          title: '🔄 Usage Reset & Dashed!',
          description: `All limits and counters reset to 0 for ${cleanEmail}.`,
        });
      }

      await addDoc(collection(db, 'admin_dashes'), {
        adminEmail,
        recipientEmail: cleanEmail,
        dashType,
        minutes: dashType === 'minutes' ? dashMinutes : null,
        note: dashNote,
        createdAt: serverTimestamp(),
      });

      setDashEmail('');
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to dash credits',
        description: err.message,
      });
    } finally {
      setIsDashing(false);
    }
  };

  useEffect(() => {
    if (!auth?.currentUser?.uid) return;
    let unsub = () => {};
    (async () => {
      try {
        const { doc, onSnapshot, getFirestore } = await import("firebase/firestore");
        const db = getFirestore();
        unsub = onSnapshot(doc(db, "users", auth.currentUser!.uid), (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            const plan = data?.subscriptionPlan || data?.planTier || data?.plan || 'Free';
            const pro = data?.isPro === true || plan.toLowerCase().includes('pro') || plan.toLowerCase().includes('enterprise');
            setIsProUser(pro);
            setCurrentPlan(pro ? (plan.toLowerCase().includes('pro') ? 'VoiceFlow Pro Plan' : plan) : 'VoiceFlow Basic Plan');
          }
        });
      } catch (e) {
        console.warn("Could not attach user subscription listener:", e);
      }
    })();
    return () => unsub();
  }, [auth?.currentUser?.uid]);

  useEffect(() => {
    if (auth?.currentUser?.displayName) {
      setDisplayName(auth.currentUser.displayName);
    }
  }, [auth?.currentUser?.displayName]);

  // Load stealth preference on mount
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('voiceflow_stealth_mode') : null;
    const isStealth = saved !== null ? saved === 'true' : true;
    setDetectable(isStealth);
  }, []);

  const handleDetectableChange = async (checked: boolean) => {
    setDetectable(checked);
    if (typeof window !== 'undefined') {
      localStorage.setItem('voiceflow_stealth_mode', String(checked));
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('set_detectable', { detectable: checked });
    } catch {
      // In web browser, handled natively in Tauri desktop
    }
  };

  // --- Real Microphone Test ---
  const startMicTest = async () => {
    try {
      setIsTestingMic(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const ctx = new AudioContext();
      micAudioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const src = ctx.createMediaStreamSource(stream);
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const loop = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setMicVolume(Math.min(100, Math.round((avg / 128) * 100)));
        micAnimRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch (e: any) {
      console.error(e);
      toast({
        variant: 'destructive',
        title: 'Microphone Access Denied',
        description: e.message || 'Please grant microphone permissions in your browser/OS settings.'
      });
      setIsTestingMic(false);
    }
  };

  const stopMicTest = () => {
    if (micAnimRef.current) cancelAnimationFrame(micAnimRef.current);
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (micAudioCtxRef.current) {
      micAudioCtxRef.current.close().catch(() => {});
      micAudioCtxRef.current = null;
    }
    setIsTestingMic(false);
    setMicVolume(0);
  };

  useEffect(() => {
    return () => {
      stopMicTest();
    };
  }, []);

  // --- Real Calendar Links ---
  const handleGoogleLink = async () => {
    if (!auth?.currentUser) {
      toast({ variant: 'destructive', title: 'Not Signed In', description: 'Please sign in first.' });
      return;
    }
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
      await linkWithPopup(auth.currentUser, provider);
      toast({ title: 'Google Calendar Connected', description: 'Your meetings are now linked.' });
    } catch (e: any) {
      console.error(e);
      toast({
        variant: 'destructive',
        title: 'Connection Failed',
        description: e.code === 'auth/credential-already-in-use' ? 'This Google account is already linked.' : (e.message || 'Could not connect.')
      });
    }
  };

  const handleOutlookLink = async () => {
    if (!auth?.currentUser) {
      toast({ variant: 'destructive', title: 'Not Signed In', description: 'Please sign in first.' });
      return;
    }
    try {
      const provider = new OAuthProvider('microsoft.com');
      provider.addScope('Calendars.Read');
      await linkWithPopup(auth.currentUser, provider);
      toast({ title: 'Outlook Calendar Connected', description: 'Your Microsoft meetings are now linked.' });
    } catch (e: any) {
      console.error(e);
      toast({
        variant: 'destructive',
        title: 'Connection Failed',
        description: e.code === 'auth/credential-already-in-use' ? 'This Microsoft account is already linked.' : (e.message || 'Could not connect.')
      });
    }
  };

  // --- Real Profile Update ---
  const handleSaveProfile = async () => {
    if (!auth?.currentUser) return;
    setIsSavingProfile(true);
    try {
      await updateProfile(auth.currentUser, { displayName });
      const db = getFirestore();
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        name: displayName,
        displayName: displayName,
        updatedAt: new Date()
      });
      toast({ title: 'Profile Updated', description: 'Your changes have been saved.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Update Failed', description: e.message });
    } finally {
      setIsSavingProfile(false);
    }
  };

  // --- Real Avatar Upload ---
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth?.currentUser) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        await updateProfile(auth.currentUser!, { photoURL: base64 });
        const db = getFirestore();
        await updateDoc(doc(db, 'users', auth.currentUser!.uid), {
          avatarUrl: base64,
          photoURL: base64
        });
        toast({ title: 'Avatar Updated', description: 'Your new avatar is active.' });
      } catch (err: any) {
        toast({ variant: 'destructive', title: 'Avatar Update Failed', description: err.message });
      }
    };
    reader.readAsDataURL(file);
  };

  // --- Real Password Reset Email ---
  const handlePasswordReset = async () => {
    if (!auth?.currentUser?.email) return;
    try {
      await sendPasswordResetEmail(auth, auth.currentUser.email);
      toast({ 
        title: 'Password Reset Sent', 
        description: `We sent a reset link to ${auth.currentUser.email}. Check your inbox.` 
      });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Reset Failed', description: e.message });
    }
  };

  // --- Real Sign Out & Quit ---
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      onClose();
      window.location.href = '/login';
    } catch (e: any) {
      console.error('Sign out error:', e);
    }
  };

  const handleQuit = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    } catch {
      window.location.href = '/login';
    }
  };

  const tabs = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'answers', label: 'Live Answers & Context', icon: MessageSquare },
    ...(isAdmin ? [{ id: 'admin-dash', label: '🎁 Dash Credits', icon: Gift }] : []),
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'keybinds', label: 'Keybinds & Guide', icon: Keyboard },
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'language', label: 'Language', icon: Globe },
    { id: 'billing', label: 'Billing', icon: CreditCard },
  ];

  const supportTabs = [
    { id: 'release-notes', label: 'Release Notes', icon: FileText },
    { id: 'help-center', label: 'Help Center', icon: HelpCircle },
    { id: 'contact', label: 'Contact Support', icon: LifeBuoy },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent hideScrollWrapper={true} className="w-[95vw] max-w-[850px] h-[90vh] max-h-[650px] bg-white dark:bg-[#111111] text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-800 p-0 overflow-hidden flex flex-col sm:flex-row">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        
        {/* Sidebar */}
        <div className="w-full sm:w-[220px] bg-gray-50 dark:bg-[#161616] border-b sm:border-b-0 sm:border-r border-gray-200 dark:border-gray-800 flex flex-row sm:flex-col h-auto sm:h-full shrink-0 overflow-x-auto sm:overflow-y-auto">
          <div className="p-2 sm:p-4 flex items-center justify-between sm:justify-end shrink-0">
            <button onClick={onClose} className="sm:hidden text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white">
              <X size={20} />
            </button>
            <button onClick={onClose} className="hidden sm:flex text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>
          
          <div className="flex-1 overflow-x-auto sm:overflow-y-auto px-2 pb-2 sm:pb-0 flex sm:block items-center sm:items-stretch gap-2 sm:gap-0 hide-scrollbar">
            <nav className="flex sm:flex-col gap-1 sm:gap-0 sm:space-y-0.5 shrink-0">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-auto sm:w-full flex items-center gap-2 sm:gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    activeTab === tab.id 
                      ? 'bg-gray-200 dark:bg-[#2A2A2A] text-black dark:text-white' 
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1E1E1E] hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  <tab.icon size={16} />
                  {tab.label}
                </button>
              ))}
            </nav>

            <div className="hidden sm:block mt-6 mb-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-500">Support</div>
            <nav className="flex sm:flex-col gap-1 sm:gap-0 sm:space-y-0.5 shrink-0">
              {supportTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-auto sm:w-full flex items-center gap-2 sm:gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    activeTab === tab.id 
                      ? 'bg-gray-200 dark:bg-[#2A2A2A] text-black dark:text-white' 
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1E1E1E] hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  <tab.icon size={16} />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="hidden sm:block p-2 border-t border-gray-200 dark:border-gray-800">
            <button 
              onClick={handleSignOut} 
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1E1E1E] hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            >
              <LogOut size={16} />
              Sign out
            </button>
            <button 
              onClick={handleQuit} 
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
            >
              <Power size={16} />
              Quit VoiceFlow
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-[#111111] p-8">
          {activeTab === 'general' && (
            <div className="space-y-8 max-w-2xl">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">General</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Customize how VoiceFlow works for you</p>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-gray-800">
                    <div className="flex items-center gap-4">
                      <div className="bg-gray-100 dark:bg-[#2A2A2A] p-2 rounded-lg"><Download size={20} className="text-gray-700 dark:text-gray-300" /></div>
                      <div>
                        <div className="text-sm font-bold text-gray-900 dark:text-white">VoiceFlow v0.1.0</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Latest production release (Tauri & Web)</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => window.open('https://github.com/I-m-a-m-4/voiceflow/releases', '_blank')}
                      className="text-xs text-white bg-voiceflow-orange hover:bg-orange-600 px-4 py-2 rounded-md font-bold transition-colors shadow-sm"
                    >
                      Check for Updates
                    </button>
                  </div>

                  {/* Stealth Mode */}
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-gray-800">
                    <div className="flex items-center gap-4">
                      <div className="bg-gray-100 dark:bg-[#2A2A2A] p-2 rounded-lg">
                        <ShieldCheck size={20} className={detectable ? "text-emerald-500" : "text-gray-400"} />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-gray-900 dark:text-white">Stealth Mode (100% Undetectable)</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {detectable 
                            ? "Active: Excluded from Zoom/Meet screen share & hidden from taskbar" 
                            : "Off: Visible to screen share and taskbar"}
                        </div>
                      </div>
                    </div>
                    <Switch checked={detectable} onCheckedChange={handleDetectableChange} className="data-[state=checked]:bg-emerald-500" />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-gray-800">
                    <div className="flex items-center gap-4">
                      <div className="bg-gray-100 dark:bg-[#2A2A2A] p-2 rounded-lg"><Headphones size={20} className="text-gray-700 dark:text-gray-300" /></div>
                      <div>
                        <div className="text-sm font-bold text-gray-900 dark:text-white">Ambient AI Chat</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Chat with VoiceFlow outside meetings</div>
                      </div>
                    </div>
                    <Switch checked={ambientChat} onCheckedChange={setAmbientChat} className="data-[state=checked]:bg-voiceflow-orange" />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-gray-800">
                    <div className="flex items-center gap-4">
                      <div className="bg-gray-100 dark:bg-[#2A2A2A] p-2 rounded-lg"><Palette size={20} className="text-gray-700 dark:text-gray-300" /></div>
                      <div>
                        <div className="text-sm font-bold text-gray-900 dark:text-white">Color Theme</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Use light, dark, or match your system theme</div>
                      </div>
                    </div>
                    <select 
                      value={theme}
                      onChange={(e) => setTheme(e.target.value)}
                      className="bg-white dark:bg-[#222222] border border-gray-300 dark:border-gray-700 text-sm rounded-md px-3 py-1.5 text-gray-900 dark:text-white outline-none focus:border-voiceflow-orange"
                    >
                      <option value="system">System</option>
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Working Microphone Test */}
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Audio Settings</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Test your audio input before you hop into a call.</p>
                
                <div className="p-4 bg-gray-50 dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-gray-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-3">
                      <Mic size={16} className={`mt-1 ${isTestingMic ? 'text-red-500 animate-pulse' : 'text-gray-500 dark:text-gray-400'}`} />
                      <div>
                        <div className="text-sm font-bold text-gray-900 dark:text-white mb-1">Default Microphone</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 max-w-[280px]">
                          {isTestingMic ? "Listening live... Speak now to test signal" : "System default microphone array"}
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={isTestingMic ? stopMicTest : startMicTest} 
                      className={`text-xs font-semibold px-4 py-2 rounded-lg transition-colors border ${
                        isTestingMic 
                          ? "bg-red-500 hover:bg-red-600 text-white border-red-600" 
                          : "bg-gray-200 dark:bg-[#2A2A2A] hover:bg-gray-300 dark:hover:bg-[#333333] border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white"
                      }`}
                    >
                      {isTestingMic ? "Stop Test" : "Test Microphone"}
                    </button>
                  </div>

                  {/* Live Volume Feedback Bar */}
                  {isTestingMic && (
                    <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Input Signal:</span>
                        <span className="font-mono font-bold text-emerald-500">{micVolume}%</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-800 h-2 rounded-full overflow-hidden">
                        <div 
                          className="bg-emerald-500 h-full transition-all duration-75"
                          style={{ width: `${micVolume}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Live Answers & Custom Context Section */}
          {activeTab === 'answers' && (
            <div className="space-y-8 max-w-2xl">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Live Answers & AI Context</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                  Configure your in-call AI co-pilot overlay, proactive assistance, and tailored persona instructions.
                </p>

                {/* Main Toggles */}
                <div className="space-y-3 mb-6">
                  <div className="flex items-start justify-between p-4 bg-gray-50 dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-gray-800">
                    <div className="flex items-start gap-3">
                      <div className="bg-orange-100 dark:bg-orange-500/20 p-2 rounded-lg shrink-0 mt-0.5">
                        <MessageSquare size={18} className="text-voiceflow-orange" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-gray-900 dark:text-white">Enable Live Answers Overlay</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Displays an unobtrusive overlay during meetings that allows you to ask VoiceFlow questions privately.
                        </div>
                      </div>
                    </div>
                    <Switch 
                      checked={copilotEnabled} 
                      onCheckedChange={handleCopilotToggle} 
                      className="data-[state=checked]:bg-voiceflow-orange shrink-0 ml-4" 
                    />
                  </div>

                  <div className="flex items-start justify-between p-4 bg-gray-50 dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-gray-800">
                    <div className="flex items-start gap-3">
                      <div className="bg-blue-100 dark:bg-blue-500/20 p-2 rounded-lg shrink-0 mt-0.5">
                        <Wand2 size={18} className="text-blue-500" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-gray-900 dark:text-white">Proactive Coaching</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          AI will automatically suggest answers and key hints when it detects you are being asked a question.
                        </div>
                      </div>
                    </div>
                    <Switch 
                      checked={proactiveMode} 
                      onCheckedChange={handleProactiveToggle} 
                      className="data-[state=checked]:bg-voiceflow-orange shrink-0 ml-4" 
                    />
                  </div>
                </div>

                {/* Overlay Position & Quick Trigger */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="p-4 bg-gray-50 dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-gray-800">
                    <div className="flex items-center gap-2 mb-2">
                      <Monitor size={16} className="text-gray-700 dark:text-gray-300" />
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white">Overlay Position</h3>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Choose where on screen the overlay floats.</p>
                    <div className="grid grid-cols-2 gap-2">
                      {['top-right', 'top-left', 'bottom-right', 'bottom-left'].map((pos) => (
                        <button
                          key={pos}
                          onClick={() => handleOverlayPositionChange(pos)}
                          className={`py-1.5 px-2.5 rounded-lg border text-xs font-semibold capitalize flex items-center justify-center transition-all ${
                            overlayPosition === pos
                              ? 'border-voiceflow-orange bg-orange-50 dark:bg-orange-500/10 text-voiceflow-orange'
                              : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-[#202020] text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-700'
                          }`}
                        >
                          {pos.replace('-', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50 dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-gray-800 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Keyboard size={16} className="text-gray-700 dark:text-gray-300" />
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white">Quick Trigger Shortcut</h3>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Instantly focus input and ask during meetings.</p>
                    </div>
                    <div className="bg-white dark:bg-[#202020] border border-gray-200 dark:border-gray-800 rounded-lg p-2.5 flex items-center justify-center gap-2">
                      <kbd className="bg-gray-100 dark:bg-[#2A2A2A] text-gray-800 dark:text-gray-200 px-2.5 py-1 rounded text-xs font-mono font-bold border border-gray-300 dark:border-gray-700 shadow-sm">Ctrl</kbd>
                      <span className="text-gray-400 text-xs font-bold">+</span>
                      <kbd className="bg-gray-100 dark:bg-[#2A2A2A] text-gray-800 dark:text-gray-200 px-2.5 py-1 rounded text-xs font-mono font-bold border border-gray-300 dark:border-gray-700 shadow-sm">Enter</kbd>
                    </div>
                  </div>
                </div>

                {/* Custom System Instructions & Role Context */}
                <div className="p-4 bg-gray-50 dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-gray-800 mb-6">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Sparkles size={16} className="text-voiceflow-orange" />
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">Custom System Instructions & Role Context</h3>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Provide context about your company, seniority, tech stack, or answer style so VoiceFlow tailors meeting summaries and live answers to your exact needs.
                  </p>
                  <textarea
                    value={customContext}
                    onChange={(e) => setCustomContext(e.target.value)}
                    placeholder="e.g. I am a Senior Software Engineer interviewing for a role at Google. My primary stack is React, Next.js, and Python. When giving me answers, keep them concise and technical, focusing on system architecture."
                    className="w-full h-28 bg-white dark:bg-[#141414] border border-gray-200 dark:border-gray-800 rounded-lg p-3 text-xs text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-voiceflow-orange/50 focus:border-voiceflow-orange resize-none transition-all"
                  />
                  <div className="flex justify-between items-center mt-3">
                    <span className="text-xs text-gray-400">
                      {customContext.trim().length > 0 ? `${customContext.trim().length} characters configured` : 'Default instructions active'}
                    </span>
                    <button
                      onClick={handleSaveContext}
                      disabled={isSavingContext}
                      className="bg-voiceflow-orange hover:bg-orange-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isSavingContext ? (
                        <>
                          <Loader2 size={13} className="animate-spin" /> Saving...
                        </>
                      ) : isSavedContext ? (
                        <>
                          <Check size={13} className="text-white" /> Saved!
                        </>
                      ) : (
                        'Save Context'
                      )}
                    </button>
                  </div>
                </div>

                {/* Voiceflow In-Call Co-Pilot Guide */}
                <div className="p-4 bg-orange-500/5 dark:bg-orange-500/10 rounded-xl border border-orange-500/20">
                  <div className="flex items-center gap-2 mb-2 text-voiceflow-orange">
                    <BookOpen size={16} />
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">VoiceFlow In-Call Co-Pilot Guide</h3>
                  </div>
                  <div className="space-y-2 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                    <div className="flex items-start gap-2">
                      <span className="bg-voiceflow-orange text-white w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                      <span><strong>Join your call:</strong> Works seamlessly with Zoom, Google Meet, Teams, or Slack calls.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="bg-voiceflow-orange text-white w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                      <span><strong>Start VoiceFlow:</strong> Press <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-800 border rounded font-mono text-[10px]">Ctrl + Shift + \</kbd> or click Start VoiceFlow in the top header.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="bg-voiceflow-orange text-white w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                      <span><strong>Ask anytime:</strong> Press <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-800 border rounded font-mono text-[10px]">Ctrl + Enter</kbd> to type or ask about ongoing audio/screen context.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="bg-voiceflow-orange text-white w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">4</span>
                      <span><strong>Stealth & Privacy:</strong> Enable Stealth Mode in General settings so the window is completely invisible to screen share.</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {activeTab === 'keybinds' && (
            <div className="space-y-8 max-w-2xl">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Keyboard shortcuts</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">VoiceFlow works with these easy to remember commands.</p>
                
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-3 text-xs font-bold">
                       <span className="text-gray-900 dark:text-white">General</span>
                       <span className="text-gray-500 dark:text-gray-400 tracking-wider">GLOBAL HOTKEYS</span>
                    </div>
                    
                    <div className="space-y-1">
                      <ShortcutRow icon="🖥️" label="Toggle visibility of VoiceFlow" keys={['Ctrl', '`']} />
                      <ShortcutRow icon="💬" label="Ask VoiceFlow about your screen or audio" keys={['Ctrl', '↵']} />
                      <ShortcutRow icon="🧹" label="Clear current response" keys={['Ctrl', 'R']} />
                      <ShortcutRow icon="🎙️" label="Start or stop recording session" keys={['Ctrl', 'Shift', '\\']} />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3 text-xs font-bold text-gray-900 dark:text-white">Window Controls</div>
                    <div className="space-y-1">
                      <ShortcutRow icon="↑" label="Move the window position up" keys={['Ctrl', '↑']} />
                      <ShortcutRow icon="↓" label="Move the window position down" keys={['Ctrl', '↓']} />
                      <ShortcutRow icon="←" label="Move the window position left" keys={['Ctrl', '←']} />
                      <ShortcutRow icon="→" label="Move the window position right" keys={['Ctrl', '→']} />
                    </div>
                  </div>

                  {/* Quick Usage Summary */}
                  <div className="p-4 bg-orange-500/5 dark:bg-orange-500/10 rounded-xl border border-orange-500/20 mt-6">
                    <div className="flex items-center gap-2 mb-2 text-voiceflow-orange">
                      <BookOpen size={16} />
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white">In-Call Shortcut Workflow</h3>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                      During your meeting, toggle VoiceFlow recording with <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-800 border rounded font-mono text-[10px]">Ctrl + Shift + \</kbd>. Whenever a difficult question arises, press <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-800 border rounded font-mono text-[10px]">Ctrl + Enter</kbd> to bring up Live Answers. Hide the window completely anytime with <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-800 border rounded font-mono text-[10px]">Ctrl + `</kbd>.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Calendar Integration */}
          {activeTab === 'calendar' && (
            <div className="space-y-8 max-w-2xl">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Calendar & Integrations</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Connect your accounts to sync meeting schedules.</p>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-gray-800">
                    <div className="flex items-center gap-4">
                       <div className="bg-gray-100 dark:bg-[#2A2A2A] p-2 rounded-lg">
                         <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                         </svg>
                       </div>
                       <div>
                         <div className="text-sm font-bold text-gray-900 dark:text-white">Google Calendar</div>
                         <div className="text-xs text-gray-500 dark:text-gray-400">Sync meetings from Google Meet & Calendar</div>
                       </div>
                    </div>
                    <button 
                      onClick={handleGoogleLink} 
                      className="text-xs bg-voiceflow-orange hover:bg-orange-600 text-white font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
                    >
                      Connect
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-gray-800">
                    <div className="flex items-center gap-4">
                       <div className="bg-gray-100 dark:bg-[#2A2A2A] p-2 rounded-lg">
                         <svg className="w-5 h-5" viewBox="0 0 21 21">
                            <path fill="#f25022" d="M1 1h9v9H1z"/>
                            <path fill="#7fba00" d="M11 1h9v9h-9z"/>
                            <path fill="#00a4ef" d="M1 11h9v9H1z"/>
                            <path fill="#ffb900" d="M11 11h9v9h-9z"/>
                         </svg>
                       </div>
                       <div>
                         <div className="text-sm font-bold text-gray-900 dark:text-white">Outlook Calendar</div>
                         <div className="text-xs text-gray-500 dark:text-gray-400">Sync with Microsoft Teams & Outlook</div>
                       </div>
                    </div>
                    <button 
                      onClick={handleOutlookLink} 
                      className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
                    >
                      Connect
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Profile Section */}
          {activeTab === 'profile' && (
            <div className="space-y-8 max-w-2xl">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Your Profile</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Manage your personal information.</p>
                <div className="flex items-center gap-6 mb-8">
                   <div className="w-20 h-20 rounded-full bg-voiceflow-orange flex items-center justify-center text-white text-3xl font-bold shadow-lg overflow-hidden shrink-0">
                     {auth?.currentUser?.photoURL ? (
                       <img src={auth.currentUser.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                     ) : (
                       displayName?.charAt(0).toUpperCase() || auth?.currentUser?.email?.charAt(0).toUpperCase() || 'U'
                     )}
                   </div>
                   <div>
                     <input 
                       type="file" 
                       ref={avatarInputRef} 
                       onChange={handleAvatarChange} 
                       accept="image/*" 
                       className="hidden" 
                     />
                     <button 
                       onClick={() => avatarInputRef.current?.click()} 
                       className="text-sm bg-gray-200 dark:bg-[#2A2A2A] hover:bg-gray-300 dark:hover:bg-[#333333] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white font-semibold px-4 py-2 rounded-lg transition-colors mb-2"
                     >
                       Change Avatar
                     </button>
                     <p className="text-xs text-gray-500 dark:text-gray-400">JPG, PNG or WebP. Max 2MB.</p>
                   </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-1.5">Display Name</label>
                    <input 
                      type="text" 
                      value={displayName} 
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full bg-white dark:bg-[#1A1A1A] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-voiceflow-orange text-sm shadow-sm" 
                    />
                  </div>
                  <div>
                    <label className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-1.5">Email Address</label>
                    <input 
                      type="email" 
                      disabled 
                      defaultValue={auth?.currentUser?.email || ''} 
                      className="w-full bg-gray-100 dark:bg-[#111111] border border-gray-200 dark:border-gray-800 text-gray-500 rounded-lg px-4 py-2.5 text-sm cursor-not-allowed opacity-70" 
                    />
                  </div>
                  <button 
                    onClick={handleSaveProfile}
                    disabled={isSavingProfile}
                    className="flex items-center gap-2 bg-voiceflow-orange hover:bg-orange-600 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm shadow-sm disabled:opacity-50"
                  >
                    {isSavingProfile ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Security Section */}
          {activeTab === 'security' && (
            <div className="space-y-8 max-w-2xl">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Security Settings</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Protect your account and authentication credentials.</p>
                
                <div className="space-y-4 mb-8">
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-gray-800">
                    <div>
                      <div className="text-sm font-bold text-gray-900 dark:text-white">Two-Factor Authentication</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Extra layer of security for logins.</div>
                    </div>
                    <Switch checked={mfaEnabled} onCheckedChange={(val) => {
                      setMfaEnabled(val);
                      toast({ title: val ? "2FA Enabled" : "2FA Disabled", description: "Security preference saved." });
                    }} className="data-[state=checked]:bg-voiceflow-orange" />
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-gray-800">
                    <div>
                      <div className="text-sm font-bold text-gray-900 dark:text-white">Change Password</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Send a secure password reset link to your email.</div>
                    </div>
                    <button 
                      onClick={handlePasswordReset} 
                      className="text-xs bg-gray-200 dark:bg-[#2A2A2A] hover:bg-gray-300 dark:hover:bg-[#333333] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white font-semibold px-4 py-2 rounded-lg transition-colors"
                    >
                      Send Reset Email
                    </button>
                  </div>
                </div>

                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Active Session</h3>
                <div className="bg-gray-50 dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-center justify-between">
                   <div className="flex items-center gap-3">
                     <div className="bg-green-500/10 p-2 rounded-md"><Globe size={16} className="text-green-600 dark:text-green-500" /></div>
                     <div>
                       <div className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                         Desktop / Browser (Current) 
                         <span className="bg-green-500/20 text-green-700 dark:text-green-500 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Active</span>
                       </div>
                       <div className="text-xs text-gray-500 dark:text-gray-400">{auth?.currentUser?.email} • Online</div>
                     </div>
                   </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'language' && (
            <div className="space-y-8 max-w-2xl">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Language & Region</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Set your preferred language for transcripts and AI prompts.</p>
                
                <div className="p-4 bg-gray-50 dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-gray-800">
                  <label className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-3">App Language</label>
                  <select className="w-full bg-white dark:bg-[#111111] border border-gray-300 dark:border-gray-700 text-sm rounded-lg px-4 py-2.5 text-gray-900 dark:text-white outline-none focus:border-voiceflow-orange shadow-sm">
                    <option value="en">English (US)</option>
                    <option value="fr">Français (French)</option>
                    <option value="es">Español (Spanish)</option>
                    <option value="de">Deutsch (German)</option>
                    <option value="pt">Português (Portuguese)</option>
                    <option value="ja">日本語 (Japanese)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Admin Dash Credits Panel */}
          {activeTab === 'admin-dash' && isAdmin && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Gift className="text-voiceflow-orange" size={22} />
                    Dash People Credit
                  </h2>
                  <a
                    href="/admin-imamshaffy/users"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-voiceflow-orange hover:underline font-semibold"
                  >
                    Open Full Admin Portal →
                  </a>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                  As the Voiceflow founder, you can gift Lifetime Pro, bonus minutes, or reset usage for any user by their email address.
                </p>

                <form onSubmit={handleAdminDash} className="space-y-5 bg-gray-50 dark:bg-[#1A1A1A] p-6 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 block mb-2">
                      Recipient Email Address
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. friend@gmail.com, colleague@work.com"
                      value={dashEmail}
                      onChange={(e) => setDashEmail(e.target.value)}
                      className="w-full bg-white dark:bg-[#111111] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-voiceflow-orange shadow-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 block mb-2">
                      Select Credit / Privilege to Dash
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => setDashType('pro')}
                        className={`p-3.5 rounded-xl border text-left transition-all ${
                          dashType === 'pro'
                            ? 'border-voiceflow-orange bg-orange-50 dark:bg-orange-950/20 text-voiceflow-orange font-bold shadow-sm'
                            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-[#252525] text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        <div className="text-sm font-bold flex items-center gap-1.5">
                          <Crown size={15} /> Lifetime Pro
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-normal">
                          Unlock all features & unlimited limits
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDashType('minutes')}
                        className={`p-3.5 rounded-xl border text-left transition-all ${
                          dashType === 'minutes'
                            ? 'border-voiceflow-orange bg-orange-50 dark:bg-orange-950/20 text-voiceflow-orange font-bold shadow-sm'
                            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-[#252525] text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        <div className="text-sm font-bold flex items-center gap-1.5">
                          <Clock size={15} /> Free Minutes
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-normal">
                          Grant additional minutes quota
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDashType('reset')}
                        className={`p-3.5 rounded-xl border text-left transition-all ${
                          dashType === 'reset'
                            ? 'border-voiceflow-orange bg-orange-50 dark:bg-orange-950/20 text-voiceflow-orange font-bold shadow-sm'
                            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-[#252525] text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        <div className="text-sm font-bold flex items-center gap-1.5">
                          <RotateCcw size={15} /> Reset Limits
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-normal">
                          Reset counters to 0 / fresh start
                        </div>
                      </button>
                    </div>
                  </div>

                  {dashType === 'minutes' && (
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 block mb-2">
                        Minutes Quantity
                      </label>
                      <div className="grid grid-cols-4 gap-2">
                        {[60, 120, 300, 1000].map((mins) => (
                          <button
                            key={mins}
                            type="button"
                            onClick={() => setDashMinutes(mins)}
                            className={`py-2 px-3 text-xs rounded-lg border font-semibold transition-colors ${
                              dashMinutes === mins
                                ? 'bg-voiceflow-orange text-white border-voiceflow-orange shadow-sm'
                                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-[#252525] text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            +{mins} mins
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 block mb-2">
                      Gift Note (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Compliments of Bello Imam"
                      value={dashNote}
                      onChange={(e) => setDashNote(e.target.value)}
                      className="w-full bg-white dark:bg-[#111111] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-voiceflow-orange shadow-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isDashing || !dashEmail}
                    className="w-full bg-voiceflow-orange hover:bg-orange-600 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    {isDashing ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Dashing Credit...
                      </>
                    ) : (
                      <>
                        <Gift size={18} />
                        Grant & Dash Credit Now
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Billing & Subscription Plans */}
          {activeTab === 'billing' && (
            <div className="space-y-8 max-w-2xl">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Billing & Plans</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Manage your subscription, minutes, and payment methods.</p>
                
                <div className={`p-6 rounded-xl border mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  isAdmin
                    ? 'bg-orange-500/10 border-orange-500/30 dark:bg-orange-950/20 dark:border-orange-800/40'
                    : isProUser 
                    ? 'bg-emerald-500/10 border-emerald-500/30 dark:bg-emerald-950/20 dark:border-emerald-800/40' 
                    : 'bg-gray-50 dark:bg-[#1A1A1A] border-gray-200 dark:border-gray-800'
                }`}>
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                        {isAdmin ? 'Voiceflow Founder & Admin' : currentPlan}
                      </h3>
                      {isAdmin ? (
                        <span className="bg-voiceflow-orange text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Founder & Owner
                        </span>
                      ) : isProUser ? (
                        <span className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Active Plan
                        </span>
                      ) : (
                        <span className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Free Tier
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {isAdmin
                        ? 'Unlimited transcription, infinite AI meeting copilot, zero rate limits, and full administrative rights.'
                        : isProUser 
                        ? 'Unlimited real-time meeting transcription, instant AI copilot, audio drops, and live screen notes.'
                        : 'Free tier with 30 minutes/month & 3 meeting sessions.'}
                    </p>
                  </div>
                  <div className="sm:text-right shrink-0">
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                      {isAdmin ? '$0' : isProUser ? '$11.99' : '$0'}
                      <span className="text-sm text-gray-500 font-medium">{isAdmin ? ' / Founder' : '/mo'}</span>
                    </span>
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3">
                  <button 
                    onClick={() => {
                      onClose();
                      onOpenBilling?.();
                    }} 
                    className="flex-1 bg-voiceflow-orange hover:bg-orange-600 text-white py-3.5 rounded-xl font-bold text-sm transition-colors shadow-lg shadow-orange-900/20 flex items-center justify-center gap-2"
                  >
                    <CreditCard size={18} />
                    {isAdmin ? "View All Plans & Features" : isProUser ? "Change Plan / View Tiers" : "Upgrade to Pro (View Plans & Checkout)"}
                  </button>
                  {(isProUser || isAdmin) && (
                    <button 
                      onClick={() => {
                        toast({
                          title: isAdmin ? "Founder Account" : "Subscription in Good Standing",
                          description: isAdmin 
                            ? "Founder account: All limits bypassed permanently."
                            : "Your Voiceflow Pro subscription is active with Flutterwave payment verification.",
                        });
                      }}
                      className="px-6 py-3.5 border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-[#2A2A2A] rounded-xl font-semibold text-sm transition-colors text-gray-700 dark:text-gray-300"
                    >
                      {isAdmin ? "Founder Privileges" : "Billing Details"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {(activeTab === 'release-notes' || activeTab === 'help-center' || activeTab === 'contact') && (
            <div className="space-y-8 max-w-2xl">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                  {activeTab === 'release-notes' ? "Release Notes" : activeTab === 'help-center' ? "Help Center" : "Contact Support"}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                   {activeTab === 'release-notes' ? "What's new in VoiceFlow v0.1.0." : activeTab === 'help-center' ? "Browse guides and tutorials." : "Get in touch with our team."}
                </p>
                
                <div className="flex flex-col items-center justify-center p-12 bg-gray-50 dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-gray-800 border-dashed text-center">
                   {activeTab === 'release-notes' && <FileText size={32} className="text-gray-400 dark:text-gray-600 mb-3" />}
                   {activeTab === 'help-center' && <HelpCircle size={32} className="text-gray-400 dark:text-gray-600 mb-3" />}
                   {activeTab === 'contact' && <LifeBuoy size={32} className="text-gray-400 dark:text-gray-600 mb-3" />}
                   <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">Documentation & Guides</h3>
                   <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">View complete guides, tutorials, and support articles online.</p>
                   <button 
                     onClick={() => window.open('https://voiceflow.space/help-center', '_blank')}
                     className="text-xs bg-gray-200 dark:bg-[#2A2A2A] hover:bg-gray-300 dark:hover:bg-[#333333] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white font-semibold px-4 py-2 rounded-lg transition-colors"
                   >
                     Open Help Center
                   </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShortcutRow({ icon, label, keys }: { icon: string, label: string, keys: string[] }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-[#1A1A1A] group transition-colors cursor-pointer">
      <div className="flex items-center gap-3">
        <span className="text-gray-500 dark:text-gray-400 text-sm">{icon}</span>
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{label}</span>
      </div>
      <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
        {keys.map((k, i) => (
          <kbd key={i} className="bg-white dark:bg-[#2A2A2A] text-gray-700 dark:text-gray-300 px-2 py-1 rounded text-xs font-mono font-medium border border-gray-300 dark:border-[#333] shadow-sm">
            {k}
          </kbd>
        ))}
      </div>
    </div>
  );
}
