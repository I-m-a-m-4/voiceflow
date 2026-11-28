/**
 * Multi-key OpenRouter pool with round-robin balancing and automatic per-key
 * cooldown on HTTP 429 (daily 50-req free-tier / RPM limit), 402, or 401.
 *
 * Reads keys from:
 *   OPENROUTER_API_KEYS (comma/newline-separated),
 *   OPENROUTER_API_KEY, OPENROUTER_API_KEY_2, OPENROUTER_API_KEY_3, OPENROUTER_API_KEY_4,
 *   OPENAI_API_KEY, NEXT_PUBLIC_OPENROUTER_API_KEY
 */

const keyCooldownUntil = new Map<string, number>();
let roundRobinCursor = 0;

export function getOpenRouterKeyPool(): string[] {
  const rawList: string[] = [
    ...(process.env.OPENROUTER_API_KEYS || "").split(/[,\n]+/),
    process.env.OPENROUTER_API_KEY || "",
    process.env.OPENROUTER_API_KEY_2 || "",
    process.env.OPENROUTER_API_KEY_3 || "",
    process.env.OPENROUTER_API_KEY_4 || "",
    process.env.OPENAI_API_KEY || "",
    process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || "",
  ];

  const seen = new Set<string>();
  const keys: string[] = [];
  for (const item of rawList) {
    const clean = item.trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    keys.push(clean);
  }
  return keys;
}

/**
 * Returns keys ordered for the next request: healthy (non-cooled-down) keys first
 * in round-robin order so daily 50-req quotas and RPM load spread evenly across all keys.
 * If every key is in cooldown, returns the one expiring soonest as a last-resort attempt.
 */
export function getOrderedOpenRouterKeys(): string[] {
  const pool = getOpenRouterKeyPool();
  if (pool.length <= 1) return pool;

  const now = Date.now();
  const start = roundRobinCursor % pool.length;
  roundRobinCursor = (roundRobinCursor + 1) % pool.length;

  const rotated = [...pool.slice(start), ...pool.slice(0, start)];
  const healthy: string[] = [];
  const cooled: Array<{ key: string; until: number }> = [];

  for (const key of rotated) {
    const until = keyCooldownUntil.get(key) || 0;
    if (until <= now) {
      if (until > 0) keyCooldownUntil.delete(key);
      healthy.push(key);
    } else {
      cooled.push({ key, until });
    }
  }

  if (healthy.length > 0) return healthy;
  cooled.sort((a, b) => a.until - b.until);
  return cooled.length > 0 ? [cooled[0].key] : rotated;
}

/**
 * Marks a specific OpenRouter key in cooldown when it hits a key-level failure
 * (429 rate/daily limit, 402 credits depleted, 401 unauthorized).
 * Returns true if the caller should immediately try the next key on the SAME model.
 */
export function recordOpenRouterKeyFailure(
  key: string,
  status: number,
  errorMsg = "",
  retryAfterHeader?: string | null
): boolean {
  if (status === 401 || status === 403 || status === 402) {
    keyCooldownUntil.set(key, Date.now() + 15 * 60_000);
    return true;
  }

  if (status === 429) {
    const isDailyLimit = /per[- ]?day|daily|free-models-per-day|limit.*50/i.test(errorMsg);
    const parsedHeader = retryAfterHeader ? Number(retryAfterHeader) : NaN;
    const cooldownMs = isDailyLimit
      ? 15 * 60_000 // Skip daily-exhausted key for 15 minutes
      : Number.isFinite(parsedHeader) && parsedHeader > 0
        ? Math.min(180_000, Math.max(15_000, Math.ceil(parsedHeader) * 1000))
        : 45_000;
    keyCooldownUntil.set(key, Date.now() + cooldownMs);
    return true;
  }

  return false;
}

export function clearOpenRouterKeyCooldown(key: string): void {
  keyCooldownUntil.delete(key);
}

