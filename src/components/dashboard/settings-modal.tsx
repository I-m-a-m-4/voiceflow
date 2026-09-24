"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Settings, Calendar, Keyboard, User, Shield, Globe, CreditCard, FileText, HelpCircle, LifeBuoy, LogOut, Power, X, Download, Eye, Headphones, Palette, Mic, ChevronDown } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuth } from '@/firebase';
import { invoke } from '@tauri-apps/api/core';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenBilling?: () => void;
}

export function SettingsModal({ isOpen, onClose, onOpenBilling }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState('general');
  const { theme, setTheme } = useTheme();
  const auth = useAuth();

  const [detectable, setDetectable] = useState(false);
  const [ambientChat, setAmbientChat] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  
  const handleDetectableChange = async (checked: boolean) => {
    setDetectable(checked);
    try {
      await invoke('set_detectable', { detectable: checked });
    } catch (e) {
      console.error('Failed to set detectable mode:', e);
    }
  };

  const handleMockAction = (actionName: string) => {
    alert(`The action "${actionName}" is not fully integrated yet, but the UI is responsive.`);
  };

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
            <button onClick={() => handleMockAction('Sign Out')} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1E1E1E] hover:text-gray-900 dark:hover:text-gray-200 transition-colors">
              <LogOut size={16} />
              Sign out
            </button>
            <button onClick={() => handleMockAction('Quit VoiceFlow')} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1E1E1E] hover:text-gray-900 dark:hover:text-gray-200 transition-colors">
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
                        <div className="text-sm font-bold text-gray-900 dark:text-white">VoiceFlow Version</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Downloading update from version 2.0.196 to 2.0.197</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => window.open('ms-windows-store://pdp/?productid=9WZDNCRFHVJL', '_blank')}
                      className="text-xs text-white bg-voiceflow-orange hover:bg-orange-600 px-4 py-2 rounded-md font-bold transition-colors shadow-sm"
                    >
                      Check for Updates
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-gray-800">
                    <div className="flex items-center gap-4">
                      <div className="bg-gray-100 dark:bg-[#2A2A2A] p-2 rounded-lg"><Eye size={20} className="text-gray-700 dark:text-gray-300" /></div>
                      <div>
                        <div className="text-sm font-bold text-gray-900 dark:text-white">Detectable</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">VoiceFlow is currently detectable by screen-sharing</div>
                      </div>
                    </div>
                    <Switch checked={detectable} onCheckedChange={handleDetectableChange} className="data-[state=checked]:bg-voiceflow-orange" />
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

              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Audio Settings</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Test your audio input before you hop into a call.</p>
                
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-gray-800">
                  <div className="flex items-start gap-3">
                    <Mic size={16} className="text-gray-500 dark:text-gray-400 mt-1" />
                    <div>
                      <div className="text-sm font-bold text-gray-900 dark:text-white mb-1">Microphone Source</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 max-w-[280px]">Default - Microphone Array (Intel® Smart Sound Technology for Digital Microphones)</div>
                    </div>
                  </div>
                  <button onClick={() => handleMockAction('Test Microphone')} className="bg-gray-200 dark:bg-[#2A2A2A] hover:bg-gray-300 dark:hover:bg-[#333333] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors">
                    Test Microphone
                  </button>
                </div>
              </div>
              
              <div>
                <button className="w-full flex items-center justify-between group">
                  <div className="text-left">
                     <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-0.5 group-hover:text-voiceflow-orange transition-colors">Advanced</h3>
                     <p className="text-xs text-gray-500 dark:text-gray-400">Configure additional VoiceFlow features</p>
                  </div>
                  <ChevronDown size={16} className="text-gray-500 group-hover:text-voiceflow-orange transition-colors" />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'keybinds' && (
            <div className="space-y-8 max-w-2xl">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Keyboard shortcuts</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">VoiceFlow works with these easy to remember commands. Click any of the keybinds to edit.</p>
                
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-3 text-xs font-bold">
                       <span className="text-gray-900 dark:text-white">General</span>
                       <span className="text-gray-500 dark:text-gray-400 tracking-wider">TYPE SHORTCUT / CLICK 2X TO RESET</span>
                    </div>
                    
                    <div className="space-y-1">
                      <ShortcutRow icon="🖥️" label="Toggle visibility of VoiceFlow" keys={['Ctrl', '`']} />
                      <ShortcutRow icon="💬" label="Ask VoiceFlow about your screen or audio" keys={['Ctrl', '↵']} />
                      <ShortcutRow icon="🧹" label="Clear the current conversation with VoiceFlow" keys={['Ctrl', 'R']} />
                      <ShortcutRow icon="🎙️" label="Start or stop a VoiceFlow session" keys={['Ctrl', 'Shift', '\\']} />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3 text-xs font-bold text-gray-900 dark:text-white">Window</div>
                    <div className="space-y-1">
                      <ShortcutRow icon="↑" label="Move the window position up" keys={['Ctrl', '↑']} />
                      <ShortcutRow icon="↓" label="Move the window position down" keys={['Ctrl', '↓']} />
                      <ShortcutRow icon="←" label="Move the window position left" keys={['Ctrl', '←']} />
                      <ShortcutRow icon="→" label="Move the window position right" keys={['Ctrl', '→']} />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3 text-xs font-bold text-gray-900 dark:text-white">Scroll</div>
                    <div className="space-y-1">
                      <ShortcutRow icon="↑" label="Scroll the response window up" keys={['Ctrl', 'Shift', '↑']} />
                      <ShortcutRow icon="↓" label="Scroll the response window down" keys={['Ctrl', 'Shift', '↓']} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'calendar' && (
            <div className="space-y-8 max-w-2xl">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Calendar & Integrations</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Connect your calendars to sync your schedule.</p>
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
                         <div className="text-xs text-gray-500 dark:text-gray-400">Sync with your Google account</div>
                       </div>
                    </div>
                    <button onClick={() => handleMockAction('Connect Google Calendar')} className="text-xs bg-gray-200 dark:bg-[#2A2A2A] hover:bg-gray-300 dark:hover:bg-[#333333] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white font-semibold px-4 py-2 rounded-lg transition-colors">Connect</button>
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
                         <div className="text-xs text-gray-500 dark:text-gray-400">Sync with your Microsoft account</div>
                       </div>
                    </div>
                    <button onClick={() => handleMockAction('Connect Outlook Calendar')} className="text-xs bg-gray-200 dark:bg-[#2A2A2A] hover:bg-gray-300 dark:hover:bg-[#333333] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white font-semibold px-4 py-2 rounded-lg transition-colors">Connect</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="space-y-8 max-w-2xl">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Your Profile</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Manage your personal information.</p>
                <div className="flex items-center gap-6 mb-8">
                   <div className="w-20 h-20 rounded-full bg-voiceflow-orange flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-orange-900/20">
                     {auth?.currentUser?.displayName?.charAt(0).toUpperCase() || 'U'}
                   </div>
                   <div>
                     <button onClick={() => handleMockAction('Change Avatar')} className="text-sm bg-gray-200 dark:bg-[#2A2A2A] hover:bg-gray-300 dark:hover:bg-[#333333] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white font-semibold px-4 py-2 rounded-lg transition-colors mb-2">Change Avatar</button>
                     <p className="text-xs text-gray-500 dark:text-gray-400">JPG, GIF or PNG. 1MB max.</p>
                   </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-1.5">Display Name</label>
                    <input type="text" defaultValue={auth?.currentUser?.displayName || 'User'} className="w-full bg-white dark:bg-[#1A1A1A] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-voiceflow-orange text-sm shadow-sm" />
                  </div>
                  <div>
                    <label className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-1.5">Email Address</label>
                    <input type="email" disabled defaultValue={auth?.currentUser?.email || ''} className="w-full bg-gray-100 dark:bg-[#111111] border border-gray-200 dark:border-gray-800 text-gray-500 rounded-lg px-4 py-2.5 text-sm cursor-not-allowed opacity-70" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-8 max-w-2xl">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Security Settings</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Protect your account and data.</p>
                
                <div className="space-y-4 mb-8">
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-gray-800">
                    <div>
                      <div className="text-sm font-bold text-gray-900 dark:text-white">Two-Factor Authentication</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Add an extra layer of security to your account.</div>
                    </div>
                    <button onClick={() => setMfaEnabled(!mfaEnabled)} className="text-xs bg-voiceflow-orange hover:bg-orange-600 text-white font-semibold px-4 py-2 rounded-lg transition-colors">
                      {mfaEnabled ? 'Disable 2FA' : 'Enable 2FA'}
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-gray-800">
                    <div>
                      <div className="text-sm font-bold text-gray-900 dark:text-white">Change Password</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Update your password regularly to keep your account safe.</div>
                    </div>
                    <button onClick={() => handleMockAction('Update Password')} className="text-xs bg-gray-200 dark:bg-[#2A2A2A] hover:bg-gray-300 dark:hover:bg-[#333333] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white font-semibold px-4 py-2 rounded-lg transition-colors">Update</button>
                  </div>
                </div>

                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Active Sessions</h3>
                <div className="bg-gray-50 dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                   <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                     <div className="flex items-center gap-3">
                       <div className="bg-green-500/10 p-2 rounded-md"><Globe size={16} className="text-green-600 dark:text-green-500" /></div>
                       <div>
                         <div className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">Windows (Current) <span className="bg-green-500/20 text-green-700 dark:text-green-500 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Active</span></div>
                         <div className="text-xs text-gray-500 dark:text-gray-400">Lagos, NG • Just now</div>
                       </div>
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
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Set your preferred language for the interface.</p>
                
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

          {activeTab === 'billing' && (
            <div className="space-y-8 max-w-2xl">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Billing & Plans</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Manage your subscription and payment methods.</p>
                
                <div className="bg-gray-50 dark:bg-[#1A1A1A] p-6 rounded-xl border border-gray-200 dark:border-gray-800 mb-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Basic Plan</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">You are currently on the free tier.</p>
                  </div>
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">$0<span className="text-sm text-gray-500 font-medium">/mo</span></span>
                </div>
                
                <button 
                  onClick={() => {
                    onClose();
                    onOpenBilling?.();
                  }} 
                  className="w-full bg-voiceflow-orange hover:bg-orange-600 text-white py-3 rounded-xl font-bold text-sm transition-colors shadow-lg shadow-orange-900/20 flex items-center justify-center gap-2"
                >
                  <CreditCard size={18} />
                  Upgrade to Pro (View Plans & Checkout)
                </button>
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
                   {activeTab === 'release-notes' ? "What's new in VoiceFlow." : activeTab === 'help-center' ? "Browse guides and tutorials." : "Get in touch with our team."}
                </p>
                
                <div className="flex flex-col items-center justify-center p-12 bg-gray-50 dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-gray-800 border-dashed text-center">
                   {activeTab === 'release-notes' && <FileText size={32} className="text-gray-400 dark:text-gray-600 mb-3" />}
                   {activeTab === 'help-center' && <HelpCircle size={32} className="text-gray-400 dark:text-gray-600 mb-3" />}
                   {activeTab === 'contact' && <LifeBuoy size={32} className="text-gray-400 dark:text-gray-600 mb-3" />}
                   <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">Content available online</h3>
                   <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">This content is hosted on our website to ensure it's always up to date.</p>
                   <button 
                     onClick={() => window.open('https://voiceflow.space', '_blank')}
                     className="text-xs bg-gray-200 dark:bg-[#2A2A2A] hover:bg-gray-300 dark:hover:bg-[#333333] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white font-semibold px-4 py-2 rounded-lg transition-colors"
                   >
                     View on web
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
  )
}
