"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, MessageSquare, Bell } from 'lucide-react';
import { useAuth } from '@/firebase';

export default function AppSidebar() {
  const pathname = usePathname();
  const auth = useAuth();
  
  const navItems = [
    { label: 'My Meetings', icon: Home, href: '/dashboard' },
    { label: 'AI Chat', icon: MessageSquare, href: '/zen-ai' },
  ];

  return (
    <aside className="w-[240px] h-screen bg-[#F9F9F9] border-r border-gray-200 flex flex-col shrink-0 overflow-y-auto">
      {/* Brand & User Header */}
      <div className="p-4 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="VoiceFlow" className="w-8 h-8 rounded-lg shadow-sm" />
          <span className="font-bold text-voiceflow-orange text-2xl tracking-tight">VoiceFlow</span>
        </Link>
        <button className="text-gray-500 hover:text-gray-700">
          <Bell size={20} />
        </button>
      </div>

      {/* User Profile Area */}
      <div className="px-4 py-2 mb-2">
        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 cursor-pointer">
          <div className="w-8 h-8 rounded-full bg-voiceflow-orange flex items-center justify-center text-white font-bold text-sm">
            {auth?.currentUser?.email?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex-1 truncate">
            <div className="text-sm font-semibold truncate">{auth?.currentUser?.displayName || 'User'}</div>
            <div className="text-xs text-gray-500 truncate">{auth?.currentUser?.email || 'user@example.com'}</div>
          </div>
        </div>
        <button className="w-full mt-2 text-xs font-semibold py-1.5 px-3 rounded bg-gray-200 hover:bg-gray-300 text-gray-800 transition-colors">
          Get Pro For Free
        </button>
      </div>

      {/* Main Navigation */}
      <nav className="px-2 mt-4 space-y-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href === '/dashboard' && pathname.startsWith('/dashboard'));
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive 
                  ? 'bg-orange-100 text-voiceflow-orange' 
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <item.icon size={18} className={isActive ? 'text-voiceflow-orange' : 'text-gray-500'} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="mt-auto pt-6 px-4 pb-4">
        <div className="border-t border-gray-200 pt-4">
          <div className="flex justify-between items-end mb-1">
            <span className="text-sm font-bold text-gray-900">Basic Plan</span>
          </div>
          <div className="text-xs text-gray-500 mb-3">0 of 300 monthly mins used</div>
          
          <div className="w-full bg-gray-200 h-1.5 rounded-full mb-3 overflow-hidden">
            <div className="bg-voiceflow-orange h-full" style={{ width: '0%' }}></div>
          </div>
          
          <button className="w-full py-1.5 px-3 rounded-full border border-voiceflow-orange text-voiceflow-orange text-sm font-semibold hover:bg-orange-50 transition-colors">
            Upgrade to Pro
          </button>
        </div>
      </div>
    </aside>
  );
}
