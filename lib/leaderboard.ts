// Peer benchmarking store: shared score leaderboard with percentile math.
// Default store: jsonblob.com (zero-signup public JSON blob, no auth needed).
// To swap in Upstash Redis REST (free tier): set LEADERBOARD_URL to your
// Upstash REST URL and this client works unchanged (GET/POST same JSON shape).

const BLOB_URL =
  process.env.LEADERBOARD_URL ||
  "https://jsonblob.com/api/jsonBlob/019fe561-f7d3-7502-9955-8b3f40a5e0b8";

export type ScoreEntry = {
  role: string;
  level: string;
  score: number;
  ts: number;
};

type LeaderboardData = { scores: ScoreEntry[] };

const MAX_SCORES = 500; // cap the blob so it never grows unbounded

// Seeded baseline distribution used when the remote store is unreachable,
// so the UI still shows a meaningful percentile instead of breaking.
const SEEDED = [
  32, 38, 41, 45, 47, 48, 50, 52, 55, 57, 58, 60, 62, 63, 65, 66, 68, 70, 71,
  72, 74, 75, 77, 78, 80, 82, 84, 86, 88, 91,
];

async function readStore(): Promise<LeaderboardData> {
  const res = await fetch(BLOB_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`store ${res.status}`);
  const data = await res.json();
  return { scores: Array.isArray(data?.scores) ? data.scores : [] };
}

async function writeStore(data: LeaderboardData): Promise<void> {
  const res = await fetch(BLOB_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`store write ${res.status}`);
}

// Percentile = share of scores strictly below this score (0-100).
export function percentileOf(score: number, pool: number[]): number {
  if (!pool.length) return 0;
  const below = pool.filter((s) => s < score).length;
  return Math.round((below / pool.length) * 100);
}

// Submit a score; returns percentile vs peers + updated total.
// Falls back to the seeded baseline (no network) so the feature never crashes.
export async function submitScore(entry: ScoreEntry) {
  try {
    const data = await readStore();
    data.scores.push(entry);
    if (data.scores.length > MAX_SCORES) data.scores = data.scores.slice(-MAX_SCORES);
    await writeStore(data);

    const sameRole = data.scores
      .filter((s) => s.role === entry.role)
      .map((s) => s.score);
    // If we have few real peers for this role, blend with the seeded baseline so
    // early users still get a meaningful percentile instead of "beating 0%".
    const hasRealPeers = sameRole.length >= 2;
    const pool = hasRealPeers
      ? sameRole
      : [...SEEDED, ...data.scores.map((s) => s.score), entry.score];
    const total = data.scores.length;
    return {
      percentile: percentileOf(entry.score, pool),
      // rank is only meaningful against real peers
      rank: hasRealPeers ? pool.filter((s) => s > entry.score).length + 1 : null,
      total,
      ok: true,
    };
  } catch {
    // Offline fallback: seeded baseline + in-memory entry
    const pool = [...SEEDED, entry.score];
    return {
      percentile: percentileOf(entry.score, pool),
      rank: pool.filter((s) => s > entry.score).length + 1,
      total: pool.length,
      ok: false,
    };
  }
}

// Top scores per role (or all roles if no role given).
export async function getLeaderboard(role?: string, limit = 5) {
  try {
    const data = await readStore();
    const pool = role
      ? data.scores.filter((s) => s.role === role)
      : data.scores;
    const sorted = [...pool].sort((a, b) => b.score - a.score).slice(0, limit);
    const total = data.scores.length;
    const totalRole = pool.length;
    return { entries: sorted, total, totalRole, ok: true };
  } catch {
    const base = SEEDED.map((score, i) => ({
      role: role || "Frontend Developer",
      level: "Senior",
      score,
      ts: Date.now() - i * 3600_000,
    }));
    return {
      entries: base.sort((a, b) => b.score - a.score).slice(0, limit),
      total: base.length,
      totalRole: base.length,
      ok: false,
    };
  }
}
