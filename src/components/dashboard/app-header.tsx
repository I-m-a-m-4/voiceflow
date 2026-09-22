"use client";

import React from 'react';
import { Search, Video, Upload, Mic, Sun, Moon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useTheme } from 'next-themes';

export default function AppHeader() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const isDarkMode = resolvedTheme === 'dark';

  return (
    <div className="flex flex-col border-b border-border bg-background">
      {/* Main Header Row */}
      <header className="flex items-center justify-between h-14 px-4 bg-muted/30">
        <div className="flex-1 max-w-xl relative group">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-muted-foreground group-focus-within:text-primary" />
          </div>
          <Input 
            type="text" 
            placeholder="Ask or search" 
            className="w-full pl-10 h-9 bg-background border-border rounded-full focus-visible:ring-1 focus-visible:ring-primary shadow-sm text-sm"
          />
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <span className="text-xs text-muted-foreground font-medium">CtrlK</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {mounted && (
            <button 
              onClick={() => setTheme(isDarkMode ? 'light' : 'dark')}
              className="p-2 text-muted-foreground hover:bg-muted hover:text-foreground rounded-full transition-colors"
              aria-label="Toggle theme"
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          )}
          <button className="p-2 text-muted-foreground hover:bg-muted hover:text-foreground rounded-full transition-colors">
            <Video size={18} />
          </button>
          <button className="flex items-center gap-2 px-4 py-1.5 text-sm font-semibold text-foreground bg-background border border-border rounded-full hover:bg-muted shadow-sm transition-colors">
            <Upload size={16} />
            Import
          </button>
          <button className="flex items-center gap-2 px-5 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-full hover:bg-blue-700 shadow-sm transition-colors shadow-blue-500/20 dark:text-white dark:bg-blue-600">
            <Mic size={16} />
            Record
          </button>
        </div>
      </header>
    </div>
  );
}
