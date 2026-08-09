import { NextRequest } from "next/server";
import { submitScore, getLeaderboard } from "@/lib/leaderboard";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST /api/leaderboard — record a finished interview score
export async function POST(req: NextRequest) {
  try {
    const { role, level, score } = await req.json();
    if (!role || typeof score !== "number" || score < 0 || score > 100) {
      return Response.json({ error: "role and score (0-100) are required" }, { status: 400 });
    }
    const result = await submitScore({ role, level: level || "", score, ts: Date.now() });
    return Response.json(result);
  } catch (e: any) {
    return Response.json({ error: e?.message || "leaderboard unavailable" }, { status: 500 });
  }
}

// GET /api/leaderboard?role=Frontend%20Developer&limit=5 — top scores
export async function GET(req: NextRequest) {
  try {
    const role = req.nextUrl.searchParams.get("role") || undefined;
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "5", 10) || 5, 20);
    const result = await getLeaderboard(role, limit);
    return Response.json(result);
  } catch (e: any) {
    return Response.json({ error: e?.message || "leaderboard unavailable" }, { status: 500 });
  }
}
