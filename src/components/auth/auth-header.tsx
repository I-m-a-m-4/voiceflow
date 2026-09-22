import React from 'react';
import Link from 'next/link';
import { AppConfig } from '@/lib/config';

export default function AuthHeader() {
  return (
    <div className="absolute top-0 left-0 right-0 h-16 bg-white flex items-center justify-center border-b border-gray-100 z-50">
      <Link href="/" className="flex items-center gap-2 transition-transform hover:scale-105">
        {/* Simple text logo to mimic the Otter image for now if no image is suitable, but we have AppConfig.logoUrl */}
        <span className="font-bold text-otter-blue text-2xl tracking-tight">VoiceFlow</span>
      </Link>
    </div>
  );
}
