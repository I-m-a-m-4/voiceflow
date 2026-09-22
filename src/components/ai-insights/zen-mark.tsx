"use client";

import React from 'react';
import { Sparkles } from 'lucide-react';

export function ZenMark({ className, animated }: { className?: string; animated?: boolean }) {
  return <Sparkles className={className} />;
}
