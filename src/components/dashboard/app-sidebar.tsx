"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Home, Settings, FileText, Sparkles, 
  PanelLeftClose, PanelLeftOpen, Gift, Mic 
} from 'lucide-react';
import { useAuth } from '@/firebase';
import { usePlanUsage } from '@/hooks/use-plan-usage';
import { BillingModal } from './billing-modal';
import { SettingsModal } from './settings-modal';

export default function AppSidebar() {
  const pathname = usePathname();
  const auth = useAuth();
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('general');
  const [isCollapsed, setIsCollapsed] = useState(false);

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

  const navItems = [
    { label: 'My Meetings', icon: Home, href: '/dashboard' },
    { label: 'AI Meeting Notetaker', icon: FileText, href: '/dashboard/notetaker' },
  ];

  useEffect(() => {
    const handleOpenBilling = () => setIsBillingModalOpen(true);
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

  const { isPro, sessionCount, usedMinutes, maxMinutes, maxFreeSessions, isLimitReached } = usePlanUsage();

  return (
    <>
      <aside 
        className={`${
          isCollapsed ? 'w-[68px]' : 'w-[240px]'
        } h-screen bg-[#F9F9F9] border-r border-gray-200 flex flex-col shrink-0 overflow-y-auto overflow-x-hidden transition-all duration-300 ease-in-out dark:bg-muted/50 dark:border-border select-none`}
      >
        {/* Brand & Toggle Header */}
        <div className={`p-3.5 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} border-b border-gray-100 dark:border-border/50`}>
          {!isCollapsed ? (
            <>
              <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
                <img src="/icon.svg" alt="VoiceFlow" className="w-8 h-8 rounded-lg shadow-sm shrink-0" />
                <span className="font-bold text-voiceflow-orange text-2xl tracking-tight font-clash truncate">VoiceFlow</span>
              </Link>
              <div className="flex items-center gap-1 shrink-0">
                <button 
                  onClick={toggleCollapsed} 
                  title="Collapse sidebar"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 dark:hover:text-gray-200 dark:hover:bg-muted transition-colors"
                >
                  <PanelLeftClose size={18} />
                </button>
              </div>
            </>
          ) : (
            <button 
              onClick={toggleCollapsed} 
              title="Expand sidebar"
              className="p-1 rounded-lg hover:bg-gray-200/60 dark:hover:bg-muted transition-colors flex flex-col items-center gap-1"
            >
              <img src="/icon.svg" alt="VoiceFlow" className="w-8 h-8 rounded-lg shadow-sm" />
              <PanelLeftOpen size={14} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" />
            </button>
          )}
        </div>

        {/* User Profile Area */}
        <div className="px-2 py-2 mb-1">
          {!isCollapsed ? (
            <div 
              onClick={() => {
                setSettingsTab('profile');
                setIsSettingsModalOpen(true);
              }}
              className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-gray-100 cursor-pointer dark:hover:bg-muted transition-colors"
              title="Manage Profile"
            >
              <div className="w-8 h-8 rounded-full bg-voiceflow-orange flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm">
                {auth?.currentUser?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate text-gray-900 dark:text-gray-200">{auth?.currentUser?.displayName || 'User'}</div>
                <div className="text-[11px] text-gray-500 truncate dark:text-gray-400">{auth?.currentUser?.email || 'user@example.com'}</div>
              </div>
            </div>
          ) : (
            <div 
              onClick={() => {
                setSettingsTab('profile');
                setIsSettingsModalOpen(true);
              }}
              className="flex justify-center p-1 cursor-pointer"
              title={auth?.currentUser?.email || 'User Profile'}
            >
              <div className="w-8 h-8 rounded-full bg-voiceflow-orange flex items-center justify-center text-white font-bold text-xs shadow-sm hover:ring-2 hover:ring-orange-400 transition-all">
                {auth?.currentUser?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
            </div>
          )}
        </div>

        {/* Main Navigation */}
        <nav className="px-2 mt-2 space-y-1">
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
              window.dispatchEvent(new CustomEvent('voiceflow-toggle-record'));
            }}
            title="Capture Conversation"
            className={`w-full flex items-center ${isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2'} rounded-xl text-sm font-medium transition-colors text-voiceflow-orange bg-orange-50 hover:bg-orange-100 dark:bg-orange-500/10 dark:hover:bg-orange-500/20`}
          >
            <Mic size={18} className="text-voiceflow-orange shrink-0" />
            {!isCollapsed && <span className="font-semibold truncate">Capture Conversation</span>}
          </button>

          {auth?.currentUser?.email?.toLowerCase() === 'belloimam431@gmail.com' && (
            <button
              onClick={() => {
                setSettingsTab('admin-dash');
                setIsSettingsModalOpen(true);
              }}
              title="Dash Credits"
              className={`w-full flex items-center ${isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2'} rounded-xl text-sm font-medium transition-colors text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20`}
            >
              <Gift size={18} className="text-emerald-500 shrink-0" />
              {!isCollapsed && <span className="font-bold truncate">Dash Credits</span>}
            </button>
          )}

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

        {/* Bottom section */}
        <div className="mt-auto pt-4 px-2 pb-3">
          <div className="border-t border-gray-200 pt-3 dark:border-border">
            {!isCollapsed ? (
              <>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-gray-900 dark:text-gray-200 flex items-center gap-1.5">
                    {isPro ? (
                      <>
                        <Sparkles size={13} className="text-voiceflow-orange fill-voiceflow-orange" />
                        <span>Voiceflow Pro</span>
                      </>
                    ) : (
                      <span>Basic Plan</span>
                    )}
                  </span>
                  {!isPro && (
                    <span className="text-[10px] font-semibold text-gray-400">
                      {sessionCount}/{maxFreeSessions} sessions
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-gray-500 mb-2 dark:text-gray-400">
                  {isPro ? "Unlimited monthly mins" : `${usedMinutes} of ${maxMinutes} monthly mins used`}
                </div>
                
                <div className="w-full bg-gray-200 h-1.5 rounded-full mb-2.5 overflow-hidden dark:bg-gray-700">
                  <div 
                    className={`h-full transition-all duration-500 ${isPro ? "bg-emerald-500" : isLimitReached ? "bg-red-500" : "bg-voiceflow-orange"}`} 
                    style={{ 
                      width: isPro ? '100%' : `${Math.min(100, Math.max(usedMinutes > 0 ? 5 : 0, Math.round((usedMinutes / maxMinutes) * 100)))}%` 
                    }}
                  />
                </div>
                
                <button 
                  onClick={() => setIsBillingModalOpen(true)}
                  className={`w-full py-1.5 px-3 rounded-full text-xs font-bold transition-all shadow-sm ${
                    isPro
                      ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 hover:bg-emerald-500/20 dark:text-emerald-400"
                      : isLimitReached
                        ? "bg-red-500 text-white hover:bg-red-600 border border-red-500 animate-pulse"
                        : "border border-voiceflow-orange text-voiceflow-orange hover:bg-orange-50 dark:hover:bg-orange-500/10"
                  }`}
                >
                  {isPro ? "Pro Active • Manage" : isLimitReached ? "Limit Reached • Upgrade" : "Upgrade to Pro"}
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={() => setIsBillingModalOpen(true)}
                  title={isPro ? "Voiceflow Pro Active" : isLimitReached ? "Limit Reached - Upgrade" : "Upgrade to Pro"}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    isPro 
                      ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 hover:scale-105"
                      : isLimitReached
                        ? "bg-red-500 text-white hover:scale-105 animate-pulse"
                        : "bg-orange-500/10 text-voiceflow-orange border border-voiceflow-orange/30 hover:scale-105"
                  }`}
                >
                  <Sparkles size={16} />
                </button>
              </div>
            )}
          </div>
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
