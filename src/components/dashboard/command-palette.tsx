"use client";

import React, { useState, useEffect } from 'react';
import { Search, Play, Eye, Settings, Calendar, Key, User, Shield, Video, Layers, X } from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: (tab?: string) => void;
  onOpenModes: () => void;
  onStartListening: () => void;
  isDetectable: boolean;
  onToggleDetectable: () => void;
}

export default function CommandPalette({
  isOpen,
  onClose,
  onOpenSettings,
  onOpenModes,
  onStartListening,
  isDetectable,
  onToggleDetectable
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const actions = [
    {
      id: 'start-listening',
      title: 'Start Listening',
      icon: Play,
      action: () => {
        onStartListening();
        onClose();
      }
    },
    {
      id: 'view-sessions',
      title: 'View Sessions',
      icon: Video,
      action: () => {
        onClose();
      }
    },
    {
      id: 'modes',
      title: 'Manage AI Modes',
      icon: Layers,
      action: () => {
        onOpenModes();
        onClose();
      }
    },
    {
      id: 'toggle-detectable',
      title: isDetectable ? 'Enable Stealth Mode (Undetectable)' : 'Disable Stealth Mode (Detectable)',
      icon: Eye,
      action: () => {
        onToggleDetectable();
        onClose();
      }
    }
  ];

  const settingsItems = [
    { id: 'general', title: 'General', icon: Settings, tab: 'general' },
    { id: 'calendar', title: 'Calendar', icon: Calendar, tab: 'calendar' },
    { id: 'keybinds', title: 'Keybinds', icon: Key, tab: 'keybinds' },
    { id: 'profile', title: 'Profile', icon: User, tab: 'profile' },
    { id: 'security', title: 'Security', icon: Shield, tab: 'security' },
  ];

  const filteredActions = actions.filter(a => a.title.toLowerCase().includes(query.toLowerCase()));
  const filteredSettings = settingsItems.filter(s => s.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-24 px-4 animate-in fade-in duration-150">
      <div 
        className="w-full max-w-lg bg-[#18181b] border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden text-white font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-neutral-800 bg-[#121215]">
          <Search className="w-4 h-4 text-neutral-400 mr-3 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for meetings, people, and more..."
            className="w-full bg-transparent text-sm text-white placeholder-neutral-500 focus:outline-none"
            autoFocus
          />
          <button 
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-white rounded-md hover:bg-neutral-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Results Body */}
        <div className="p-2 max-h-[360px] overflow-y-auto space-y-3 text-xs">
          {/* Actions Section */}
          {filteredActions.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                Actions
              </div>
              <div className="space-y-0.5">
                {filteredActions.map((item) => (
                  <button
                    key={item.id}
                    onClick={item.action}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-neutral-200 hover:bg-neutral-800/80 hover:text-white transition-colors text-left"
                  >
                    <item.icon size={16} className="text-neutral-400" />
                    <span className="font-medium text-sm">{item.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Settings Section */}
          {filteredSettings.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                Settings
              </div>
              <div className="space-y-0.5">
                {filteredSettings.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      onOpenSettings(item.tab);
                      onClose();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-neutral-200 hover:bg-neutral-800/80 hover:text-white transition-colors text-left"
                  >
                    <item.icon size={16} className="text-neutral-400" />
                    <span className="font-medium text-sm">{item.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {filteredActions.length === 0 && filteredSettings.length === 0 && (
            <div className="py-8 text-center text-neutral-500">
              No matching commands found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
