'use client';

import React, { useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Clock,
  Mic,
  FileText,
  Activity,
  Users,
  Search,
  Sparkles,
  ChevronRight,
  TrendingUp,
  Headphones,
  CheckCircle2,
  Calendar,
  Zap,
  ArrowUpRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, formatDistanceToNow } from 'date-fns';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts';

interface VoiceflowSessionAnalyticsProps {
  meetings: any[];
  users: any[];
  purchases?: any[];
}

export default function VoiceflowSessionAnalytics({
  meetings = [],
  users = [],
  purchases = [],
}: VoiceflowSessionAnalyticsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'meeting' | 'dictation'>('all');
  const [selectedMeeting, setSelectedMeeting] = useState<any | null>(null);

  // Helper to extract or estimate meeting duration in minutes
  const getMeetingDurationMinutes = (m: any): number => {
    if (typeof m.durationMinutes === 'number' && m.durationMinutes > 0) {
      return Math.round(m.durationMinutes);
    }
    if (typeof m.durationSeconds === 'number' && m.durationSeconds > 0) {
      return Math.max(1, Math.round(m.durationSeconds / 60));
    }
    // Estimate based on transcript speech rate (~140 words per minute)
    if (typeof m.transcript === 'string' && m.transcript.trim().length > 0) {
      const words = m.transcript.trim().split(/\s+/).length;
      return Math.max(1, Math.round(words / 140));
    }
    return 5; // Default sensible fallback
  };

  // Helper to normalize timestamp
  const getMeetingDate = (m: any): Date => {
    if (!m.createdAt) return new Date();
    if (typeof m.createdAt.toDate === 'function') return m.createdAt.toDate();
    if (m.createdAt.seconds) return new Date(m.createdAt.seconds * 1000);
    if (m.createdAt instanceof Date) return m.createdAt;
    const parsed = new Date(m.createdAt);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  };

  // Analytics Computation
  const stats = useMemo(() => {
    let totalMinutes = 0;
    let meetingTypeCount = 0;
    let dictationTypeCount = 0;

    const durationBuckets = {
      short: { label: '< 15 mins (Quick Huddle)', count: 0, minutes: 0 },
      medium: { label: '15 - 30 mins (Standard)', count: 0, minutes: 0 },
      long: { label: '30 - 60 mins (In-Depth / Interview)', count: 0, minutes: 0 },
      extended: { label: '60+ mins (Deep Dive)', count: 0, minutes: 0 },
    };

    const dailyMinutesMap: Record<string, { date: string; minutes: number; sessions: number }> = {};

    meetings.forEach((m) => {
      const duration = getMeetingDurationMinutes(m);
      totalMinutes += duration;

      if (m.type === 'dictation') {
        dictationTypeCount++;
      } else {
        meetingTypeCount++;
      }

      if (duration < 15) {
        durationBuckets.short.count++;
        durationBuckets.short.minutes += duration;
      } else if (duration <= 30) {
        durationBuckets.medium.count++;
        durationBuckets.medium.minutes += duration;
      } else if (duration <= 60) {
        durationBuckets.long.count++;
        durationBuckets.long.minutes += duration;
      } else {
        durationBuckets.extended.count++;
        durationBuckets.extended.minutes += duration;
      }

      const dateObj = getMeetingDate(m);
      const dateKey = format(dateObj, 'MMM d');
      if (!dailyMinutesMap[dateKey]) {
        dailyMinutesMap[dateKey] = { date: dateKey, minutes: 0, sessions: 0 };
      }
      dailyMinutesMap[dateKey].minutes += duration;
      dailyMinutesMap[dateKey].sessions += 1;
    });

    // Also factor in logged user usage minutes
    const usersTotalMinutes = users.reduce((acc, u) => acc + (u.usedMinutes || 0), 0);
    const combinedMinutes = Math.max(totalMinutes, usersTotalMinutes);

    const avgDuration = meetings.length > 0 ? Math.round(totalMinutes / meetings.length) : 0;
    const totalHours = (combinedMinutes / 60).toFixed(1);

    // Active users in last 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeSessionsToday = meetings.filter((m) => getMeetingDate(m) > oneDayAgo).length;

    // Daily trend data (last 14 days)
    const trendData = Object.values(dailyMinutesMap).slice(-14);

    return {
      totalMeetings: meetings.length,
      totalMinutes: combinedMinutes,
      totalHours,
      avgDuration,
      meetingTypeCount,
      dictationTypeCount,
      activeSessionsToday,
      durationBuckets,
      trendData,
    };
  }, [meetings, users]);

  // Filtered meetings list
  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      const matchesSearch =
        !searchQuery ||
        (m.title && m.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (m.transcript && m.transcript.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (m.summary && m.summary.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (m.userId && m.userId.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesType =
        selectedType === 'all' ||
        (selectedType === 'meeting' && m.type !== 'dictation') ||
        (selectedType === 'dictation' && m.type === 'dictation');

      return matchesSearch && matchesType;
    });
  }, [meetings, searchQuery, selectedType]);

  // Find user details by userId
  const getUserInfo = (userId?: string) => {
    if (!userId) return { name: 'Anonymous', email: 'user@voiceflow.ai' };
    const u = users.find((item) => item.id === userId || item.uid === userId);
    if (!u) return { name: 'User ' + userId.slice(0, 6), email: userId };
    return {
      name: u.displayName || u.name || 'Voiceflow User',
      email: u.email || 'user@voiceflow.ai',
      isPro: u.isPro || u.planTier === 'pro',
    };
  };

  return (
    <div className="space-y-6">
      {/* Top Voiceflow Session Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-orange-500/20 bg-gradient-to-br from-card via-card to-orange-500/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Clock className="w-16 h-16 text-orange-500" />
          </div>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Headphones className="w-3.5 h-3.5 text-orange-500" /> Total Time in Sessions
            </CardDescription>
            <CardTitle className="text-3xl font-black tracking-tight text-foreground">
              {stats.totalHours}{' '}
              <span className="text-sm font-semibold text-muted-foreground">hrs</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-semibold text-orange-600 dark:text-orange-400">
                {stats.totalMinutes.toLocaleString()} minutes
              </span>{' '}
              transcribed & analyzed
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-blue-500" /> Avg Session Duration
            </CardDescription>
            <CardTitle className="text-3xl font-black tracking-tight text-foreground">
              {stats.avgDuration}{' '}
              <span className="text-sm font-semibold text-muted-foreground">mins</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant="outline" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 text-[10px]">
                Active Listening
              </Badge>
              <span>Per meeting/interview</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5 text-emerald-500" /> Total Voice Sessions
            </CardDescription>
            <CardTitle className="text-3xl font-black tracking-tight text-foreground">
              {stats.totalMeetings}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                {stats.activeSessionsToday} conducted
              </span>{' '}
              in last 24 hours
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-500" /> Meeting Modes
            </CardDescription>
            <CardTitle className="text-xl font-bold tracking-tight text-foreground flex items-baseline gap-2">
              <span>{stats.meetingTypeCount} <span className="text-xs font-normal text-muted-foreground">Meetings</span></span>
              <span className="text-muted-foreground font-light">/</span>
              <span>{stats.dictationTypeCount} <span className="text-xs font-normal text-muted-foreground">Dictations</span></span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="w-full bg-muted h-2 rounded-full overflow-hidden flex">
              <div
                className="bg-orange-500 h-full transition-all"
                style={{
                  width: `${
                    stats.totalMeetings > 0
                      ? (stats.meetingTypeCount / stats.totalMeetings) * 100
                      : 50
                  }%`,
                }}
                title="Collaborative Meetings"
              />
              <div
                className="bg-purple-500 h-full transition-all"
                style={{
                  width: `${
                    stats.totalMeetings > 0
                      ? (stats.dictationTypeCount / stats.totalMeetings) * 100
                      : 50
                  }%`,
                }}
                title="Solo Dictations"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Session Duration Distribution & Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Duration Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-500" />
              Session Duration Distribution
            </CardTitle>
            <CardDescription className="text-xs">
              Breakdown of how much time users spend per session in Voiceflow.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(stats.durationBuckets).map(([key, item]) => {
              const pct = stats.totalMeetings > 0 ? Math.round((item.count / stats.totalMeetings) * 100) : 0;
              return (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">{item.label}</span>
                    <span className="text-muted-foreground tabular-nums">
                      <strong className="text-foreground">{item.count}</strong> sessions ({pct}%) ·{' '}
                      {item.minutes} mins
                    </span>
                  </div>
                  <Progress value={pct} className="h-2 bg-muted [&>div]:bg-orange-500" />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Daily Time Spent Trends */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              Meeting Minutes Volume (Recent Days)
            </CardTitle>
            <CardDescription className="text-xs">
              Cumulative daily minutes transcribed and listened to across the platform.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stats.trendData.length > 0 ? (
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="sessionMinutesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} />
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="rounded-lg border bg-background/95 p-2 shadow-lg backdrop-blur-sm text-xs">
                              <p className="font-bold">{data.date}</p>
                              <p className="text-orange-500 font-semibold">{data.minutes} meeting minutes</p>
                              <p className="text-muted-foreground">{data.sessions} sessions</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="minutes"
                      stroke="#f97316"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#sessionMinutesGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                Collecting session trend data...
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Voiceflow Meeting Sessions Explorer */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <FileText className="w-4 h-4 text-orange-500" />
              Live Meeting Sessions & Transcripts
            </CardTitle>
            <CardDescription className="text-xs">
              Direct access to all recorded meetings, durations, transcripts, and AI notes.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search meeting topics or notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 text-xs h-8"
              />
            </div>
            <div className="flex rounded-lg border p-0.5 bg-muted/40">
              <Button
                variant={selectedType === 'all' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setSelectedType('all')}
                className="text-xs h-7 px-2.5"
              >
                All
              </Button>
              <Button
                variant={selectedType === 'meeting' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setSelectedType('meeting')}
                className="text-xs h-7 px-2.5"
              >
                Meetings
              </Button>
              <Button
                variant={selectedType === 'dictation' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setSelectedType('dictation')}
                className="text-xs h-7 px-2.5"
              >
                Dictations
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border overflow-x-auto max-h-[500px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                <TableRow>
                  <TableHead className="text-xs font-bold">Meeting / Session Title</TableHead>
                  <TableHead className="text-xs font-bold">User / Account</TableHead>
                  <TableHead className="text-xs font-bold">Duration</TableHead>
                  <TableHead className="text-xs font-bold">Mode</TableHead>
                  <TableHead className="text-xs font-bold">AI Summary</TableHead>
                  <TableHead className="text-xs font-bold">Recorded</TableHead>
                  <TableHead className="text-xs font-bold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMeetings.length > 0 ? (
                  filteredMeetings.map((m) => {
                    const duration = getMeetingDurationMinutes(m);
                    const userInfo = getUserInfo(m.userId);
                    const dateObj = getMeetingDate(m);
                    const hasSummary = Boolean(m.summary && m.summary.trim());
                    const wordCount = (m.transcript || '').split(/\s+/).filter(Boolean).length;

                    return (
                      <TableRow
                        key={m.id}
                        className="cursor-pointer hover:bg-muted/40 transition-colors"
                        onClick={() => setSelectedMeeting(m)}
                      >
                        <TableCell className="font-semibold text-xs">
                          <div className="flex items-center gap-2">
                            <span className="truncate max-w-[220px]">
                              {m.title || 'Untitled Meeting Session'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div>
                            <p className="font-medium truncate max-w-[150px]">{userInfo.name}</p>
                            <p className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                              {userInfo.email}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 text-[11px] font-mono"
                          >
                            <Clock className="w-3 h-3 mr-1" />
                            {duration} min{duration === 1 ? '' : 's'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              m.type === 'dictation'
                                ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
                                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                            }`}
                          >
                            {m.type === 'dictation' ? 'Dictation' : 'Meeting'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs max-w-[200px]">
                          {hasSummary ? (
                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                              <span className="truncate">Generated</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[11px] italic">Transcript only ({wordCount} words)</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(dateObj, { addSuffix: true })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-orange-600 hover:text-orange-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedMeeting(m);
                            }}
                          >
                            Inspect <ChevronRight className="w-3 h-3 ml-1" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                      No meeting sessions found matching your filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Session Drilldown Dialog */}
      <Dialog open={Boolean(selectedMeeting)} onOpenChange={(open) => !open && setSelectedMeeting(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Mic className="w-5 h-5 text-orange-500" />
              {selectedMeeting?.title || 'Meeting Session Details'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              ID: {selectedMeeting?.id} · Recorded{' '}
              {selectedMeeting && format(getMeetingDate(selectedMeeting), 'MMMM d, yyyy h:mm a')}
            </DialogDescription>
          </DialogHeader>

          {selectedMeeting && (
            <div className="space-y-4 overflow-y-auto pr-1 py-2 flex-1">
              <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-muted/40 border">
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">Session Duration</p>
                  <p className="text-sm font-bold text-foreground">
                    {getMeetingDurationMinutes(selectedMeeting)} minutes
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">Session Type</p>
                  <p className="text-sm font-bold capitalize text-foreground">
                    {selectedMeeting.type || 'Meeting'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">User</p>
                  <p className="text-sm font-bold text-foreground truncate">
                    {getUserInfo(selectedMeeting.userId).name}
                  </p>
                </div>
              </div>

              {selectedMeeting.summary && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <Sparkles className="w-3.5 h-3.5 text-orange-500" /> Executive Summary & Action Items
                  </div>
                  <div className="p-3 rounded-lg border bg-card text-xs leading-relaxed whitespace-pre-wrap font-sans">
                    {selectedMeeting.summary}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <FileText className="w-3.5 h-3.5 text-blue-500" /> Full Meeting Transcript
                </div>
                <ScrollArea className="h-48 rounded-lg border p-3 bg-muted/20 text-xs font-mono leading-relaxed">
                  {selectedMeeting.transcript || 'No transcript text stored for this session.'}
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
