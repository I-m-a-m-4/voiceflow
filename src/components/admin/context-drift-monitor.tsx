'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Code2,
  Gauge,
  Layers,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useFirestore } from '@/firebase';
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { apiBase } from '@/lib/platform';

interface ContextTelemetryRollup {
  totalTurns?: number;
  status_healthy?: number;
  status_watch?: number;
  status_drifting?: number;
  repeatAskTurns?: number;
  freshRepeatTurns?: number;
  transcriptDeltaHits?: number;
  overlapSum?: number;
  overlapCount?: number;
  latencyMsSum?: number;
  lastDriftStatus?: 'healthy' | 'watch' | 'drifting';
  lastModel?: string;
  lastUpdated?: any;
  [key: string]: any;
}

interface TelemetryEvent {
  id: string;
  intent: string;
  responseMode: string;
  isRepeatAsk: boolean;
  hasTranscriptDelta: boolean;
  turnNumber: number;
  provider: string;
  model: string;
  latencyMs: number;
  overlapWithPrev: number | null;
  driftStatus: 'healthy' | 'watch' | 'drifting';
  responseChars: number;
  createdAt?: any;
}

interface LiveDriftStep {
  label: string;
  expectedMode: string;
  actualMode: string;
  overlapPct: number | null;
  latencyMs: number;
  passed: boolean;
  driftStatus: string;
  preview: string;
}

const MODE_LABELS: Record<string, string> = {
  spoken_teleprompter: 'Live Teleprompter',
  code_technical: 'Code & Technical',
  fresh_alternative: 'Fresh Anti-Repeat',
  screen_adaptive: 'Visual Screen',
  direct_analytical: 'Direct Analytical',
  recap_brief: 'Recap Summary',
};

export default function ContextDriftMonitor() {
  const firestore = useFirestore();
  const [rollup, setRollup] = useState<ContextTelemetryRollup | null>(null);
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunningAudit, setIsRunningAudit] = useState(false);
  const [auditSteps, setAuditSteps] = useState<LiveDriftStep[] | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

  useEffect(() => {
    if (!firestore) return;

    const unsubRollup = onSnapshot(
      doc(firestore, 'platform_stats', 'context_telemetry'),
      (snap) => {
        if (snap.exists()) setRollup(snap.data() as ContextTelemetryRollup);
        setIsLoading(false);
      },
      () => setIsLoading(false)
    );

    const eventsQuery = query(
      collection(firestore, 'context_telemetry_events'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsubEvents = onSnapshot(
      eventsQuery,
      (snap) => {
        setEvents(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      },
      () => {
        // ignore if empty
      }
    );

    return () => {
      unsubRollup();
      unsubEvents();
    };
  }, [firestore]);

  const metrics = useMemo(() => {
    const total = rollup?.totalTurns || 0;
    const healthy = rollup?.status_healthy || 0;
    const watch = rollup?.status_watch || 0;
    const drifting = rollup?.status_drifting || 0;
    const reliabilityPct = total > 0 ? Math.round(((healthy + watch * 0.5) / total) * 100) : 100;
    const driftRatePct = total > 0 ? Math.round((drifting / total) * 100) : 0;

    const repeatTotal = rollup?.repeatAskTurns || 0;
    const freshRepeats = rollup?.freshRepeatTurns || 0;
    const repeatFreshnessPct = repeatTotal > 0 ? Math.round((freshRepeats / repeatTotal) * 100) : 100;

    const avgOverlapPct =
      rollup?.overlapCount && rollup.overlapCount > 0
        ? Math.round(((rollup.overlapSum || 0) / rollup.overlapCount) * 100)
        : 0;

    const avgLatencyMs = total > 0 ? Math.round((rollup?.latencyMsSum || 0) / total) : 0;
    const deltaHitPct = total > 0 ? Math.round(((rollup?.transcriptDeltaHits || 0) / total) * 100) : 0;

    const overallStatus: 'healthy' | 'watch' | 'drifting' =
      total === 0
        ? 'healthy'
        : driftRatePct >= 15 || avgOverlapPct >= 52
          ? 'drifting'
          : driftRatePct >= 5 || avgOverlapPct >= 38
            ? 'watch'
            : 'healthy';

    const modeBreakdown = Object.keys(MODE_LABELS)
      .map((key) => ({
        key,
        label: MODE_LABELS[key],
        count: Number(rollup?.[`mode_${key}`] || 0),
      }))
      .filter((m) => m.count > 0)
      .sort((a, b) => b.count - a.count);

    return {
      total,
      healthy,
      watch,
      drifting,
      reliabilityPct,
      driftRatePct,
      repeatTotal,
      repeatFreshnessPct,
      avgOverlapPct,
      avgLatencyMs,
      deltaHitPct,
      overallStatus,
      modeBreakdown,
    };
  }, [rollup]);

  /**
   * Executes a real 4-turn live multi-turn probe against /api/ask-screen to verify:
   * 1) Live transcript Q1 answer -> spoken_teleprompter
   * 2) Repeated Suggest Answer on identical transcript -> fresh_alternative + low overlap
   * 3) Live transcript advances to a coding task -> code_technical + fenced code
   * 4) Unrelated standalone question -> clean pivot with zero transcript hijack
   */
  const runLiveDriftAudit = async () => {
    setIsRunningAudit(true);
    setAuditError(null);
    setAuditSteps([]);

    try {
      const base = apiBase();
      const endpoint = base ? `${base}/api/ask-screen` : '/api/ask-screen';
      const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
      const results: LiveDriftStep[] = [];

      const tx1 =
        '[0:10] Interviewer: We are experiencing P99 latency spikes on our checkout API during flash sales. How do you diagnose and stabilize it?';
      const tx2 =
        tx1 +
        '\n\n[1:15] Interviewer: Great. Now let us write a TypeScript debounce function that delays invoking a callback until wait milliseconds have passed.';

      const runProbe = async (params: {
        label: string;
        prompt: string;
        transcript: string;
        lastTranscriptLength: number;
        lastTranscriptTail: string;
        expectedMode: string;
        validate: (data: any) => boolean;
      }) => {
        const t0 = performance.now();
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: params.prompt,
            transcript: params.transcript,
            history,
            lastTranscriptLength: params.lastTranscriptLength,
            lastTranscriptTail: params.lastTranscriptTail,
            stream: false,
          }),
        });
        const latencyMs = Math.round(performance.now() - t0);
        const data = await res.json();
        if (!res.ok || !data?.text) {
          throw new Error(data?.error || `Probe "${params.label}" failed (HTTP ${res.status})`);
        }
        history.push({ role: 'user', content: params.prompt }, { role: 'assistant', content: data.text });

        const overlapPct =
          typeof data.overlapWithPrev === 'number' ? Math.round(data.overlapWithPrev * 100) : null;
        const step: LiveDriftStep = {
          label: params.label,
          expectedMode: params.expectedMode,
          actualMode: data.responseMode || 'unknown',
          overlapPct,
          latencyMs,
          passed: params.validate(data),
          driftStatus: data.driftStatus || 'healthy',
          preview: String(data.text).replace(/\s+/g, ' ').slice(0, 120),
        };
        results.push(step);
        setAuditSteps([...results]);
      };

      await runProbe({
        label: 'Turn 1: Live Transcript Answer',
        prompt: 'Give me a smart real-time answer suggestion for the current meeting point.',
        transcript: tx1,
        lastTranscriptLength: 0,
        lastTranscriptTail: '',
        expectedMode: 'spoken_teleprompter',
        validate: (d) => d.responseMode === 'spoken_teleprompter' && d.text.length > 50,
      });

      await runProbe({
        label: 'Turn 2: Repeat Suggest (Anti-Repetition)',
        prompt: 'Give me a smart real-time answer suggestion for the current meeting point.',
        transcript: tx1,
        lastTranscriptLength: tx1.length,
        lastTranscriptTail: tx1.slice(-120),
        expectedMode: 'fresh_alternative',
        validate: (d) =>
          d.responseMode === 'fresh_alternative' &&
          (d.overlapWithPrev === null || d.overlapWithPrev < 0.55),
      });

      await runProbe({
        label: 'Turn 3: Transcript Pivot -> Live Code',
        prompt: 'What should I say?',
        transcript: tx2,
        lastTranscriptLength: tx1.length,
        lastTranscriptTail: tx1.slice(-120),
        expectedMode: 'code_technical',
        validate: (d) =>
          d.responseMode === 'code_technical' &&
          /debounce/i.test(d.text) &&
          /```/.test(d.text),
      });

      await runProbe({
        label: 'Turn 4: Standalone Pivot (No Bleed)',
        prompt: 'Explain SQL LEFT JOIN vs INNER JOIN in 2 bullets with a short query.',
        transcript: tx2,
        lastTranscriptLength: tx2.length,
        lastTranscriptTail: tx2.slice(-120),
        expectedMode: 'code_technical',
        validate: (d) =>
          /left join/i.test(d.text) &&
          !/flash sale|checkout api/i.test(d.text),
      });
    } catch (err: any) {
      setAuditError(err?.message || 'Live drift audit failed');
    } finally {
      setIsRunningAudit(false);
    }
  };

  return (
    <Card className="border border-border/80 shadow-md bg-card/70 overflow-hidden">
      <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2 text-foreground">
              <Activity className="h-5 w-5 text-voiceflow-orange" />
              Context Consistency & Drift Telemetry
              {metrics.overallStatus === 'healthy' ? (
                <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px]">
                  <ShieldCheck className="w-3 h-3 mr-1" /> Context Healthy
                </Badge>
              ) : metrics.overallStatus === 'watch' ? (
                <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px]">
                  <AlertTriangle className="w-3 h-3 mr-1" /> Drift Watch
                </Badge>
              ) : (
                <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 text-[10px] animate-pulse">
                  <ShieldAlert className="w-3 h-3 mr-1" /> Drift Detected
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Measures real-time multi-turn overlap, repeat-ask freshness, dynamic code/meeting routing, and transcript delta grounding.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={runLiveDriftAudit}
            disabled={isRunningAudit}
            className="bg-voiceflow-orange hover:bg-orange-600 text-white font-bold text-xs gap-1.5"
          >
            {isRunningAudit ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Running 4-Turn Drift Audit...
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-white" />
                Run Live 4-Turn Drift Audit
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-5">
        {/* KPI Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl border bg-background/60 space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
              <Gauge className="w-3.5 h-3.5 text-emerald-500" /> Reliability Score
            </span>
            <div className="text-2xl font-black text-foreground">{metrics.reliabilityPct}%</div>
            <Progress value={metrics.reliabilityPct} className="h-1.5 [&>div]:bg-emerald-500" />
            <p className="text-[10px] text-muted-foreground">
              {metrics.total > 0
                ? `${metrics.healthy} healthy • ${metrics.watch} watch • ${metrics.drifting} drifting`
                : 'Awaiting live turns (run audit above)'}
            </p>
          </div>

          <div className="p-3.5 rounded-xl border bg-background/60 space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5 text-blue-500" /> Avg Turn Overlap
            </span>
            <div className="text-2xl font-black text-foreground">{metrics.avgOverlapPct}%</div>
            <p className="text-[10px] text-muted-foreground">
              Target &lt; 35% (proves Turn 2+ replies aren&apos;t parroting Turn 1)
            </p>
          </div>

          <div className="p-3.5 rounded-xl border bg-background/60 space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Repeat Freshness
            </span>
            <div className="text-2xl font-black text-foreground">{metrics.repeatFreshnessPct}%</div>
            <p className="text-[10px] text-muted-foreground">
              {metrics.repeatTotal > 0
                ? `${metrics.repeatTotal} repeat asks tracked`
                : 'Zero stale repeats detected'}
            </p>
          </div>

          <div className="p-3.5 rounded-xl border bg-background/60 space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-voiceflow-orange" /> Avg Latency &amp; Delta
            </span>
            <div className="text-2xl font-black text-foreground">
              {metrics.avgLatencyMs > 0 ? `${metrics.avgLatencyMs}ms` : '—'}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Transcript delta hits: {metrics.deltaHitPct}% ({metrics.total} total turns)
            </p>
          </div>
        </div>

        {/* Dynamic Mode Distribution */}
        {metrics.modeBreakdown.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" /> Active Dynamic Mode Routing
            </p>
            <div className="flex flex-wrap gap-2">
              {metrics.modeBreakdown.map((m) => (
                <div
                  key={m.key}
                  className="px-3 py-1.5 rounded-lg border bg-muted/30 text-xs flex items-center gap-2"
                >
                  {m.key === 'code_technical' && <Code2 className="w-3.5 h-3.5 text-blue-500" />}
                  <span className="font-semibold text-foreground">{m.label}</span>
                  <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-background text-muted-foreground">
                    {m.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live 4-Turn Drift Audit Output */}
        {auditError && (
          <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-500 font-medium">
            {auditError}
          </div>
        )}

        {auditSteps && auditSteps.length > 0 && (
          <div className="space-y-2 pt-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Live 4-Turn Multi-Turn Drift Audit Results
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {auditSteps.map((s, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-xl border text-xs space-y-1 ${
                    s.passed
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-red-500/30 bg-red-500/5'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-foreground flex items-center gap-1.5">
                      {s.passed ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      )}
                      {s.label}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">{s.latencyMs}ms</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
                    <Badge variant="outline" className="text-[10px]">
                      mode: {s.actualMode}
                    </Badge>
                    {s.overlapPct !== null && (
                      <Badge variant="outline" className="text-[10px]">
                        overlap vs prev: {s.overlapPct}%
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {s.driftStatus}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2">{s.preview}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Production Telemetry Events */}
        {!isLoading && events.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Recent Production Turns (Privacy-Safe Metadata)
            </p>
            <div className="overflow-x-auto border rounded-xl">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-muted/40 text-muted-foreground uppercase text-[10px]">
                  <tr>
                    <th className="p-2">Turn</th>
                    <th className="p-2">Mode / Intent</th>
                    <th className="p-2">Model</th>
                    <th className="p-2">Overlap</th>
                    <th className="p-2">Latency</th>
                    <th className="p-2">Health</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {events.slice(0, 8).map((ev) => (
                    <tr key={ev.id} className="hover:bg-muted/20">
                      <td className="p-2 font-mono">
                        #{ev.turnNumber}
                        {ev.isRepeatAsk ? ' (repeat)' : ''}
                      </td>
                      <td className="p-2">
                        <span className="font-semibold text-foreground">
                          {MODE_LABELS[ev.responseMode] || ev.responseMode}
                        </span>
                        <span className="text-muted-foreground ml-1">({ev.intent})</span>
                      </td>
                      <td className="p-2 font-mono text-[10px] text-muted-foreground">{ev.model}</td>
                      <td className="p-2 font-mono">
                        {typeof ev.overlapWithPrev === 'number'
                          ? `${Math.round(ev.overlapWithPrev * 100)}%`
                          : '—'}
                      </td>
                      <td className="p-2 font-mono">{ev.latencyMs}ms</td>
                      <td className="p-2">
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold text-[10px] uppercase ${
                            ev.driftStatus === 'healthy'
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : ev.driftStatus === 'watch'
                                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                : 'bg-red-500/15 text-red-600 dark:text-red-400'
                          }`}
                        >
                          {ev.driftStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

