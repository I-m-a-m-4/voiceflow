"use client";

import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { format, subDays } from 'date-fns';

interface TransactionVolumeChartProps {
  receipts?: any[];
  checkoutAttempts?: any[];
  purchases?: any[];
}

export function TransactionVolumeChart({ receipts = [], checkoutAttempts = [], purchases = [] }: TransactionVolumeChartProps) {
  const chartData = useMemo(() => {
    const dayMap = new Map<string, { date: string; attempts: number; completed: number }>();
    for (let i = 13; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const key = format(d, 'yyyy-MM-dd');
      dayMap.set(key, {
        date: format(d, 'MMM d'),
        attempts: 0,
        completed: 0,
      });
    }

    checkoutAttempts.forEach((c) => {
      let date: Date | null = null;
      if (c.timestamp?.toDate) date = c.timestamp.toDate();
      else if (c.timestamp?.seconds) date = new Date(c.timestamp.seconds * 1000);
      else if (c.timestamp) date = new Date(c.timestamp);

      if (date && !isNaN(date.getTime())) {
        const key = format(date, 'yyyy-MM-dd');
        if (dayMap.has(key)) {
          dayMap.get(key)!.attempts += 1;
        }
      }
    });

    purchases.forEach((p) => {
      let date: Date | null = null;
      if (p.createdAt?.toDate) date = p.createdAt.toDate();
      else if (p.createdAt?.seconds) date = new Date(p.createdAt.seconds * 1000);
      else if (p.date) date = new Date(p.date);

      if (date && !isNaN(date.getTime())) {
        const key = format(date, 'yyyy-MM-dd');
        if (dayMap.has(key)) {
          dayMap.get(key)!.completed += 1;
        }
      }
    });

    return Array.from(dayMap.values());
  }, [checkoutAttempts, purchases]);

  const totalAttempts = useMemo(() => checkoutAttempts.length, [checkoutAttempts]);
  const totalCompleted = useMemo(() => purchases.length, [purchases]);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center justify-between">
          <span>Checkout Volume & Conversions</span>
          <span className="text-xs font-normal text-muted-foreground">{totalAttempts} Attempts / {totalCompleted} Paid</span>
        </CardTitle>
        <CardDescription>
          Comparison between initiated checkouts and completed transactions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.2)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#0f172a' }}
              />
              <Legend verticalAlign="bottom" height={36} />
              <Bar dataKey="attempts" name="Checkout Attempts" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="completed" name="Completed Purchases" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export default TransactionVolumeChart;
