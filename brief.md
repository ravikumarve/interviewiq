# InterviewIQ — Hackathon Brief

**One-liner:** AI interview practice that tells the truth — a strict, unbiased evaluator that scores every answer and hands you a personalized skill-fixing plan.

## Problem
Mock interviews are expensive, inconsistent, and flattering. Real feedback is scarce. Candidates practice with "lazy" AI tools that accept any answer, so they never learn where they actually fail.

## Solution
InterviewIQ runs a 5-question live interview for a chosen role, scores each session against a strict rubric, and outputs an honest verdict (Hire / Lean Hire / No Hire) with concrete strengths, weaknesses, and a targeted practice plan.

## How it works
1. **Role select** — pick a role (Frontend, Backend, Full-Stack, Data, DevOps, QA, Product, ML) and level (Junior / Mid / Senior)
2. **Live interview** — an interviewer AI asks realistic, role-specific questions one at a time. Speak (voice input) or type. A 90-second timer keeps it real; answers shorter than 2–3 sentences are rejected by the depth gate
3. **Report** — after question 5, a strict evaluator scores the entire conversation (0–100) and stamps a hiring verdict. The report lists strengths, improvement areas, and offers a coach plan to fix the weakest skill — all exportable as PDF and shareable

## Differentiators
- **Strict evaluator** — lazy answers score <35 (No Hire); detailed answers score 85+ (Lean Hire). No participation trophies
- **Quality gate** — answers under 8 words are blocked before they reach the evaluator
- **Skill fixer** — the coach reads your weakest area from the report and generates a personalized practice plan (verified: generates targeted React state management drills)
- **Voice input** — answer out loud like a real interview, no typing needed
- **Dossier-style report** — verdict stamp, scorecard, weakness memo; PDF export + share button

## Tech
- **Frontend:** Next.js 16 (App Router), React, Tailwind — static-first, zero client bloat
- **AI:** llama-3.1-8b via NVIDIA NIM (fast, ~450ms/question) with automatic Ollama local fallback
- **Deployment:** Vercel (serverless API route)

## Verification
- Full 3-screen flow tested end-to-end in-browser (role select → interview → report)
- Evaluator calibrated: detailed answers → 85 / Lean Hire; lazy "yes" answers → <35 / No Hire
- Interviewer stays on-topic: asks fresh questions across topics, never writes code
- Responsive down to 720px; tested on desktop and mobile viewports with zero horizontal overflow

## Repo
github.com/ravikumarve/interviewiq — public, demo live at https://interviewiq-hazel.vercel.app
