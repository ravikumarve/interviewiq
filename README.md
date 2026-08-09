# 🎯 InterviewIQ — AI Mock Interview Coach

> Practice real interviews for any role. Get instant, honest AI feedback — and a targeted plan to fix your weaknesses. Built for **Hack Devengers 1.0** (9 Aug 2026).

<div align="center">

**🔗 Live Demo: https://interviewiq-hazel.vercel.app**

</div>

---

## The Problem

Most students and job seekers fail interviews not because they lack knowledge, but because they **never practice under realistic conditions**. Existing mock-interview tools are either paid, generic, or give no actionable feedback — they tell you "good job" without ever telling you what to fix.

**InterviewIQ solves this:** a free, instant, AI-powered mock interview that asks realistic role-specific questions, adapts to your experience level, scores you like a **strict hiring manager**, and generates a **targeted practice plan** for your weakest skills — all in under 10 minutes.

## Key Features

- 🎯 **Role-based interviews** — Frontend, Backend, Data Science, PM, DevOps, AI/ML, or any custom role
- 📊 **Adaptive difficulty** — Entry-level → Mid-level → Senior
- 🤖 **Live AI interviewer** — one realistic question at a time, like a real interview
- ⚖️ **Strict, honest evaluation** — one-word answers score <30 / **No Hire**; detailed, example-backed answers score 80+ / Hire. No fake praise.
- 🚫 **Answer quality gate** — blocks lazy answers so every evaluation is fair
- 🎯 **Fix My Weakness** — AI detects your weakest skill and generates 3 targeted practice questions + a study tip
- 📋 **Structured report** — score (0–100), verdict, strengths, improvements, hiring recommendation
- 📱 **Fully responsive** — works on desktop and mobile
- 🖨 **Exportable report** — save or print your results

## Tech Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS)
- **NVIDIA NIM API** — `meta/llama-3.1-8b-instruct` (fast, live AI, ~450ms)
- **Ollama fallback** — local CPU inference if no API key
- **Vercel** — instant global deployment

## How It Works

1. **Pick a role** — choose from 8 preset roles, or type any custom role + experience level
2. **Answer 5 questions** — a live AI interviewer asks realistic questions one at a time
3. **Get your report** — strict AI evaluation: score, verdict, strengths, improvements, hiring decision
4. **Fix your weakness** — one click generates a targeted practice plan for your weakest skill

## Getting Started

```bash
npm install
cp .env.example .env.local   # add your NVIDIA_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Description |
|---|---|
| `NVIDIA_API_KEY` | NVIDIA NIM API key (free at build.nvidia.com) |
| `NVIDIA_MODEL` | Optional — default `meta/llama-3.1-8b-instruct` |
| `OLLAMA_URL` | Optional — local fallback, default `http://localhost:11434` |
| `OLLAMA_MODEL` | Optional — local fallback model, default `tinyllama` |

## API

`POST /api/interview` with `{ role, history, action }`:

| action | returns |
|---|---|
| `question` | next interview question |
| `evaluate` | `{ evaluation: { score, verdict, strengths, improvements, hiring } }` |
| `coach` | `{ plan: { skill, questions, tip } }` — targeted practice plan |

## Live Demo

**🔗 https://interviewiq-hazel.vercel.app**

---

Built solo in 8 hours for Hack Devengers 1.0. Think. Build. Innovate.
