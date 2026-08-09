"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { jsPDF } from "jspdf";

type Msg = { role: "user" | "assistant"; content: string };
type Eval = {
  score: number;
  verdict: string;
  strengths: string[];
  improvements: string[];
  hiring: string;
};
type CoachPlan = { skill: string; questions: string[]; tip: string };

const ROLES = [
  { tag: "ENG · 01", name: "Frontend Developer" },
  { tag: "ENG · 02", name: "Backend Developer" },
  { tag: "ENG · 03", name: "Full-Stack Developer" },
  { tag: "DATA · 04", name: "Data Scientist" },
  { tag: "PROD · 05", name: "Product Manager" },
  { tag: "OPS · 06", name: "DevOps Engineer" },
  { tag: "AI · 07", name: "AI/ML Engineer" },
  { tag: "ENG · 08", name: "SWE Intern" },
];

const DIFFICULTIES = [
  "Technical · Depth check",
  "Behavioral · Scenario",
  "System · Trade-offs",
  "Technical · Debugging",
  "Behavioral · Judgment",
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
  const [role, setRole] = useState(ROLES[0].name);
  const [customRole, setCustomRole] = useState("");
  const [level, setLevel] = useState("Entry-level");
  const [jd, setJd] = useState("");
  const [history, setHistory] = useState<Msg[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [input, setInput] = useState("");
  const [questionCount, setQuestionCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [evalData, setEvalData] = useState<Eval | null>(null);
  const [error, setError] = useState("");
  const [coachPlan, setCoachPlan] = useState<CoachPlan | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME);
  const [listening, setListening] = useState(false);
  const [followUpActive, setFollowUpActive] = useState(false);
  const recognitionRef = useRef<any>(null);
  const answerStartedRef = useRef<number>(Date.now());
  const didTimeUpRef = useRef(false);
  const followUpsRef = useRef(0); // follow-ups used on the current question (max 2)

  const VAGUE_WORD_MAX = 14; // answers at/below this many words trigger a follow-up probe
  const MAX_FOLLOWUPS = 2;

  const finalRole = customRole.trim() || role;
  const displayRole = `${finalRole} (${level})`;
  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = String(s % 60).padStart(2, "0");
    return `${String(m).padStart(2, "0")}:${sec}`;
  };

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

  // Per-question timer
  useEffect(() => {
    if (step !== "interview" || loading) return;
    didTimeUpRef.current = false;
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

  // Auto-submit when timer hits 0 (respects the same depth gate)
  useEffect(() => {
    if (timeLeft === 0 && step === "interview" && !loading && !didTimeUpRef.current) {
      didTimeUpRef.current = true;
      const words = input.trim().split(/\s+/).filter(Boolean).length;
      if (words >= 8 && input.trim().length >= 40) {
        sendAnswer();
      } else {
        setError("Time's up — the interviewer is waiting. Give a real answer to continue.");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

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
          jd,
          history: [{ role: "user", content: `Please start the interview for the ${displayRole} role.` }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start");
      setCurrentQuestion(data.question);
      setHistory([{ role: "assistant", content: data.question }]);
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

    const wordCount = text.split(/\s+/).length;
    if (wordCount < 8 || text.length < 40) {
      setError(
        `Answer too short (${wordCount} words) for a fair evaluation. ` +
          `Aim for 2-3 sentences with a concrete example or clear reasoning.`
      );
      return;
    }
    stopListening();
    setError("");
    setInput("");
    didTimeUpRef.current = true;

    const userMsg: Msg = { role: "user", content: text };
    const newHistory: Msg[] = [...history, userMsg];
    setHistory(newHistory);
    setLoading(true);

    try {
      const nextCount = questionCount + 1;
      const isDone = questionCount >= MAX_QUESTIONS;
      // Vague answers (short, thin) get ONE adaptive follow-up instead of a new topic —
      // a real interviewer would say "tell me more." Never consumes a numbered question.
      const wantsFollowUp =
        !isDone &&
        followUpsRef.current < MAX_FOLLOWUPS &&
        wordCount <= VAGUE_WORD_MAX;
      const action = isDone ? "evaluate" : wantsFollowUp ? "followup" : "question";
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: displayRole,
          action,
          jd,
          history: newHistory,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI call failed");

      if (isDone && data.evaluation) {
        setEvalData(data.evaluation);
        setStep("report");
      } else {
        setCurrentQuestion(data.question);
        setHistory([...newHistory, { role: "assistant", content: data.question }]);
        if (action === "followup") {
          followUpsRef.current += 1;
          setFollowUpActive(true);
        } else {
          followUpsRef.current = 0;
          setFollowUpActive(false);
          setQuestionCount(nextCount);
        }
        setTimeLeft(QUESTION_TIME);
        answerStartedRef.current = Date.now();
      }
    } catch (e: any) {
      setError(e.message || "AI unavailable");
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

    // Dossier dark theme
    doc.setFillColor(27, 26, 24);
    doc.rect(0, 0, pageW, doc.internal.pageSize.getHeight(), "F");
    doc.setTextColor(237, 233, 225);
    doc.setFont("times", "bold");
    doc.setFontSize(26);
    doc.text("InterviewIQ", 20, 28);
    doc.setFont("courier", "normal");
    doc.setFontSize(9);
    doc.setTextColor(91, 86, 76);
    doc.text(`FILE #IQ-${String(Date.now()).slice(-4)} · ASSESSED ${new Date().toLocaleDateString()}`, 20, 36);
    doc.setTextColor(155, 146, 132);
    doc.text(`${displayRole.toUpperCase()} · ${questionCount}/${MAX_QUESTIONS} QUESTIONS ANSWERED`, 20, 44);

    doc.setFont("times", "bold");
    doc.setFontSize(52);
    doc.setTextColor(237, 233, 225);
    doc.text(String(evalData.score || "–"), 20, 76);
    doc.setFont("courier", "normal");
    doc.setFontSize(11);
    doc.setTextColor(91, 86, 76);
    doc.text("/ 100", 52, 76);
    doc.setFont("times", "bold");
    doc.setFontSize(18);
    doc.setTextColor(92, 138, 106);
    doc.text(`VERDICT: ${(evalData.hiring || "Review").toUpperCase()}`, 20, 92);
    doc.setFont("times", "normal");
    doc.setFontSize(11);
    doc.setTextColor(155, 146, 132);
    doc.text(doc.splitTextToSize(evalData.verdict || "", pageW - 40), 20, 102);

    let y = 126;
    doc.setFont("courier", "bold");
    doc.setFontSize(10);
    doc.setTextColor(92, 138, 106);
    doc.text("+ STRENGTHS", 20, y);
    y += 6;
    doc.setFont("times", "normal");
    doc.setFontSize(11);
    doc.setTextColor(237, 233, 225);
    (evalData.strengths || []).forEach((s) => {
      const lines = doc.splitTextToSize(s, pageW - 44);
      doc.text(lines, 24, y);
      y += 5 * lines.length + 3;
    });

    y += 8;
    doc.setFont("courier", "bold");
    doc.setTextColor(178, 74, 63);
    doc.text("- NEEDS WORK", 20, y);
    y += 6;
    doc.setFont("times", "normal");
    doc.setTextColor(237, 233, 225);
    (evalData.improvements || []).forEach((s) => {
      const lines = doc.splitTextToSize(s, pageW - 44);
      doc.text(lines, 24, y);
      y += 5 * lines.length + 3;
    });

    if (coachPlan) {
      y += 8;
      doc.setFont("courier", "bold");
      doc.setTextColor(203, 161, 53);
      doc.text(`TARGETED PRACTICE PLAN — ${coachPlan.skill.toUpperCase()}`, 20, y);
      y += 6;
      doc.setFont("times", "normal");
      doc.setTextColor(237, 233, 225);
      (coachPlan.questions || []).forEach((q, i) => {
        const lines = doc.splitTextToSize(`${i + 1}. ${q}`, pageW - 44);
        doc.text(lines, 24, y);
        y += 5 * lines.length + 3;
      });
      if (coachPlan.tip) {
        doc.setFont("courier", "normal");
        doc.setFontSize(9);
        doc.setTextColor(91, 86, 76);
        doc.text(doc.splitTextToSize(coachPlan.tip, pageW - 44), 24, y + 4);
      }
    }

    doc.save(`InterviewIQ-Report-${finalRole.replace(/\s+/g, "-")}.pdf`);
  }

  function reset() {
    setStep("setup");
    setHistory([]);
    setCurrentQuestion("");
    setEvalData(null);
    setCoachPlan(null);
    setQuestionCount(0);
    setError("");
    setTimeLeft(QUESTION_TIME);
    setInput("");
  }

  const progress = questionCount / MAX_QUESTIONS;
  const words = input.trim().split(/\s+/).filter(Boolean).length;
  const gateOk = words >= 8 && input.trim().length >= 40;
  const timerWarn = timeLeft <= 15;
  const stampClass = evalData?.hiring?.includes("No Hire")
    ? "no"
    : evalData?.hiring?.includes("Lean")
    ? "lean"
    : "";
  const stampText = (evalData?.hiring || "Review").toUpperCase();

  return (
    <main className="flex-1">
      <div className="wrap">
        {error && (
          <div
            style={{
              border: "1px solid var(--no)",
              background: "var(--no-soft)",
              color: "var(--no)",
              padding: "10px 16px",
              fontSize: "13px",
              marginTop: "16px",
              fontFamily: "var(--mono)",
            }}
          >
            {error}
          </div>
        )}

        {/* ── SCREEN 1 · ROLE SELECT ── */}
        {step === "setup" && (
          <>
            <div className="case-header">
              <div className="case-mark">
                <div className="glyph">iQ</div>
                <div className="word">InterviewIQ</div>
              </div>
              <div className="case-meta">
                AI MOCK INTERVIEW COACH
                <br />
                STRICT EVALUATION PROTOCOL
              </div>
            </div>

            <div className="hero">
              <h1>
                Practice like it&apos;s <em>real.</em> Get told the <em>truth.</em>
              </h1>
              <p>
                Five realistic questions, one AI hiring manager who doesn&apos;t do fake praise, and a
                targeted plan for exactly what&apos;s holding you back.
              </p>
              <div className="promise">
                <span>
                  <b>5</b> questions
                </span>
                <span>
                  <b>~8 min</b> total
                </span>
                <span>
                  <b>0</b> generic feedback
                </span>
              </div>
            </div>

            <div className="assignment-label">Select assignment</div>
            <div className="role-grid">
              {ROLES.map((r) => (
                <button
                  key={r.name}
                  onClick={() => {
                    setRole(r.name);
                    setCustomRole("");
                  }}
                  className={`role-card ${role === r.name && !customRole ? "selected" : ""}`}
                >
                  <div className="tag">{r.tag}</div>
                  <div className="name">{r.name}</div>
                </button>
              ))}
            </div>
            <div className="custom-row">
              <input
                type="text"
                value={customRole}
                onChange={(e) => {
                  setCustomRole(e.target.value);
                  if (e.target.value) setRole("");
                }}
                placeholder="Or type any role — e.g. 'Growth Marketer, Series A startup'"
              />
            </div>

            <div className="assignment-label">Experience level</div>
            <div className="level-row">
              {["Entry-level", "Mid-level", "Senior"].map((l) => (
                <button
                  key={l}
                  onClick={() => setLevel(l)}
                  className={`level-pill ${level === l ? "selected" : ""}`}
                >
                  {l}
                </button>
              ))}
            </div>

            <div className="assignment-label">
              Job description <span className="jd-optional">OPTIONAL · QUESTIONS ADAPT TO IT</span>
            </div>
            <textarea
              className="jd-box"
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder={
                "Paste a real job posting here and the interviewer will drill into exactly what it asks for — stack, tools, responsibilities.\n\n" +
                "e.g. 'We need a React developer with 3+ years of TypeScript, state management (Redux/Zustand), and experience with REST API integration…'"
              }
              rows={4}
            />

            <div className="start-row">
              <button className="btn-primary" onClick={startInterview} disabled={!finalRole || loading}>
                {loading ? "Starting…" : "Start Mock Interview"} →
              </button>
              <div className="start-fine">No sign-up · No fake praise · Straight verdict</div>
            </div>
          </>
        )}

        {/* ── SCREEN 2 · LIVE INTERVIEW ── */}
        {step === "interview" && (
          <>
            <div className="case-header">
              <div className="case-mark">
                <div className="glyph">iQ</div>
                <div className="word">InterviewIQ</div>
              </div>
              <div className="case-meta">{finalRole.toUpperCase()} · {level.toUpperCase()}</div>
            </div>

            <div className="interview-top">
              <div className="q-counter">
                Question <b>{Math.min(questionCount, MAX_QUESTIONS)}</b> of <b>{MAX_QUESTIONS}</b>
                {followUpActive && <span className="followup-tag">· FOLLOW-UP</span>}
              </div>
              <div className={`timer ${timerWarn ? "warn" : ""}`}>
                <span className="rec"></span>
                {fmtTime(timeLeft)}
              </div>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress * 100}%` }}></div>
            </div>

            <div className="interviewer-block">
              <div className="who">Interviewer</div>
              <div className="question-card">
                <p>{loading ? "Reading your answer and drafting the next question…" : currentQuestion}</p>
                <div className="difficulty">
                  {DIFFICULTIES[(questionCount - 1) % DIFFICULTIES.length]}
                </div>
              </div>
            </div>

            <div className="answer-block">
              <div className="who">
                <span>Your Answer</span>
                <span
                  className={`voice-toggle ${listening ? "on" : ""}`}
                  onClick={listening ? stopListening : startListening}
                >
                  <span className="dot"></span>
                  {listening ? "Voice input active" : "Tap for voice input"}
                </span>
              </div>
              <textarea
                className="iq-answer"
                placeholder="Speak or type your answer — be specific, use a real example if you can."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading}
              ></textarea>
            </div>

            <div className="answer-foot">
              <div className={`gate-hint ${gateOk || !input.trim() ? "" : "warn"}`}>
                {!input.trim()
                  ? "Minimum depth: 2-3 sentences with a real example"
                  : gateOk
                  ? "Minimum answer depth reached — evaluator will accept this"
                  : `Answer too short (${words} words) — evaluator needs more depth`}
              </div>
              <button className="btn-primary" onClick={sendAnswer} disabled={loading}>
                {loading ? "Evaluating…" : "Submit Answer"} →
              </button>
            </div>
          </>
        )}

        {/* ── SCREEN 3 · REPORT ── */}
        {step === "report" && evalData && (
          <>
            <div className="case-header">
              <div className="case-mark">
                <div className="glyph">iQ</div>
                <div className="word">InterviewIQ</div>
              </div>
              <div className="case-meta">
                FILE #IQ-{String(Date.now()).slice(-4)}
                <br />
                ASSESSED {new Date().toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}
              </div>
            </div>

            <div className="report-head">
              <div className="role-line">
                {finalRole.toUpperCase()} · {level.toUpperCase()} · {questionCount}/{MAX_QUESTIONS} QUESTIONS ANSWERED
              </div>
              <h2>Assessment Report</h2>
            </div>

            <div className="verdict-zone">
              <div className="verdict-left">
                <div className="score-dial">
                  <span className="num">{evalData.score || "–"}</span>
                  <span className="of100">/ 100</span>
                </div>
                <div className="score-bar">
                  <div
                    className="score-bar-fill"
                    style={{
                      width: `${Math.min(100, evalData.score || 0)}%`,
                      background:
                        evalData.score >= 70 ? "var(--hire)" : evalData.score >= 45 ? "var(--signal)" : "var(--no)",
                    }}
                  ></div>
                </div>
                <div className="score-sub">{evalData.verdict}</div>
              </div>
              <div className="verdict-right">
                <div className={`stamp ${stampClass}`}>{stampText}</div>
              </div>
            </div>

            <div className="scorecard-grid">
              <div className="scorecard-col strength">
                <div className="h">◆ Strengths</div>
                <ul>
                  {(evalData.strengths || []).map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
              <div className="scorecard-col improve">
                <div className="h">◆ Needs Work</div>
                <ul>
                  {(evalData.improvements || []).map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="weakness-memo">
              <div className="h">⚑ Weakest signal detected — {(evalData.improvements?.[0] || "communication structure").slice(0, 40)}</div>
              <p>
                {(evalData.improvements?.[0] || "Your reasoning is solid, but answers can wander before landing on the point.")}{" "}
                In a real interview this reads as uncertainty even when the knowledge is there. We can generate
                3 targeted practice questions for this specific pattern.
              </p>
              {!coachPlan ? (
                <button className="btn-ghost" onClick={fixWeakness} disabled={coachLoading}>
                  {coachLoading ? "Generating plan…" : "Fix My Weakness →"}
                </button>
              ) : (
                <div className="coach-plan">
                  <div className="cp-title">TARGETED PRACTICE PLAN — {coachPlan.skill.toUpperCase()}</div>
                  <ol>
                    {coachPlan.questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ol>
                  {coachPlan.tip && <div className="tip">💡 {coachPlan.tip}</div>}
                </div>
              )}
            </div>

            <div className="report-actions">
              <button className="btn-outline" onClick={downloadPDF}>
                ↓ Download PDF Report
              </button>
              <button className="btn-outline" onClick={reset}>
                ↻ Retry This Role
              </button>
              <button
                className="btn-outline"
                onClick={async () => {
                  const text = `I scored ${evalData.score}/100 (${evalData.hiring}) on InterviewIQ — AI mock interview coach.`;
                  try {
                    if (navigator.share) {
                      await navigator.share({ title: "InterviewIQ Report", text, url: window.location.href });
                    } else {
                      await navigator.clipboard.writeText(`${text} ${window.location.href}`);
                      setError("Report link copied to clipboard");
                    }
                  } catch {}
                }}
              >
                Share Result
              </button>
            </div>
          </>
        )}

        <div className="foot">InterviewIQ · AI mock interview coach · 9 Aug 2026</div>
      </div>
    </main>
  );
}
