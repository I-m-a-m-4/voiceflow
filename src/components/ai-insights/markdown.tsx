"use client";

import React from 'react';

export function Markdown({ content, children, className }: { content?: string; children?: React.ReactNode; className?: string }) {
  const text = content ?? (typeof children === 'string' ? children : '');
  return <div className={`prose text-sm ${className || ''}`}>{text}</div>;
}
