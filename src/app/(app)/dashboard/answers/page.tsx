"use client";

import React, { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { MessageSquare, Monitor, Keyboard, Wand2 } from 'lucide-react';

export default function LiveAnswersPage() {
  const [copilotEnabled, setCopilotEnabled] = useState(true);
  const [proactiveMode, setProactiveMode] = useState(false);
  const [overlayPosition, setOverlayPosition] = useState('bottom-right');
  const [customContext, setCustomContext] = useState('');

  return (
    <div className="p-8 max-w-4xl mx-auto h-full flex flex-col">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Live Answers</h1>
        <p className="text-gray-500 dark:text-gray-400">Your AI co-pilot that provides real-time answers and coaching during meetings.</p>
      </div>
      
      <div className="space-y-6">
        {/* Main Toggles */}
        <div className="bg-white dark:bg-[#111111] border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="bg-orange-100 dark:bg-orange-500/20 p-2.5 rounded-xl">
                  <MessageSquare size={24} className="text-voiceflow-orange" />
                </div>
                <div>
                  <div className="text-base font-bold text-gray-900 dark:text-white mb-1">Enable Live Answers Overlay</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 max-w-lg">Displays an unobtrusive overlay during meetings that allows you to ask VoiceFlow questions privately.</div>
                </div>
              </div>
              <Switch checked={copilotEnabled} onCheckedChange={setCopilotEnabled} className="data-[state=checked]:bg-voiceflow-orange" />
            </div>

            <div className="flex items-start justify-between pt-6 border-t border-gray-100 dark:border-gray-800/50">
              <div className="flex items-start gap-4">
                <div className="bg-blue-50 dark:bg-blue-500/10 p-2.5 rounded-xl">
                  <Wand2 size={24} className="text-blue-500" />
                </div>
                <div>
                  <div className="text-base font-bold text-gray-900 dark:text-white mb-1">Proactive Coaching</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 max-w-lg">AI will automatically suggest answers and hints when it detects you're being asked a question.</div>
                </div>
              </div>
              <Switch checked={proactiveMode} onCheckedChange={setProactiveMode} className="data-[state=checked]:bg-voiceflow-orange" />
            </div>
          </div>
        </div>

        {/* Layout & Hotkeys */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-[#111111] border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Monitor size={18} className="text-gray-700 dark:text-gray-300" />
              <h3 className="font-bold text-gray-900 dark:text-white">Overlay Position</h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Select where the UI should appear on your screen.</p>
            
            <div className="grid grid-cols-2 gap-3">
              {['top-right', 'top-left', 'bottom-right', 'bottom-left'].map((pos) => (
                <button 
                  key={pos}
                  onClick={() => setOverlayPosition(pos)}
                  className={`py-2 px-3 rounded-lg border text-xs font-semibold capitalize flex items-center justify-center transition-all ${
                    overlayPosition === pos 
                      ? 'border-voiceflow-orange bg-orange-50 dark:bg-orange-500/10 text-voiceflow-orange' 
                      : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-[#161616] text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-700'
                  }`}
                >
                  {pos.replace('-', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-[#111111] border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Keyboard size={18} className="text-gray-700 dark:text-gray-300" />
              <h3 className="font-bold text-gray-900 dark:text-white">Quick Trigger</h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Use this shortcut to instantly focus the input bar during a meeting.</p>
            
            <div className="bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex items-center justify-center">
              <div className="flex items-center gap-2">
                <kbd className="bg-white dark:bg-[#2A2A2A] text-gray-800 dark:text-gray-200 px-3 py-1.5 rounded-md text-sm font-mono font-bold border border-gray-300 dark:border-gray-700 shadow-sm">Ctrl</kbd>
                <span className="text-gray-400">+</span>
                <kbd className="bg-white dark:bg-[#2A2A2A] text-gray-800 dark:text-gray-200 px-3 py-1.5 rounded-md text-sm font-mono font-bold border border-gray-300 dark:border-gray-700 shadow-sm">Enter</kbd>
              </div>
            </div>
          </div>
        </div>

        {/* Custom Context */}
        <div className="bg-white dark:bg-[#111111] border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Custom System Instructions</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Give the AI specific instructions on how to behave, respond, and what your role is so it gives you perfect context.</p>
          
          <textarea
            value={customContext}
            onChange={(e) => setCustomContext(e.target.value)}
            placeholder="e.g. I am a Senior Software Engineer interviewing for a role at Google. My primary stack is React, Next.js, and Python. When giving me answers, keep them concise and technical, focusing on system design."
            className="w-full h-32 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-800 rounded-xl p-4 text-sm text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-voiceflow-orange/50 focus:border-voiceflow-orange resize-none transition-all"
          />
          <div className="flex justify-end mt-4">
            <button className="bg-voiceflow-orange hover:bg-orange-600 text-white px-6 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm">
              Save Context
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
