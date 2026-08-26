# Lyra

Lyra is a prompt optimization studio. Paste a rough ask, pick Basic or Detail mode, and get a paste-ready prompt built with the **4-D method**: Deconstruct, Diagnose, Develop, Deliver.

It does not call ChatGPT, Claude, or Gemini. The optimizer runs locally in this app. You copy the result into the model of your choice.

## What you get

- **Basic mode** — immediate rewrite using core techniques (role, constraints, output contract).
- **Detail mode** — two or three clarifying questions when the brief is missing audience, format, or constraints; skip to use labeled defaults.
- **Request types** — auto-detect, or lock Creative, Technical, Educational, or Complex.
- **Platform formatting** — markdown sections for ChatGPT, XML-style tags for Claude, numbered comparative structure for Gemini.
- **4-D trace** — see intent, gaps, techniques, and what changed.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:43127](http://localhost:43127).

```bash
npm run build
npm start
```

No API keys. No database.

## How the engine chooses techniques

| Type | Emphasis |
| --- | --- |
| Creative | Multi-perspective angles, tone lock, anti-cliché constraints |
| Technical | Constraint-based reasoning, failure modes, precision |
| Educational | Few-shot shape, progressive disclosure, misconception handling |
| Complex | Staged analysis, decision framework, kill criteria |

## Stack

Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui.
