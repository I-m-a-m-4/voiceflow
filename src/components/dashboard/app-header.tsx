"use client";

import React from 'react';
import { Search, Video, Upload, Mic } from 'lucide-react';
import { Input } from '@/components/ui/input';

export default function AppHeader() {
  return (
    <div className="flex flex-col border-b border-gray-200 bg-white">
      {/* Promotional Banner */}
      <div className="bg-blue-900 text-white text-xs py-1.5 px-4 flex items-center justify-center gap-4">
        <div className="flex items-center gap-2">
          <span className="bg-blue-500 p-0.5 rounded text-[10px] font-bold">zoom</span>
          <span>Connect your Zoom account so VoiceFlow can join meetings you host</span>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-0.5 border border-white/30 rounded-full hover:bg-white/10 transition-colors">Learn more</button>
          <button className="px-3 py-0.5 bg-white text-blue-900 rounded-full font-semibold hover:bg-gray-100 transition-colors">Connect</button>
        </div>
      </div>

      {/* Main Header Row */}
      <header className="flex items-center justify-between h-14 px-4 bg-[#F9F9F9]">
        <div className="flex-1 max-w-xl relative group">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400 group-focus-within:text-otter-blue" />
          </div>
          <Input 
            type="text" 
            placeholder="Ask or search" 
            className="w-full pl-10 h-9 bg-white border-gray-300 rounded-full focus-visible:ring-1 focus-visible:ring-otter-blue shadow-sm text-sm"
          />
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <span className="text-xs text-gray-400 font-medium">CtrlK</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="p-2 text-gray-500 hover:bg-gray-200 rounded-full transition-colors">
            <Video size={18} />
          </button>
          <button className="flex items-center gap-2 px-4 py-1.5 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-full hover:bg-gray-50 shadow-sm transition-colors">
            <Upload size={16} />
            Import
          </button>
          <button className="flex items-center gap-2 px-5 py-1.5 text-sm font-semibold text-white bg-otter-blue rounded-full hover:bg-blue-700 shadow-sm transition-colors shadow-blue-500/20">
            <Mic size={16} />
            Record
          </button>
        </div>
      </header>
    </div>
  );
}
