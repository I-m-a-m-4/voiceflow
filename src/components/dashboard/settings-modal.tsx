"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Settings, Calendar, Keyboard, User, Shield, Globe, CreditCard, FileText, HelpCircle, LifeBuoy, LogOut, Power, X, Download, Eye, Headphones, Palette, Mic, ChevronDown } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuth } from '@/firebase';
import { invoke } from '@tauri-apps/api/core';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState('general');
  const { theme, setTheme } = useTheme();
  const auth = useAuth();

  const [detectable, setDetectable] = useState(false);
  
  const handleDetectableChange = async (checked: boolean) => {
    setDetectable(checked);
    try {
      await invoke('set_detectable', { detectable: checked });
    } catch (e) {
      console.error('Failed to set detectable mode:', e);
    }
  };

  const [ambientChat, setAmbientChat] = useState(false);

  const tabs = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'keybinds', label: 'Keybinds', icon: Keyboard },
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
      <DialogContent className="sm:max-w-[850px] h-[650px] bg-[#111111] text-gray-200 border-gray-800 p-0 overflow-hidden flex flex-col md:flex-row">
        
        {/* Sidebar */}
        <div className="w-full md:w-[220px] bg-[#161616] border-r border-gray-800 flex flex-col h-full">
          <div className="p-4 flex items-center justify-between md:justify-end">
            <button onClick={onClose} className="md:hidden text-gray-400 hover:text-white">
              <X size={20} />
            </button>
            <button onClick={onClose} className="hidden md:flex text-gray-500 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto px-2">
            <nav className="space-y-0.5">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === tab.id 
                      ? 'bg-[#2A2A2A] text-white' 
                      : 'text-gray-400 hover:bg-[#1E1E1E] hover:text-gray-200'
                  }`}
                >
                  <tab.icon size={16} />
                  {tab.label}
                </button>
              ))}
            </nav>

            <div className="mt-6 mb-2 px-3 text-xs font-semibold text-gray-500">Support</div>
            <nav className="space-y-0.5">
              {supportTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === tab.id 
                      ? 'bg-[#2A2A2A] text-white' 
                      : 'text-gray-400 hover:bg-[#1E1E1E] hover:text-gray-200'
                  }`}
                >
                  <tab.icon size={16} />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-2 border-t border-gray-800">
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:bg-[#1E1E1E] hover:text-gray-200 transition-colors">
              <LogOut size={16} />
              Sign out
            </button>
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:bg-[#1E1E1E] hover:text-gray-200 transition-colors">
              <Power size={16} />
              Quit VoiceFlow
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto bg-[#111111] p-8">
          {activeTab === 'general' && (
            <div className="space-y-8 max-w-2xl">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">General</h2>
                <p className="text-sm text-gray-400 mb-4">Customize how VoiceFlow works for you</p>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-4 bg-[#1A1A1A] rounded-xl border border-gray-800">
                    <div className="flex items-center gap-4">
                      <div className="bg-[#2A2A2A] p-2 rounded-lg"><Download size={20} className="text-gray-300" /></div>
                      <div>
                        <div className="text-sm font-bold text-white">VoiceFlow Version</div>
                        <div className="text-xs text-gray-400">Downloading update from version 2.0.196 to 2.0.197</div>
                      </div>
                    </div>
                    <span className="text-xs text-gray-500 font-semibold bg-[#222222] px-3 py-1.5 rounded-md border border-gray-700">Downloading...</span>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-[#1A1A1A] rounded-xl border border-gray-800">
                    <div className="flex items-center gap-4">
                      <div className="bg-[#2A2A2A] p-2 rounded-lg"><Eye size={20} className="text-gray-300" /></div>
                      <div>
                        <div className="text-sm font-bold text-white">Detectable</div>
                        <div className="text-xs text-gray-400">VoiceFlow is currently detectable by screen-sharing</div>
                      </div>
                    </div>
                    <Switch checked={detectable} onCheckedChange={handleDetectableChange} className="data-[state=checked]:bg-voiceflow-orange" />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-[#1A1A1A] rounded-xl border border-gray-800">
                    <div className="flex items-center gap-4">
                      <div className="bg-[#2A2A2A] p-2 rounded-lg"><Headphones size={20} className="text-gray-300" /></div>
                      <div>
                        <div className="text-sm font-bold text-white">Ambient AI Chat</div>
                        <div className="text-xs text-gray-400">Chat with VoiceFlow outside meetings</div>
                      </div>
                    </div>
                    <Switch checked={ambientChat} onCheckedChange={setAmbientChat} className="data-[state=checked]:bg-voiceflow-orange" />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-[#1A1A1A] rounded-xl border border-gray-800">
                    <div className="flex items-center gap-4">
                      <div className="bg-[#2A2A2A] p-2 rounded-lg"><Palette size={20} className="text-gray-300" /></div>
                      <div>
                        <div className="text-sm font-bold text-white">Color Theme</div>
                        <div className="text-xs text-gray-400">Use light, dark, or match your system theme</div>
                      </div>
                    </div>
                    <select 
                      value={theme}
                      onChange={(e) => setTheme(e.target.value)}
                      className="bg-[#222222] border border-gray-700 text-sm rounded-md px-3 py-1.5 text-white outline-none focus:border-voiceflow-orange"
                    >
                      <option value="system">System</option>
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-white mb-1">Audio Settings</h3>
                <p className="text-xs text-gray-400 mb-4">Test your audio input before you hop into a call.</p>
                
                <div className="flex items-center justify-between p-4 bg-[#1A1A1A] rounded-xl border border-gray-800">
                  <div className="flex items-start gap-3">
                    <Mic size={16} className="text-gray-400 mt-1" />
                    <div>
                      <div className="text-sm font-bold text-white mb-1">Microphone Source</div>
                      <div className="text-xs text-gray-400 max-w-[280px]">Default - Microphone Array (Intel® Smart Sound Technology for Digital Microphones)</div>
                    </div>
                  </div>
                  <button className="bg-[#2A2A2A] hover:bg-[#333333] border border-gray-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors">
                    Test Microphone
                  </button>
                </div>
              </div>
              
              <div>
                <button className="w-full flex items-center justify-between">
                  <div className="text-left">
                     <h3 className="text-sm font-bold text-white mb-0.5">Advanced</h3>
                     <p className="text-xs text-gray-500">Configure additional VoiceFlow features</p>
                  </div>
                  <ChevronDown size={16} className="text-gray-500" />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'keybinds' && (
            <div className="space-y-8 max-w-2xl">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Keyboard shortcuts</h2>
                <p className="text-sm text-gray-400 mb-6">VoiceFlow works with these easy to remember commands. Click any of the keybinds to edit.</p>
                
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-3 text-xs font-bold">
                       <span className="text-white">General</span>
                       <span className="text-gray-500 tracking-wider">TYPE SHORTCUT / CLICK 2X TO RESET</span>
                    </div>
                    
                    <div className="space-y-1">
                      <ShortcutRow icon="🖥️" label="Toggle visibility of VoiceFlow" keys={['Ctrl', '`']} />
                      <ShortcutRow icon="💬" label="Ask VoiceFlow about your screen or audio" keys={['Ctrl', '↵']} />
                      <ShortcutRow icon="🧹" label="Clear the current conversation with VoiceFlow" keys={['Ctrl', 'R']} />
                      <ShortcutRow icon="🎙️" label="Start or stop a VoiceFlow session" keys={['Ctrl', 'Shift', '\\']} />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3 text-xs font-bold text-white">Window</div>
                    <div className="space-y-1">
                      <ShortcutRow icon="↑" label="Move the window position up" keys={['Ctrl', '↑']} />
                      <ShortcutRow icon="↓" label="Move the window position down" keys={['Ctrl', '↓']} />
                      <ShortcutRow icon="←" label="Move the window position left" keys={['Ctrl', '←']} />
                      <ShortcutRow icon="→" label="Move the window position right" keys={['Ctrl', '→']} />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3 text-xs font-bold text-white">Scroll</div>
                    <div className="space-y-1">
                      <ShortcutRow icon="↑" label="Scroll the response window up" keys={['Ctrl', 'Shift', '↑']} />
                      <ShortcutRow icon="↓" label="Scroll the response window down" keys={['Ctrl', 'Shift', '↓']} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Placeholder for other tabs */}
          {activeTab !== 'general' && activeTab !== 'keybinds' && (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
               <Settings size={48} className="mb-4 opacity-20" />
               <p>This section is under construction.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShortcutRow({ icon, label, keys }: { icon: string, label: string, keys: string[] }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-[#1A1A1A] group transition-colors cursor-pointer">
      <div className="flex items-center gap-3">
        <span className="text-gray-400 text-sm">{icon}</span>
        <span className="text-sm font-semibold text-gray-200">{label}</span>
      </div>
      <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
        {keys.map((k, i) => (
          <kbd key={i} className="bg-[#2A2A2A] text-gray-300 px-2 py-1 rounded text-xs font-mono font-medium border border-[#333]">
            {k}
          </kbd>
        ))}
      </div>
    </div>
  )
}
