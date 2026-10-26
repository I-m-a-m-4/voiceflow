"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Home, Settings, FileText, Sparkles, 
  PanelLeftClose, PanelLeftOpen, Gift, Mic,
  Coins, Crown, Zap, ChevronRight
} from 'lucide-react';
import { useAuth } from '@/firebase';
import { usePlanUsage } from '@/hooks/use-plan-usage';
import { useCurrencyGeo } from '@/hooks/use-currency-geo';
import { useToast } from '@/hooks/use-toast';
import { copyToClipboard } from '@/lib/clipboard';
import { BillingModal } from './billing-modal';
import { SettingsModal } from './settings-modal';
import { isMeetingRecordingActive } from '@/lib/meeting-state';

export default function AppSidebar() {
  const pathname = usePathname();
  const auth = useAuth();
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('general');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  // Load collapsed state from storage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('voiceflow_sidebar_collapsed');
      if (saved !== null) {
        setIsCollapsed(saved === 'true');
      }
    }
  }, []);

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('voiceflow_sidebar_collapsed', String(next));
      }
      return next;
    });
  };

  // Listen for sidebar toggle event from header
  useEffect(() => {
    const handleToggle = () => {
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        setIsMobileOpen((prev) => !prev);
      } else {
        toggleCollapsed();
      }
    };
    window.addEventListener('voiceflow-toggle-sidebar', handleToggle);
    return () => window.removeEventListener('voiceflow-toggle-sidebar', handleToggle);
  }, []);

  const navItems = [
    { label: 'My Meetings', icon: Home, href: '/dashboard' },
    { label: 'AI Meeting Notetaker', icon: FileText, href: '/dashboard/notetaker' },
  ];

  useEffect(() => {
    const handleOpenBilling = () => {
      if (isMeetingRecordingActive()) return;
      setIsBillingModalOpen(true);
    };
    const handleOpenSettings = (e: any) => {
      if (e.detail?.tab) setSettingsTab(e.detail.tab);
      setIsSettingsModalOpen(true);
    };
    window.addEventListener('open-billing-modal', handleOpenBilling);
    window.addEventListener('open-settings-modal', handleOpenSettings);
    return () => {
      window.removeEventListener('open-billing-modal', handleOpenBilling);
      window.removeEventListener('open-settings-modal', handleOpenSettings);
    };
  }, []);

  const { isPro, isAdmin, sessionCount, usedMinutes, bonusMinutes, maxMinutes, availableCredits, maxFreeSessions, isLimitReached, screenCaptureCount } = usePlanUsage();
  const { formatPrice } = useCurrencyGeo();
  const { toast } = useToast();

  const creditPercent = isPro ? 100 : Math.min(100, Math.max(availableCredits > 0 ? 6 : 0, Math.round((availableCredits / maxMinutes) * 100)));

  const handleInviteFriends = async () => {
    const inviteUrl = typeof window !== 'undefined' 
      ? `${window.location.origin}/signup?ref=${encodeURIComponent(auth?.currentUser?.uid || 'referral')}`
      : 'https://voiceflow.app';
    try {
      const success = await copyToClipboard(inviteUrl);
      if (success) {
        toast({
          title: "Invite Link Copied!",
          description: "Share this link with your team or friends to invite them to Voiceflow.",
        });
      } else {
        toast({
          title: "Invite Friends",
          description: inviteUrl,
        });
      }
    } catch {
      toast({
        title: "Invite Friends",
        description: "Invite colleagues to experience Voiceflow AI.",
      });
    }
  };

  const handleReferralsClick = () => {
    if (isAdmin) {
      setSettingsTab('admin-dash');
      setIsSettingsModalOpen(true);
    } else {
      handleInviteFriends();
    }
  };

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {isMobileOpen && (
        <div 
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden animate-fade-in"
          aria-hidden="true"
        />
      )}

      <aside 
        className={`fixed md:relative top-0 inset-y-0 left-0 z-50 md:z-auto h-full bg-[#F9F9F9] border-r border-gray-200 flex flex-col shrink-0 overflow-y-auto overflow-x-hidden transition-all duration-300 ease-in-out dark:bg-muted/50 dark:border-border ${
          isMobileOpen 
            ? 'translate-x-0 w-[256px] shadow-2xl' 
            : '-translate-x-full md:translate-x-0'
        } ${
          isCollapsed ? 'md:w-[68px]' : 'md:w-[256px]'
        }`}
      >
        {/* Brand Header */}
        <div className={`p-3.5 flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'} border-b border-gray-100 dark:border-border/50`}>
          <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
            <img src="/icon.svg" alt="VoiceFlow" className="w-8 h-8 rounded-lg shadow-sm shrink-0" />
            {!isCollapsed && (
              <span className="font-bold text-voiceflow-orange text-2xl tracking-tight font-clash truncate">
                VoiceFlow
              </span>
            )}
          </Link>
        </div>

        {/* Main Navigation */}
        <nav className="px-2.5 mt-5 space-y-1.5">
          {navItems.map((item) => {
            const isActive = item.href === '/dashboard' 
              ? pathname === '/dashboard' 
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                title={item.label}
                className={`flex items-center ${isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2'} rounded-xl text-sm font-medium transition-colors ${
                  isActive 
                    ? 'bg-orange-100 text-voiceflow-orange dark:bg-orange-500/20' 
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-muted'
                }`}
              >
                <item.icon size={18} className={isActive ? 'text-voiceflow-orange shrink-0' : 'text-gray-500 dark:text-gray-400 shrink-0'} />
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}

          <button
            onClick={() => {
              setSettingsTab('general');
              setIsSettingsModalOpen(true);
            }}
            title="Settings"
            className={`w-full flex items-center ${isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2'} rounded-xl text-sm font-medium transition-colors text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-muted`}
          >
            <Settings size={18} className="text-gray-500 dark:text-gray-400 shrink-0" />
            {!isCollapsed && <span>Settings</span>}
          </button>
        </nav>

        {/* Bottom section with Voiceflow brand orange cards */}
        <div className="mt-auto pt-4 px-3 pb-8 sm:pb-10 shrink-0 select-text">
          {!isCollapsed ? (
            <div className="space-y-3">
              {/* Referrals / Dash Credits link */}
              <button
                type="button"
                onClick={handleReferralsClick}
                className="w-full flex items-center gap-2 px-1 py-0.5 text-stone-700 dark:text-stone-300 font-semibold text-xs hover:text-voiceflow-orange dark:hover:text-voiceflow-orange transition-colors cursor-pointer group text-left"
              >
                <span className="text-pink-500 text-sm group-hover:scale-110 transition-transform">🎁</span>
                <span>{isAdmin ? 'Dash Credits' : 'Referrals'}</span>
              </button>

              {/* Card 1: Voiceflow Credits / Usage Card (Brand Orange) */}
              <div className="rounded-2xl border border-stone-200/90 bg-white p-3.5 shadow-xs dark:bg-[#18181B] dark:border-stone-800 select-text">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <Coins size={16} className="text-voiceflow-orange" />
                    <span className="font-bold text-xs text-stone-800 dark:text-stone-100 tracking-tight">
                      Voiceflow credits
                    </span>
                  </div>
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-2xl font-black text-voiceflow-orange tracking-tight leading-none">
                      {isPro ? '∞' : availableCredits}
                    </span>
                    <span className="text-xs font-semibold text-stone-400 dark:text-stone-500">
                      /{isPro ? '∞' : maxMinutes}
                    </span>
                  </div>
                </div>

                {/* Progress bar in warm Voiceflow orange */}
                <div className="w-full bg-orange-100/70 dark:bg-stone-800 h-2 rounded-full my-3 overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-voiceflow-orange rounded-full transition-all duration-500 shadow-xs"
                    style={{ width: `${creditPercent}%` }}
                  />
                </div>

                {/* Explanatory copy (selectable) */}
                <p className="text-xs font-semibold text-stone-800 dark:text-stone-200 leading-snug select-text">
                  {isPro 
                    ? 'Your credits are unlimited.' 
                    : availableCredits === maxMinutes 
                      ? 'Your credits are full.' 
                      : availableCredits === 0 
                        ? 'Monthly credits depleted.' 
                        : `${availableCredits} credits remaining.`}
                </p>
                <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1 leading-snug select-text">
                  {isPro
                    ? 'Pro includes unlimited recording, AI summaries & live assistance.'
                    : bonusMinutes > 0
                      ? `A meeting uses 1 credit per min. Includes ${bonusMinutes} bonus credits gifted.`
                      : `A meeting uses 1 credit per min. Free includes ${maxMinutes} a month.`}
                </p>

                {/* Pill action button */}
                <button
                  type="button"
                  onClick={() => {
                    setSettingsTab('billing');
                    setIsSettingsModalOpen(true);
                  }}
                  className="w-full mt-3 py-2 px-3 rounded-full bg-stone-100 hover:bg-orange-50 hover:text-voiceflow-orange hover:border-orange-200 border border-transparent dark:bg-stone-800 dark:hover:bg-orange-950/30 text-stone-700 dark:text-stone-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>View usage</span>
                  <ChevronRight size={13} className="text-stone-500" />
                </button>

                {/* Secondary link in Voiceflow Orange */}
                <button
                  type="button"
                  onClick={() => setIsBillingModalOpen(true)}
                  className="w-full text-center text-xs font-semibold text-voiceflow-orange hover:underline mt-2.5 transition-colors cursor-pointer"
                >
                  Learn more
                </button>
              </div>

              {/* Card 2: Subscription Card (Brand Orange) */}
              <div className="rounded-2xl border border-orange-200/70 bg-gradient-to-b from-[#FFFDFB] to-[#FFF6EE] p-3.5 shadow-xs dark:bg-gradient-to-b dark:from-[#1A1512] dark:to-[#17120E] dark:border-orange-950/60 select-text">
                <div className="flex items-start gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-voiceflow-orange to-amber-600 flex items-center justify-center text-white shrink-0 shadow-sm shadow-orange-500/20 relative">
                    <Crown size={18} className="text-white drop-shadow-xs" />
                    <span className="absolute -top-1 -right-0.5 text-[9px] font-black text-amber-100 leading-none">
                      +
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-xs text-stone-900 dark:text-stone-100 truncate leading-tight select-text">
                      {isPro ? 'Voiceflow Pro' : 'Voiceflow Pro'}
                    </h4>
                    <p className="text-xs font-bold text-voiceflow-orange mt-0.5 select-text">
                      {formatPrice(11.99, 12500)} per month
                    </p>
                  </div>
                </div>

                <p className="text-[11px] text-stone-600 dark:text-stone-300 mt-2.5 leading-relaxed select-text">
                  {isPro
                    ? 'All premium AI features, private notes & screen intelligence active.'
                    : 'More room across every meeting and transcription tool.'}
                </p>

                <button
                  type="button"
                  onClick={() => setIsBillingModalOpen(true)}
                  className="w-full mt-3 py-2 px-3 rounded-full border border-voiceflow-orange/40 bg-orange-100/70 hover:bg-orange-200/80 dark:bg-orange-950/40 dark:border-orange-500/50 text-voiceflow-orange dark:text-orange-400 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                >
                  <span>{isPro ? 'Manage Pro' : 'Choose Pro'}</span>
                  <Zap size={12} className="text-voiceflow-orange dark:text-orange-400 fill-current" />
                </button>

                <button
                  type="button"
                  onClick={handleInviteFriends}
                  className="w-full text-center text-xs text-stone-500 hover:text-voiceflow-orange dark:text-stone-400 dark:hover:text-voiceflow-orange font-medium hover:underline mt-2.5 transition-colors cursor-pointer"
                >
                  Invite friends
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2.5">
              {/* Compact Credits */}
              <button
                type="button"
                onClick={() => {
                  setSettingsTab('billing');
                  setIsSettingsModalOpen(true);
                }}
                title={`Voiceflow Credits: ${isPro ? 'Unlimited' : `${availableCredits}/${maxMinutes}`}`}
                className="w-10 h-10 rounded-xl bg-white dark:bg-[#18181B] border border-stone-200 dark:border-stone-800 flex flex-col items-center justify-center shadow-xs hover:border-voiceflow-orange transition-all cursor-pointer"
              >
                <Coins size={16} className="text-voiceflow-orange" />
                <span className="text-[9px] font-black text-voiceflow-orange leading-none mt-0.5">
                  {isPro ? '∞' : availableCredits}
                </span>
              </button>

              {/* Compact Pro */}
              <button
                type="button"
                onClick={() => setIsBillingModalOpen(true)}
                title={isPro ? "Voiceflow Pro Active • Manage" : "Voiceflow Pro • Choose Plan"}
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-voiceflow-orange to-amber-600 text-white flex items-center justify-center shadow-sm shadow-orange-500/20 hover:opacity-90 transition-all relative cursor-pointer"
              >
                <Crown size={17} className="text-white" />
                <span className="absolute -top-1 -right-0.5 text-[9px] font-black text-amber-100 leading-none">
                  +
                </span>
              </button>
            </div>
          )}
        </div>
      </aside>

      <BillingModal 
        isOpen={isBillingModalOpen} 
        onClose={() => setIsBillingModalOpen(false)} 
      />
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onOpenBilling={() => setIsBillingModalOpen(true)}
        initialTab={settingsTab}
      />
    </>
  );
}
