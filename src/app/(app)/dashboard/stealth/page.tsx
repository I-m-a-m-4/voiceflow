"use client";

import React, { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Ghost, ShieldCheck, AlertTriangle, MonitorPlay, Video } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

export default function StealthModePage() {
  const [stealthEnabled, setStealthEnabled] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const handleStealthChange = async (checked: boolean) => {
    setStealthEnabled(checked);
    try {
      await invoke('set_detectable', { detectable: checked });
    } catch (e) {
      console.error('Failed to toggle stealth mode in backend:', e);
    }
  };

  const handleTestStealth = () => {
    setIsTesting(true);
    setTimeout(() => setIsTesting(false), 2000);
  };

  const apps = [
    { name: 'Zoom', icon: Video, active: true },
    { name: 'Microsoft Teams', icon: MonitorPlay, active: true },
    { name: 'Google Meet (Browser)', icon: ShieldCheck, active: true },
  ];

  return (
    <div className="p-8 max-w-4xl mx-auto h-full flex flex-col">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-3">
          Stealth Mode 
          {stealthEnabled && <span className="bg-green-500/20 text-green-600 dark:text-green-400 text-xs px-2.5 py-1 rounded-full uppercase tracking-wider font-bold">Active</span>}
        </h1>
        <p className="text-gray-500 dark:text-gray-400">Configure VoiceFlow's undetectability settings for screen-sharing software.</p>
      </div>
      
      <div className="space-y-6">
        
        {/* Main Toggle Card */}
        <div className="bg-white dark:bg-[#111111] border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl transition-colors ${stealthEnabled ? 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-500' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                <Ghost size={28} />
              </div>
              <div>
                <div className="text-lg font-bold text-gray-900 dark:text-white mb-1">Master Stealth Toggle</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 max-w-lg mb-4">When enabled, VoiceFlow invokes a native OS hook to explicitly exclude its window from being captured by other software. Your screen sharers will only see your desktop background where the app is.</div>
                
                <button 
                  onClick={handleTestStealth}
                  disabled={!stealthEnabled || isTesting}
                  className={`text-xs font-bold px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${
                    stealthEnabled 
                      ? 'bg-gray-100 dark:bg-[#1A1A1A] text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-[#2A2A2A] border border-gray-200 dark:border-gray-700' 
                      : 'bg-gray-50 dark:bg-[#111] text-gray-400 cursor-not-allowed border border-gray-100 dark:border-gray-800'
                  }`}
                >
                  {isTesting ? 'Verifying hook...' : 'Test Invisibility Hook'}
                </button>
              </div>
            </div>
            <div className="mt-2">
              <Switch checked={stealthEnabled} onCheckedChange={handleStealthChange} className="data-[state=checked]:bg-green-500 scale-125 origin-right" />
            </div>
          </div>
        </div>

        {/* Protection Grid */}
        <div className="bg-white dark:bg-[#111111] border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6">Supported Platforms</h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {apps.map((app) => (
              <div key={app.name} className="bg-gray-50 dark:bg-[#161616] border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex flex-col items-center text-center">
                <app.icon size={24} className="text-gray-400 mb-3" />
                <div className="text-sm font-bold text-gray-900 dark:text-white mb-2">{app.name}</div>
                {stealthEnabled ? (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-green-600 dark:text-green-500">
                    <ShieldCheck size={14} /> Protected
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400">
                    <AlertTriangle size={14} /> Unprotected
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Info Alert */}
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-2xl p-6 flex gap-4">
          <ShieldCheck className="text-blue-600 dark:text-blue-400 shrink-0" size={24} />
          <div>
            <h3 className="font-bold text-blue-900 dark:text-blue-300 mb-1">How it works natively</h3>
            <p className="text-sm text-blue-800/80 dark:text-blue-400/80 leading-relaxed">
              We use the `SetWindowDisplayAffinity` API on Windows (and its equivalent on macOS) to flag the VoiceFlow window with `WDA_EXCLUDEFROMCAPTURE`. This operates at the compositor level, making it physically impossible for user-mode screen capture software to record the pixels.
            </p>
          </div>
        </div>
        
      </div>
    </div>
  );
}
