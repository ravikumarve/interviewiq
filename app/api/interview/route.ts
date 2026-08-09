import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Live AI engine: NVIDIA NIM (fast llama-3.1-8b), fallback to local Ollama
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_KEY = process.env.NVIDIA_API_KEY || "";
const NVIDIA_MODEL = process.env.NVIDIA_MODEL || "meta/llama-3.1-8b-instruct";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "tinyllama";

async function callNvidia(messages: { role: string; content: string }[], maxTokens = 300) {
  const res = await fetch(NVIDIA_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NVIDIA_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(50000),
  });
  if (!res.ok) throw new Error(`NVIDIA ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || "").trim();
}

async function callOllama(messages: { role: string; content: string }[], maxTokens = 300) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_MODEL, messages, stream: false, options: { num_predict: maxTokens } }),
    signal: AbortSignal.timeout(50000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = await res.json();
  return (data.message?.content || "").trim();
}

const INTERVIEWER_SYSTEM = (role: string) =>
  `You are a professional interviewer for the "${role}" position at a top tech company. ` +
  `Ask exactly ONE interview question. Output ONLY the question — no greeting, no preamble, no numbering, no commentary. ` +
  `The question must be specific, realistic, and under 30 words.`;

const EVALUATOR_SYSTEM = (role: string) =>
  `You are a senior hiring manager evaluating a candidate for the "${role}" position. ` +
  `Analyze the interview transcript and produce a structured evaluation. ` +
  `Respond ONLY with valid JSON (no markdown fences) shaped exactly like: ` +
  `{"score": 0-100, "verdict": "short one-line verdict", ` +
  `"strengths": ["strength1","strength2","strength3"], ` +
  `"improvements": ["improvement1","improvement2","improvement3"], ` +
  `"hiring": "Hire" | "Lean Hire" | "Lean No Hire" | "No Hire"}`;

export async function POST(req: NextRequest) {
  try {
    const { role, history, action } = await req.json();

    if (!role || !Array.isArray(history)) {
      return Response.json({ error: "role and history are required" }, { status: 400 });
    }

    const system = action === "evaluate" ? EVALUATOR_SYSTEM(role) : INTERVIEWER_SYSTEM(role);
    const messages = [{ role: "system", content: system }, ...history];

    let content = "";
    try {
      content = NVIDIA_KEY
        ? await callNvidia(messages, action === "evaluate" ? 700 : 200)
        : await callOllama(messages, action === "evaluate" ? 700 : 200);
    } catch {
      // fallback: local Ollama if NVIDIA fails
      content = await callOllama(messages, action === "evaluate" ? 700 : 200);
    }

    if (!content) throw new Error("Empty response from AI provider");

    // If evaluating, try to parse JSON; if it fails, wrap content as raw report
    if (action === "evaluate") {
      try {
        const parsed = JSON.parse(content);
        return Response.json({ evaluation: parsed });
      } catch {
        return Response.json({ evaluation: { score: 0, verdict: content } });
      }
    }

    return Response.json({ question: content });
  } catch (e: any) {
    return Response.json({ error: e?.message || "AI service unavailable" }, { status: 500 });
  }
}
