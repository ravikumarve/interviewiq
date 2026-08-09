"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { jsPDF } from "jspdf";

type Msg = { role: "user" | "assistant"; content: string; time?: string };
type Eval = {
  score: number;
  verdict: string;
  strengths: string[];
  improvements: string[];
  hiring: string;
};
type CoachPlan = { skill: string; questions: string[]; tip: string };

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
const QUESTION_TIME = 90; // seconds

// Web Speech API types
declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

export default function Home() {
  const [step, setStep] = useState<"setup" | "interview" | "report">("setup");
  const [role, setRole] = useState("");
  const [customRole, setCustomRole] = useState("");
  const [level, setLevel] = useState("Mid-level");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [questionCount, setQuestionCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [evalData, setEvalData] = useState<Eval | null>(null);
  const [error, setError] = useState("");
  const [coachPlan, setCoachPlan] = useState<CoachPlan | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME);
  const [listening, setListening] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const answerStartedRef = useRef<number>(Date.now());

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Per-question timer
  useEffect(() => {
    if (step !== "interview" || loading) return;
    const t = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(t);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [step, loading, questionCount]);

  // Auto-submit when timer hits 0
  useEffect(() => {
    if (timeLeft === 0 && step === "interview" && !loading && input.trim().length >= 8) {
      sendAnswer();
    } else if (timeLeft === 0 && step === "interview" && !loading) {
      setError("⏱ Time's up! The interviewer is waiting — type at least a few words to continue.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  const finalRole = customRole.trim() || role;
  const displayRole = `${finalRole} (${level})`;
  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {}
    setListening(false);
  }, []);

  useEffect(() => () => stopListening(), [stopListening]);

  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError("Voice input isn't supported in this browser — try Chrome, or type your answer.");
      return;
    }
    setError("");
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    recognitionRef.current = rec;

    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results)
        .map((r: any) => r[0].transcript)
        .join("");
      setInput((prev) => (prev ? prev + " " : "") + transcript);
    };
    rec.onerror = (e: any) => {
      setListening(false);
      if (e.error !== "aborted" && e.error !== "no-speech") {
        setError(`Mic error: ${e.error} — or just type your answer.`);
      }
    };
    rec.onend = () => setListening(false);
    rec.start();
    setListening(true);
  }

  async function startInterview() {
    if (!finalRole) return;
    setError("");
    setStep("interview");
    setLoading(true);
    setTimeLeft(QUESTION_TIME);
    answerStartedRef.current = Date.now();
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

    // Quality gate: block lazy answers so the AI can evaluate fairly
    const wordCount = text.split(/\s+/).length;
    if (wordCount < 8 || text.length < 40) {
      setError(
        `Your answer is too short (${wordCount} words) for a fair evaluation. ` +
        `Aim for 2-3 sentences with a concrete example or clear reasoning — real interviewers expect substance.`
      );
      return;
    }
    stopListening();
    setError("");
    setInput("");
    const answerTime = fmtTime(Math.max(0, Math.floor((Date.now() - answerStartedRef.current) / 1000)));

    const newMessages: Msg[] = [...messages, { role: "user", content: text, time: answerTime }];
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
        setTimeLeft(QUESTION_TIME);
        answerStartedRef.current = Date.now();
      }
    } catch (e: any) {
      setError(e.message || "AI unavailable");
      setMessages(newMessages);
    } finally {
      setLoading(false);
    }
  }

  async function fixWeakness() {
    setCoachLoading(true);
    setError("");
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: displayRole,
          action: "coach",
          history: [
            {
              role: "user",
              content: `My interview report gave me these improvements: ${(evalData?.improvements || []).join(", ")}. ` +
                `Give me a targeted practice plan to fix my weakest skill.`,
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Coach unavailable");
      setCoachPlan(data.plan);
    } catch (e: any) {
      setError(e.message || "Coach unavailable");
    } finally {
      setCoachLoading(false);
    }
  }

  function downloadPDF() {
    if (!evalData) return;
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();

    doc.setFillColor(10, 14, 26);
    doc.rect(0, 0, pageW, doc.internal.pageSize.getHeight(), "F");
    doc.setTextColor(232, 236, 246);

    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text("InterviewIQ — Interview Report", 20, 30);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(139, 149, 179);
    doc.text(`Role: ${displayRole}`, 20, 40);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 47);

    doc.setTextColor(0, 206, 201);
    doc.setFontSize(40);
    doc.setFont("helvetica", "bold");
    doc.text(`${evalData.score || "–"} / 100`, 20, 70);
    doc.setTextColor(232, 236, 246);
    doc.setFontSize(18);
    doc.text(`Verdict: ${evalData.hiring || "Review"}`, 20, 82);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(139, 149, 179);
    doc.text(doc.splitTextToSize(evalData.verdict || "", pageW - 40), 20, 92);

    let y = 110;
    doc.setTextColor(0, 206, 201);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Strengths", 20, y);
    y += 6;
    doc.setTextColor(232, 236, 246);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    (evalData.strengths || []).forEach((s) => {
      const lines = doc.splitTextToSize(`✓  ${s}`, pageW - 40);
      doc.text(lines, 22, y);
      y += 5 * lines.length + 3;
    });

    y += 8;
    doc.setTextColor(253, 203, 110);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Improvements", 20, y);
    y += 6;
    doc.setTextColor(232, 236, 246);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    (evalData.improvements || []).forEach((s) => {
      const lines = doc.splitTextToSize(`→  ${s}`, pageW - 40);
      doc.text(lines, 22, y);
      y += 5 * lines.length + 3;
    });

    if (coachPlan) {
      y += 8;
      doc.setTextColor(162, 155, 254);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(`Practice Plan: ${coachPlan.skill}`, 20, y);
      y += 6;
      doc.setTextColor(232, 236, 246);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      (coachPlan.questions || []).forEach((q, i) => {
        const lines = doc.splitTextToSize(`${i + 1}.  ${q}`, pageW - 40);
        doc.text(lines, 22, y);
        y += 5 * lines.length + 3;
      });
    }

    doc.setTextColor(139, 149, 179);
    doc.setFontSize(9);
    doc.text("Generated by InterviewIQ — AI Mock Interview Coach (Hack Devengers 1.0)", 20, doc.internal.pageSize.getHeight() - 12);
    doc.save(`InterviewIQ-Report-${finalRole.replace(/\s+/g, "-")}.pdf`);
  }

  function reset() {
    setStep("setup");
    setMessages([]);
    setEvalData(null);
    setCoachPlan(null);
    setQuestionCount(0);
    setError("");
    setTimeLeft(QUESTION_TIME);
  }

  const timerWarn = timeLeft <= 15;

  return (
    <main className="min-h-screen bg-[#0a0e1a] text-[#e8ecf6]" style={{
      backgroundImage: "radial-gradient(1200px 600px at 80% -10%, #1e2a54 0%, transparent 60%), radial-gradient(800px 500px at -10% 20%, #1a2440 0%, transparent 55%)",
    }}>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">

        {/* Header */}
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] text-xl font-black shadow-[0_4px_20px_rgba(108,92,231,0.4)]">
              i
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">InterviewIQ</h1>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8b95b3]">AI Mock Interview Coach</p>
            </div>
          </div>
          {step !== "setup" && (
            <button
              onClick={reset}
              className="rounded-lg border border-[#232e4a] bg-[#131a2e] px-3 py-1.5 text-xs font-semibold text-[#e8ecf6] hover:border-[#6c5ce7]"
            >
              ↺ New Interview
            </button>
          )}
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-[#ff7675]/40 bg-[#ff7675]/10 px-4 py-3 text-sm text-[#ff7675]">
            ⚠️ {error}
          </div>
        )}

        {/* SETUP */}
        {step === "setup" && (
          <div className="rounded-3xl border border-[#232e4a] bg-gradient-to-b from-[#131a2e] to-[#0f1526] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-9">
            <h2 className="text-3xl font-extrabold tracking-tight">
              Ace your next{" "}
              <span className="bg-gradient-to-r from-[#a29bfe] to-[#00cec9] bg-clip-text text-transparent">interview.</span>
            </h2>
            <p className="mt-2 text-sm text-[#8b95b3]">
              Pick a role, get interviewed by AI, receive a strict hiring verdict — in under 10 minutes.
            </p>

            <label className="mt-7 mb-2 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#8b95b3]">Choose a role</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ROLES.map((r) => (
                <button
                  key={r}
                  onClick={() => { setRole(r); setCustomRole(""); }}
                  className={`rounded-xl border px-3 py-3 text-left text-sm font-semibold transition hover:-translate-y-px hover:border-[#6c5ce7] ${
                    role === r && !customRole
                      ? "border-transparent bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] shadow-[0_6px_24px_rgba(108,92,231,0.35)]"
                      : "border-[#232e4a] bg-[#1a2338] text-[#e8ecf6]"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <label className="mt-5 mb-2 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#8b95b3]">Or custom role</label>
            <input
              value={customRole}
              onChange={(e) => { setCustomRole(e.target.value); if (e.target.value) setRole(""); }}
              placeholder="e.g., Android Developer, UX Designer…"
              className="w-full rounded-xl border border-[#232e4a] bg-[#1a2338] px-4 py-3.5 text-sm text-[#e8ecf6] placeholder-[#8b95b3] outline-none focus:border-[#6c5ce7]"
            />

            <label className="mt-5 mb-2 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#8b95b3]">Experience level</label>
            <div className="flex gap-2">
              {["Entry-level", "Mid-level", "Senior"].map((l) => (
                <button
                  key={l}
                  onClick={() => setLevel(l)}
                  className={`flex-1 rounded-xl border px-4 py-3 text-sm font-bold transition ${
                    level === l
                      ? "border-[#00cec9] bg-[#00cec9]/10 text-[#00cec9]"
                      : "border-[#232e4a] bg-[#1a2338] text-[#e8ecf6]"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            <button
              onClick={startInterview}
              disabled={!finalRole || loading}
              className="mt-7 w-full rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] py-4 text-sm font-extrabold text-white shadow-[0_10px_40px_rgba(108,92,231,0.4)] transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? "Starting interview…" : "Start Mock Interview →"}
            </button>
            <p className="mt-3 text-center text-[11px] text-[#8b95b3]">
              {MAX_QUESTIONS} questions · {QUESTION_TIME}s each · voice or typed answers · instant AI verdict
            </p>
          </div>
        )}

        {/* INTERVIEW */}
        {step === "interview" && (
          <div className="rounded-3xl border border-[#232e4a] bg-gradient-to-b from-[#131a2e] to-[#0f1526] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-6">
            <div className="mb-4 flex items-center justify-between border-b border-[#232e4a] pb-3">
              <div>
                <p className="text-sm font-extrabold">{displayRole}</p>
                <p className="text-[11px] text-[#8b95b3]">Question {Math.min(questionCount, MAX_QUESTIONS)} of {MAX_QUESTIONS}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  {Array.from({ length: MAX_QUESTIONS }).map((_, i) => (
                    <div key={i} className={`h-1.5 w-6 rounded-full ${i < questionCount ? "bg-[#a29bfe]" : "bg-[#232e4a]"}`} />
                  ))}
                </div>
                <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-extrabold tabular-nums ${
                  timerWarn
                    ? "border-[#ff7675]/40 bg-[#ff7675]/10 text-[#ff7675]"
                    : "border-[#fdcb6e]/30 bg-[#fdcb6e]/10 text-[#fdcb6e]"
                }`}>
                  ⏱ {fmtTime(timeLeft)}
                </div>
              </div>
            </div>

            <div className="max-h-[45vh] space-y-3.5 overflow-y-auto py-2">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "rounded-br-md bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] text-white"
                        : "rounded-bl-md border border-[#232e4a] bg-[#1a2338] text-[#e8ecf6]"
                    }`}
                  >
                    {m.role === "user" && (
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider opacity-75">You</span>
                    )}
                    {m.content}
                    {m.time && m.role === "user" && (
                      <span className="mt-1.5 block text-[10px] opacity-60">⏱ {m.time}</span>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md border border-[#232e4a] bg-[#1a2338] px-4 py-3 text-sm text-[#8b95b3]">
                    <span className="inline-flex gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#8b95b3]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#8b95b3] [animation-delay:0.1s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#8b95b3] [animation-delay:0.2s]" />
                    </span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="mt-4 flex gap-2.5">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendAnswer()}
                placeholder="Type your answer, or tap the mic…"
                className="flex-1 rounded-xl border border-[#232e4a] bg-[#1a2338] px-4 py-3 text-sm text-[#e8ecf6] placeholder-[#8b95b3] outline-none focus:border-[#6c5ce7]"
                disabled={loading}
              />
              <button
                onClick={listening ? stopListening : startListening}
                className={`w-13 rounded-xl border px-4 text-lg transition ${
                  listening
                    ? "animate-pulse border-[#ff7675] bg-[#ff7675] text-white"
                    : "border-[#232e4a] bg-[#1a2338] text-[#8b95b3] hover:border-[#6c5ce7]"
                }`}
                title="Voice input"
              >
                🎤
              </button>
              <button
                onClick={sendAnswer}
                disabled={loading || !input.trim()}
                className="rounded-xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] px-5 py-3 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? "…" : "Send"}
              </button>
            </div>
          </div>
        )}

        {/* REPORT */}
        {step === "report" && evalData && (
          <div className="rounded-3xl border border-[#232e4a] bg-gradient-to-b from-[#131a2e] to-[#0f1526] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-8">
            {/* Verdict banner — front and center */}
            <div className={`flex flex-col items-center gap-4 rounded-2xl border p-5 text-center sm:flex-row sm:text-left ${
              evalData.hiring?.includes("Hire") && !evalData.hiring.includes("No Hire")
                ? "border-[#00cec9]/40 bg-gradient-to-r from-[#00cec9]/15 to-transparent"
                : evalData.hiring?.includes("Lean")
                ? "border-[#fdcb6e]/40 bg-gradient-to-r from-[#fdcb6e]/15 to-transparent"
                : "border-[#ff7675]/40 bg-gradient-to-r from-[#ff7675]/15 to-transparent"
            }`}>
              <div
                className={`flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-full border-8 text-3xl font-black ${
                  evalData.score >= 70
                    ? "border-[#00cec9]/40 bg-[#00cec9]/10 text-[#00cec9]"
                    : evalData.score >= 45
                    ? "border-[#fdcb6e]/40 bg-[#fdcb6e]/10 text-[#fdcb6e]"
                    : "border-[#ff7675]/40 bg-[#ff7675]/10 text-[#ff7675]"
                }`}
              >
                {evalData.score || "–"}
              </div>
              <div className="flex-1">
                <h3 className="text-3xl font-black tracking-tight">{evalData.hiring || "Review"}</h3>
                <p className="mt-1 text-sm text-[#8b95b3]">{evalData.verdict}</p>
                <span className={`mt-2 inline-block rounded-full px-3.5 py-1 text-xs font-extrabold uppercase tracking-wider ${
                  evalData.hiring?.includes("Hire") && !evalData.hiring.includes("No Hire")
                    ? "bg-[#00cec9]/15 text-[#00cec9]"
                    : evalData.hiring?.includes("Lean")
                    ? "bg-[#fdcb6e]/15 text-[#fdcb6e]"
                    : "bg-[#ff7675]/15 text-[#ff7675]"
                }`}>
                  Verdict: {evalData.hiring || "Review"}
                </span>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-[#232e4a] bg-[#1a2338] p-4">
                <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#00cec9]">Strengths</h3>
                <ul className="space-y-2">
                  {(evalData.strengths || []).map((s, i) => (
                    <li key={i} className="flex gap-2 text-sm text-[#e8ecf6]">
                      <span className="font-bold text-[#00cec9]">✓</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-[#232e4a] bg-[#1a2338] p-4">
                <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#fdcb6e]">Improve</h3>
                <ul className="space-y-2">
                  {(evalData.improvements || []).map((s, i) => (
                    <li key={i} className="flex gap-2 text-sm text-[#e8ecf6]">
                      <span className="font-bold text-[#fdcb6e]">→</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {!coachPlan ? (
              <button
                onClick={fixWeakness}
                disabled={coachLoading}
                className="mt-5 w-full rounded-2xl border border-dashed border-[#6c5ce7]/60 bg-gradient-to-r from-[#6c5ce7]/15 to-[#00cec9]/10 py-3.5 text-sm font-bold text-[#a29bfe] transition hover:bg-[#6c5ce7]/25 disabled:opacity-50"
              >
                {coachLoading ? "Generating your practice plan…" : "🎯 Fix My Weakness — Get a Targeted Practice Plan"}
              </button>
            ) : (
              <div className="mt-5 rounded-2xl border border-[#6c5ce7]/40 bg-gradient-to-br from-[#6c5ce7]/15 to-[#00cec9]/10 p-5">
                <h3 className="text-sm font-extrabold text-[#a29bfe]">🎯 Practice Plan: {coachPlan.skill}</h3>
                <ol className="mt-3 space-y-2">
                  {coachPlan.questions.map((q, i) => (
                    <li key={i} className="flex gap-2 text-sm text-[#e8ecf6]">
                      <span className="font-bold text-[#a29bfe]">{i + 1}.</span> {q}
                    </li>
                  ))}
                </ol>
                {coachPlan.tip && (
                  <p className="mt-3 rounded-xl bg-black/25 px-3 py-2 text-xs text-[#8b95b3]">💡 {coachPlan.tip}</p>
                )}
              </div>
            )}

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
              <button
                onClick={reset}
                className="flex-1 rounded-xl border border-[#232e4a] bg-[#1a2338] py-3 text-sm font-bold text-[#e8ecf6] transition hover:border-[#6c5ce7]"
              >
                ↺ Practice Again
              </button>
              <button
                onClick={downloadPDF}
                className="flex-1 rounded-xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] py-3 text-sm font-bold text-white shadow-[0_8px_30px_rgba(108,92,231,0.35)] transition hover:-translate-y-px"
              >
                ⬇ Download PDF Report
              </button>
            </div>
          </div>
        )}

        <footer className="mt-8 text-center text-[11px] text-[#8b95b3]">
          Built for Hack Devengers 1.0 · AI-powered mock interviews · 9 Aug 2026
        </footer>
      </div>
    </main>
  );
}
