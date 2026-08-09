import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Live AI engine: NVIDIA NIM (fast llama-3.1-8b), fallback to local Ollama
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_KEY = process.env.NVIDIA_API_KEY || "";
const NVIDIA_MODEL = process.env.NVIDIA_MODEL || "meta/llama-3.1-8b-instruct";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "tinyllama";

async function callNvidia(messages: { role: string; content: string }[], maxTokens = 300, model = NVIDIA_MODEL) {
  const res = await fetch(NVIDIA_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NVIDIA_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.5,
    }),
    signal: AbortSignal.timeout(maxTokens > 300 ? 150000 : 60000),
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

const INTERVIEWER_SYSTEM = (role: string, jd?: string) => {
  const jdPart = jd?.trim()
    ? ` The candidate applied to this REAL job description:\n"""${jd.trim().slice(0, 4000)}"""\n` +
      `Read it. Extract the concrete skills, tools, and responsibilities it requires. ` +
      `Your questions MUST probe those specific requirements — technical depth first, then fit. ` +
      `Vary across the JD's key areas (e.g. stack, system design, domain knowledge, soft skills).`
    : "";
  return (
    `You are a professional interviewer for the "${role}" position at a top tech company. ` +
    `You are conducting a LIVE interview. The candidate just answered your previous question. ` +
    `Now ask the NEXT question ONLY. Rules: ` +
    `1. Ask exactly ONE new interview question — never respond to or comment on the candidate's answer, never give feedback, never write code. ` +
    `2. Output ONLY the question — no greeting, no preamble, no numbering, no markdown, no commentary. ` +
    `3. The question must be specific, realistic, and under 30 words. ` +
    `4. Vary the topic — do not repeat the same topic as the previous question.` +
    jdPart
  );
};

const FOLLOWUP_SYSTEM = (role: string, jd?: string) => {
  const jdPart = jd?.trim()
    ? ` The candidate applied to this job description:\n"""${jd.trim().slice(0, 4000)}"""\n` +
      `Anchor your probe in the specific skill or tool from the JD that their answer touched on.`
    : "";
  return (
    `You are a professional interviewer for the "${role}" position. ` +
    `The candidate's latest answer was too vague or thin — a real interviewer would dig in. ` +
    `Ask exactly ONE short follow-up question that pushes them to give specifics: a concrete example, ` +
    `a real trade-off, numbers, or the actual approach they used. ` +
    `Rules: stay on the SAME topic as their answer (never introduce a new topic), never give feedback, ` +
    `never write code, output ONLY the follow-up question (under 25 words).` +
    jdPart
  );
};

const extractJson = (content: string): string => {
  const cleaned = content.replace(/```json|```/g, "").trim();
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {}
  // Fall back to the first balanced {...} block if the model wrapped output in prose
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const candidate = cleaned.slice(start, end + 1);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {}
  }
  return cleaned;
};

const EVALUATOR_SYSTEM = (role: string, jd?: string) => {
  const jdPart = jd?.trim()
    ? ` The candidate applied to this REAL job description:\n"""${jd.trim().slice(0, 4000)}"""\n` +
      `Score against how well they demonstrated the JD's required skills. ` +
      `If they never touched the JD's core requirements (e.g. ${jd.trim().slice(0, 200)}…), call that out in the verdict.`
    : "";
  return (
    `You are a strict hiring manager for "${role}". Evaluate the candidate's answers. ` +
    `Penalize one-word/vague answers HARD: if most answers are under 20 words, score MUST be below 30 and verdict MUST call out the lack of substance. ` +
    `Never pass (>50) without concrete technical knowledge. Do not invent strengths. ` +
    `Respond ONLY with JSON (no markdown, no extra text): ` +
    `{"score": number, "verdict": string, "strengths": [string], "improvements": [string], "hiring": "Hire"|"Lean Hire"|"Lean No Hire"|"No Hire"}` +
    jdPart
  );
};

const COACH_SYSTEM =
  `You are a personal interview coach. Based on the candidate's weakest area from their report, ` +
  `generate 3 targeted practice questions to fix that specific skill gap. ` +
  `Output ONLY JSON (no markdown): ` +
  `{"skill": "the weak skill to fix", "questions": ["q1","q2","q3"], "tip": "one-line study tip"}`;

export async function POST(req: NextRequest) {
  try {
    const { role, history, action, jd } = await req.json();

    if (!role || !Array.isArray(history)) {
      return Response.json({ error: "role and history are required" }, { status: 400 });
    }

    const system =
      action === "evaluate"
        ? EVALUATOR_SYSTEM(role, jd)
        : action === "coach"
        ? COACH_SYSTEM
        : action === "followup"
        ? FOLLOWUP_SYSTEM(role, jd)
        : INTERVIEWER_SYSTEM(role, jd);
    const messages = [{ role: "system", content: system }, ...history];

    let content = "";
    try {
      content = NVIDIA_KEY
        ? await callNvidia(messages, action === "evaluate" ? 700 : action === "coach" ? 400 : 200)
        : await callOllama(messages, action === "evaluate" ? 700 : action === "coach" ? 400 : 200);
    } catch {
      // fallback: local Ollama if NVIDIA fails
      content = await callOllama(messages, action === "evaluate" ? 700 : action === "coach" ? 400 : 200);
    }

    if (!content) throw new Error("Empty response from AI provider");

    // If evaluating, try to parse JSON; if it fails, return a harsh default rather than raw text
    if (action === "evaluate") {
      try {
        const parsed = JSON.parse(extractJson(content));
        return Response.json({ evaluation: parsed });
      } catch {
        return Response.json({
          evaluation: {
            score: 10,
            verdict: "Unable to produce structured evaluation — answers likely lacked substance.",
            strengths: [],
            improvements: ["Provide detailed, example-backed answers during the interview."],
            hiring: "No Hire",
          },
        });
      }
    }

    // Coach: return targeted practice plan
    if (action === "coach") {
      try {
        return Response.json({ plan: JSON.parse(extractJson(content)) });
      } catch {
        return Response.json({
          plan: { skill: "interview fundamentals", questions: [content], tip: "Practice with detailed examples." },
        });
      }
    }

    return Response.json({ question: content });
  } catch (e: any) {
    return Response.json({ error: e?.message || "AI service unavailable" }, { status: 500 });
  }
}
