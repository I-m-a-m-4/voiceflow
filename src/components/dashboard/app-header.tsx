"use client";

import React, { useState, useEffect } from 'react';
import { Search, Sun, Moon, PanelLeft, Bot, Sparkles, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import CommandMenu from '@/components/layout/command-menu';
import { useAuth } from '@/firebase';

export default function AppHeader() {
  const router = useRouter();
  const auth = useAuth();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [searchVal, setSearchVal] = useState('');
  const [isCommandOpen, setIsCommandOpen] = useState(false);

  useEffect(() => {
    setMounted(true);

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleToggleSidebar = () => {
    window.dispatchEvent(new CustomEvent('voiceflow-toggle-sidebar'));
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchVal.trim()) return;
    // Dispatch search filter event or navigate to dashboard with query
    window.dispatchEvent(new CustomEvent('voiceflow-search-query', { detail: { query: searchVal.trim() } }));
    router.push(`/dashboard?q=${encodeURIComponent(searchVal.trim())}`);
  };

  const isDarkMode = resolvedTheme === 'dark';

  return (
    <>
      <div 
        className="sticky top-0 z-30 shrink-0 flex flex-col border-b border-border bg-background/95 backdrop-blur-md"
        style={{ top: 'var(--tauri-title-height, 0px)' }}
      >
        <header className="flex items-center justify-between h-14 px-3 sm:px-4 gap-2 sm:gap-4">
          
          {/* Left: Sidebar Collapse/Expand Toggle Button */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleToggleSidebar}
              title="Toggle sidebar"
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-transparent hover:border-border"
            >
              <PanelLeft size={18} />
            </button>
          </div>

          {/* Center: Functional Search Bar */}
          <form onSubmit={handleSearchSubmit} className="flex-1 max-w-xl relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-muted-foreground group-focus-within:text-voiceflow-orange transition-colors" />
            </div>
            <Input 
              type="text" 
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
              placeholder="Search meetings, transcripts, AI notes..." 
              className="w-full pl-9 pr-16 h-9 bg-muted/40 border-border rounded-full focus-visible:ring-1 focus-visible:ring-voiceflow-orange shadow-none text-xs sm:text-sm placeholder:text-muted-foreground"
            />
            <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center gap-1">
              {searchVal ? (
                <button
                  type="button"
                  onClick={() => setSearchVal('')}
                  className="text-muted-foreground hover:text-foreground p-0.5"
                >
                  <X size={13} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsCommandOpen(true)}
                  className="text-[11px] text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border font-medium hover:border-voiceflow-orange transition-colors"
                >
                  Ctrl K
                </button>
              )}
            </div>
          </form>

          {/* Right: Clean Organized Status & Theme Widgets */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Status Indicator Widget */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-muted/50 border border-border text-xs text-muted-foreground font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Voiceflow AI Active</span>
            </div>

            {mounted && (
              <button 
                onClick={() => setTheme(isDarkMode ? 'light' : 'dark')}
                className="p-2 text-muted-foreground hover:bg-muted hover:text-foreground rounded-full transition-colors"
                aria-label="Toggle theme"
                title={`Switch to ${isDarkMode ? 'Light' : 'Dark'} mode`}
              >
                {isDarkMode ? <Sun size={17} /> : <Moon size={17} />}
              </button>
            )}

            {/* Top Bar User Profile Badge */}
            <div 
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('open-settings-modal', { detail: { tab: 'profile' } }));
                }
              }}
              className="flex items-center gap-2.5 pl-1.5 pr-2.5 py-1 rounded-xl hover:bg-muted cursor-pointer transition-colors border border-border/40 hover:border-border"
              title="Manage Account Settings"
            >
              {auth?.currentUser?.photoURL ? (
                <img 
                  src={auth.currentUser.photoURL} 
                  alt={auth.currentUser.displayName || 'User'} 
                  className="w-7 h-7 rounded-lg object-cover shadow-xs border border-border/50" 
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-7 h-7 rounded-lg bg-voiceflow-orange flex items-center justify-center text-white font-bold text-xs shadow-xs">
                  {auth?.currentUser?.email?.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
              <div className="hidden md:flex flex-col text-left">
                <span className="text-xs font-bold leading-tight text-foreground truncate max-w-[140px]">
                  {auth?.currentUser?.displayName || 'User'}
                </span>
                <span className="text-[10px] leading-tight text-muted-foreground truncate max-w-[140px]">
                  {auth?.currentUser?.email || 'user@example.com'}
                </span>
              </div>
            </div>
          </div>
        </header>
      </div>

      <CommandMenu open={isCommandOpen} onOpenChange={setIsCommandOpen} />
    </>
  );
}
