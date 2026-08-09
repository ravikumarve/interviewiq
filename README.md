# 🎯 InterviewIQ — AI Mock Interview Coach

> Practice real interview questions for any role. Get instant, skill-based AI feedback. Built for **Hack Devengers 1.0** (9 Aug 2026).

## The Problem

Most students and job seekers fail interviews not because they lack knowledge, but because they **never practiced under realistic conditions**. Existing mock-interview tools are either paid, generic, or give no actionable feedback.

**InterviewIQ solves this:** a free, instant, AI-powered mock interview that asks realistic role-specific questions, adapts to your experience level, and produces a **scored report with strengths, improvements, and a hiring verdict** — in under 10 minutes.

## Key Features

- 🎯 **Role-based interviews** — Frontend, Backend, Data Science, PM, DevOps, AI/ML, custom roles
- 📊 **Adaptive difficulty** — Entry-level → Mid-level → Senior
- 🤖 **Live AI interviewer** — real questions, one at a time, like a real interview
- 📋 **Instant AI evaluation** — score (0–100), verdict, strengths, improvements, hiring recommendation
- 📱 **Fully responsive** — works on desktop and mobile
- 🖨 **Exportable report** — save or print your results

## Tech Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS)
- **NVIDIA NIM API** — `meta/llama-3.1-8b-instruct` (fast, live AI)
- **Ollama fallback** — local CPU inference if no API key

## Getting Started

```bash
npm install
cp .env.example .env.local   # add your NVIDIA_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How It Works

1. Pick a role and experience level
2. Answer 5 realistic interview questions
3. AI generates a structured evaluation report
4. Practice again with targeted improvement areas

## Environment Variables

| Variable | Description |
|---|---|
| `NVIDIA_API_KEY` | NVIDIA NIM API key (get at build.nvidia.com) |
| `NVIDIA_MODEL` | Optional — default `meta/llama-3.1-8b-instruct` |
| `OLLAMA_URL` | Optional — local fallback, default `http://localhost:11434` |

## Live Demo

**🔗 https://interviewiq-hazel.vercel.app** — deployed on Vercel (Hack Devengers 1.0)

---

Built solo in 8 hours for Hack Devengers 1.0. Think. Build. Innovate.
