export function drainTelemetry() {
  return {};
}

export function recordDwell(route: string, ms: number) {}

export function recordRoutePerf(route: string, ms: number) {}

export function recordFeatureEvent(event: string) {}

export function trackFeature(featureName: string, meta?: any) {}
