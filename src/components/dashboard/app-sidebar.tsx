"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Settings, Bell, FileText, MessageSquare, Ghost } from 'lucide-react';
import { useAuth } from '@/firebase';
import { BillingModal } from './billing-modal';
import { SettingsModal } from './settings-modal';

export default function AppSidebar() {
  const pathname = usePathname();
  const auth = useAuth();
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  
  const navItems = [
    { label: 'My Meetings', icon: Home, href: '/dashboard' },
    { label: 'AI Meeting Notetaker', icon: FileText, href: '/dashboard/notetaker' },
    { label: 'Live Answers', icon: MessageSquare, href: '/dashboard/answers' },
    { label: 'Stealth Mode', icon: Ghost, href: '/dashboard/stealth' },
  ];

  React.useEffect(() => {
    const handleOpenBilling = () => setIsBillingModalOpen(true);
    window.addEventListener('open-billing-modal', handleOpenBilling);
    return () => window.removeEventListener('open-billing-modal', handleOpenBilling);
  }, []);

  return (
    <>
      <aside className="w-[240px] h-screen bg-[#F9F9F9] border-r border-gray-200 flex flex-col shrink-0 overflow-y-auto dark:bg-muted/50 dark:border-border">
        {/* Brand & User Header */}
        <div className="p-4 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <img src="/icon.svg" alt="VoiceFlow" className="w-8 h-8 rounded-lg shadow-sm" />
            <span className="font-bold text-voiceflow-orange text-2xl tracking-tight">VoiceFlow</span>
          </Link>
          <button className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <Bell size={20} />
          </button>
        </div>

        {/* User Profile Area */}
        <div className="px-4 py-2 mb-2">
          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 cursor-pointer dark:hover:bg-muted">
            <div className="w-8 h-8 rounded-full bg-voiceflow-orange flex items-center justify-center text-white font-bold text-sm shrink-0">
              {auth?.currentUser?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate dark:text-gray-200">{auth?.currentUser?.displayName || 'User'}</div>
              <div className="text-xs text-gray-500 truncate dark:text-gray-400">{auth?.currentUser?.email || 'user@example.com'}</div>
            </div>
          </div>
        </div>

        {/* Main Navigation */}
        <nav className="px-2 mt-4 space-y-0.5">
          {navItems.map((item) => {
            const isActive = item.href === '/dashboard' 
              ? pathname === '/dashboard' 
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive 
                    ? 'bg-orange-100 text-voiceflow-orange dark:bg-orange-500/20' 
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-muted'
                }`}
              >
                <item.icon size={18} className={isActive ? 'text-voiceflow-orange' : 'text-gray-500 dark:text-gray-400'} />
                {item.label}
              </Link>
            );
          })}
          
          <button
            onClick={() => setIsSettingsModalOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-muted"
          >
            <Settings size={18} className="text-gray-500 dark:text-gray-400" />
            Settings
          </button>
        </nav>

        {/* Bottom section */}
        <div className="mt-auto pt-6 px-4 pb-4">
          <div className="border-t border-gray-200 pt-4 dark:border-border">
            <div className="flex justify-between items-end mb-1">
              <span className="text-sm font-bold text-gray-900 dark:text-gray-200">Basic Plan</span>
            </div>
            <div className="text-xs text-gray-500 mb-3 dark:text-gray-400">0 of 300 monthly mins used</div>
            
            <div className="w-full bg-gray-200 h-1.5 rounded-full mb-3 overflow-hidden dark:bg-gray-700">
              <div className="bg-voiceflow-orange h-full" style={{ width: '0%' }}></div>
            </div>
            
            <button 
              onClick={() => setIsBillingModalOpen(true)}
              className="w-full py-1.5 px-3 rounded-full border border-voiceflow-orange text-voiceflow-orange text-sm font-semibold hover:bg-orange-50 transition-colors dark:hover:bg-orange-500/10"
            >
              Upgrade to Pro
            </button>
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
      />
    </>
  );
}
