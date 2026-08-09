"use client";

import { useState, useRef, useEffect } from "react";

type Msg = { role: "user" | "assistant"; content: string };
type Eval = {
  score: number;
  verdict: string;
  strengths: string[];
  improvements: string[];
  hiring: string;
};

const ROLES = [
  "Frontend Developer",
  "Backend Developer",
  "Full-Stack Developer",
  "Data Scientist",
  "Product Manager",
  "DevOps Engineer",
  "AI/ML Engineer",
  "Software Engineering Intern",
];

const MAX_QUESTIONS = 5;

export default function Home() {
  const [step, setStep] = useState<"setup" | "interview" | "report">("setup");
  const [role, setRole] = useState<string>("");
  const [customRole, setCustomRole] = useState("");
  const [level, setLevel] = useState("Mid-level");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [questionCount, setQuestionCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [evalData, setEvalData] = useState<Eval | null>(null);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const finalRole = customRole.trim() || role;
  const displayRole = `${finalRole} (${level})`;

  async function startInterview() {
    if (!finalRole) return;
    setError("");
    setStep("interview");
    setLoading(true);
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: displayRole,
          action: "question",
          history: [{ role: "user", content: `Please start the interview for the ${displayRole} role.` }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start");
      setMessages([{ role: "assistant", content: data.question }]);
      setQuestionCount(1);
    } catch (e: any) {
      setError(e.message || "AI unavailable. Check NVIDIA_API_KEY.");
      setStep("setup");
    } finally {
      setLoading(false);
    }
  }

  async function sendAnswer() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setError("");
    const newMessages: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const nextCount = questionCount + 1;
      const isDone = nextCount >= MAX_QUESTIONS;
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: displayRole,
          action: isDone ? "evaluate" : "question",
          history: newMessages,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI call failed");

      if (isDone && data.evaluation) {
        setMessages([...newMessages, { role: "assistant", content: "Interview complete. Generating your report…" }]);
        setEvalData(data.evaluation);
        setStep("report");
      } else {
        setMessages([...newMessages, { role: "assistant", content: data.question }]);
        setQuestionCount(nextCount);
      }
    } catch (e: any) {
      setError(e.message || "AI unavailable");
      setMessages(newMessages);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep("setup");
    setMessages([]);
    setEvalData(null);
    setQuestionCount(0);
    setError("");
  }

  const inputEl = (
    <div className="flex gap-3">
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && sendAnswer()}
        placeholder="Type your answer…"
        className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 placeholder-zinc-400 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        disabled={loading}
      />
      <button
        onClick={sendAnswer}
        disabled={loading || !input.trim()}
        className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? "…" : "Send"}
      </button>
    </div>
  );

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-violet-50 text-zinc-900">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {/* Header */}
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-lg font-black text-white shadow">i</div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight">InterviewIQ</h1>
              <p className="text-[11px] font-medium text-zinc-500">AI Mock Interview Coach</p>
            </div>
          </div>
          {step !== "setup" && (
            <button onClick={reset} className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 shadow-sm hover:bg-zinc-50">
              ↺ New Interview
            </button>
          )}
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            ⚠️ {error}
          </div>
        )}

        {/* SETUP */}
        {step === "setup" && (
          <div className="rounded-2xl border border-zinc-200 bg-white/80 p-6 shadow-sm backdrop-blur sm:p-8">
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              Ace your next interview.
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              Pick a role, get asked real interview questions, answer them, and receive a detailed AI evaluation — all in under 10 minutes.
            </p>

            <div className="mt-6">
              <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-zinc-500">Choose a role</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ROLES.map((r) => (
                  <button
                    key={r}
                    onClick={() => { setRole(r); setCustomRole(""); }}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                      role === r && !customRole
                        ? "border-indigo-600 bg-indigo-600 text-white shadow"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-indigo-300"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-zinc-500">Or custom role</label>
              <input
                value={customRole}
                onChange={(e) => { setCustomRole(e.target.value); if (e.target.value) setRole(""); }}
                placeholder="e.g., Android Developer, UX Designer…"
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-zinc-500">Experience level</label>
              <div className="flex gap-2">
                {["Entry-level", "Mid-level", "Senior"].map((l) => (
                  <button
                    key={l}
                    onClick={() => setLevel(l)}
                    className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                      level === l ? "border-indigo-600 bg-indigo-600 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:border-indigo-300"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={startInterview}
              disabled={!finalRole || loading}
              className="mt-8 w-full rounded-xl bg-indigo-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? "Starting interview…" : "Start Mock Interview →"}
            </button>
            <p className="mt-3 text-center text-[11px] text-zinc-400">{MAX_QUESTIONS} questions · ~8 min · instant AI feedback</p>
          </div>
        )}

        {/* INTERVIEW */}
        {step === "interview" && (
          <div className="rounded-2xl border border-zinc-200 bg-white/80 p-4 shadow-sm backdrop-blur sm:p-6">
            <div className="mb-4 flex items-center justify-between border-b border-zinc-100 pb-3">
              <div>
                <p className="text-sm font-bold">{displayRole}</p>
                <p className="text-[11px] text-zinc-500">Question {Math.min(questionCount, MAX_QUESTIONS)} of {MAX_QUESTIONS}</p>
              </div>
              <div className="flex gap-1">
                {Array.from({ length: MAX_QUESTIONS }).map((_, i) => (
                  <div key={i} className={`h-1.5 w-6 rounded-full ${i < questionCount ? "bg-indigo-500" : "bg-zinc-200"}`} />
                ))}
              </div>
            </div>

            <div className="max-h-[45vh] space-y-3 overflow-y-auto py-2">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "rounded-br-md bg-indigo-600 text-white"
                        : "rounded-bl-md border border-zinc-200 bg-white text-zinc-800"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-400">
                    <span className="inline-flex gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:0.1s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:0.2s]" />
                    </span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="mt-3">{inputEl}</div>
          </div>
        )}

        {/* REPORT */}
        {step === "report" && evalData && (
          <div className="rounded-2xl border border-zinc-200 bg-white/80 p-6 shadow-sm backdrop-blur sm:p-8">
            <div className="flex flex-col items-center text-center">
              <div
                className={`flex h-28 w-28 items-center justify-center rounded-full border-8 text-3xl font-black ${
                  evalData.score >= 70
                    ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                    : evalData.score >= 45
                    ? "border-amber-200 bg-amber-50 text-amber-600"
                    : "border-rose-200 bg-rose-50 text-rose-600"
                }`}
              >
                {evalData.score || "–"}
              </div>
              <h2 className="mt-4 text-xl font-extrabold">Interview Report</h2>
              <p className="mt-1 text-sm text-zinc-600">{evalData.verdict}</p>
              <span
                className={`mt-3 rounded-full px-4 py-1 text-xs font-bold ${
                  evalData.hiring?.includes("Hire") && !evalData.hiring.includes("No Hire")
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-rose-100 text-rose-700"
                }`}
              >
                {evalData.hiring || "Review"}
              </span>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-700">Strengths</h3>
                <ul className="space-y-2">
                  {(evalData.strengths || []).map((s, i) => (
                    <li key={i} className="flex gap-2 text-sm text-zinc-700">
                      <span className="text-emerald-500">✓</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">Improve</h3>
                <ul className="space-y-2">
                  {(evalData.improvements || []).map((s, i) => (
                    <li key={i} className="flex gap-2 text-sm text-zinc-700">
                      <span className="text-amber-500">→</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <button
                onClick={reset}
                className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white shadow transition hover:bg-indigo-500"
              >
                ↺ Practice Again
              </button>
              <button
                onClick={() => window.print()}
                className="flex-1 rounded-xl border border-zinc-200 bg-white py-3 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50"
              >
                🖨 Save Report
              </button>
            </div>
          </div>
        )}

        <footer className="mt-10 text-center text-[11px] text-zinc-400">
          Built for Hack Devengers 1.0 · AI-powered mock interviews · 9 Aug 2026
        </footer>
      </div>
    </main>
  );
}
