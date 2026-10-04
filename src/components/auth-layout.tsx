'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="w-full min-h-screen flex flex-col items-center justify-center bg-background font-jakarta px-4">
      {/* Logo */}
      <div className="mb-8">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/icon.svg"
            alt="VoiceFlow Logo"
            width={36}
            height={36}
            className="rounded-xl"
          />
          <span className="font-bold text-xl tracking-tight text-foreground font-clash">VoiceFlow</span>
        </Link>
      </div>

      {/* Form Card */}
      <div className="w-full max-w-sm">
        {children}
      </div>

      {/* Footer */}
      <p className="mt-10 text-xs text-muted-foreground text-center">
        &copy; {new Date().getFullYear()} VoiceFlow. Protected by enterprise-grade encryption.
      </p>
    </div>
  );
}
