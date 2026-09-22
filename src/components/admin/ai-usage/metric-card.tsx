"use client";
import React from 'react';

export type SparkPoint = any;

export function MetricCard(props: any) {
  return <div className="p-4 rounded-xl border bg-card">{props.children}</div>;
}

export function DetailRow(props: any) {
  return null;
}

export function ReferenceNote(props: any) {
  return null;
}

export default MetricCard;
