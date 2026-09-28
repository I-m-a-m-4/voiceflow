"use client";

import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

interface PlanDistributionChartProps {
  businesses?: any[];
  users?: any[];
}

const COLORS = ['#10b981', '#8b5cf6', '#64748b', '#f59e0b'];

export function PlanDistributionChart({ businesses = [], users = [] }: PlanDistributionChartProps) {
  const chartData = useMemo(() => {
    let proCount = 0;
    let enterpriseCount = 0;
    let freeCount = 0;
    let lifetimeCount = 0;

    // Aggregate from users
    if (users && users.length > 0) {
      users.forEach((u) => {
        const plan = (u.subscriptionPlan || u.planTier || u.plan || '').toLowerCase();
        if (plan.includes('pro')) {
          proCount++;
        } else if (plan.includes('enterprise') || plan.includes('team') || plan.includes('business')) {
          enterpriseCount++;
        } else if (plan.includes('lifetime')) {
          lifetimeCount++;
        } else {
          freeCount++;
        }
      });
    } else {
      // Fallback to businesses if users list is empty
      businesses.forEach((b) => {
        const plan = (b.plan || '').toLowerCase();
        if (b.accessLevel === 'lifetime') lifetimeCount++;
        else if (plan.includes('pro')) proCount++;
        else if (plan.includes('business')) enterpriseCount++;
        else freeCount++;
      });
    }

    const total = proCount + enterpriseCount + freeCount + lifetimeCount;

    return [
      { name: 'Pro Plan', value: proCount, color: '#10b981' },
      { name: 'Enterprise / Team', value: enterpriseCount, color: '#8b5cf6' },
      { name: 'Free Tier', value: freeCount, color: '#64748b' },
      ...(lifetimeCount > 0 ? [{ name: 'Lifetime', value: lifetimeCount, color: '#f59e0b' }] : []),
    ].filter(item => total === 0 || item.value > 0);
  }, [users, businesses]);

  const totalUsers = useMemo(() => {
    return chartData.reduce((acc, curr) => acc + curr.value, 0);
  }, [chartData]);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center justify-between">
          <span>Plan & Subscription Distribution</span>
          <span className="text-xs font-normal text-muted-foreground">{totalUsers} Total Accounts</span>
        </CardTitle>
        <CardDescription>
          Active breakdown of Voiceflow accounts across Pro, Enterprise, and Free tiers.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={4}
                dataKey="value"
                label={({ name, percent }: any) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(val: any) => [`${val} Users`, 'Total']}
                contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#0f172a' }}
              />
              <Legend verticalAlign="bottom" height={36} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export default PlanDistributionChart;
