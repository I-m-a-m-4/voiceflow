"use client";
import React from 'react';
export function DevicePlatformAdoptionSection(props: any) { return null; }
export function classifyUserPlatform(u?: any): { hasMicrosoftApp: boolean; hasMobileApp: boolean; hasWeb: boolean; isCrossPlatform: boolean } {
  return { hasMicrosoftApp: false, hasMobileApp: false, hasWeb: true, isCrossPlatform: false };
}
export function isVersionLatest(u?: any) { return true; }
export function isVersionOutdated(u?: any) { return false; }
export default DevicePlatformAdoptionSection;
