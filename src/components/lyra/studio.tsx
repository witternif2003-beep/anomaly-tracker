"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  LoaderCircleIcon,
  SparklesIcon,
  WandSparklesIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "@/components/lyra/copy-button";
import { FourDRail, type FourDPhase } from "@/components/lyra/four-d-rail";
import { LatticeRail } from "@/components/lyra/lattice-rail";
import { SuggestionBot } from "@/components/lyra/suggestion-bot";
import { idleLyra2Lattice } from "@/lib/optimize/lyra2";
import { EXAMPLES, PLATFORM_LABELS } from "@/lib/examples";
import type {
  Mode,
  OptimizeResult,
  Platform,
  RequestTypeChoice,
} from "@/lib/optimize";
import { ghostHandEngaged, parseMode } from "@/lib/optimize/types";
import type { AipScan } from "@/lib/aip-sigma0/scanner";
import { cn } from "@/lib/utils";

const PHASES: FourDPhase[] = ["deconstruct", "diagnose", "develop", "deliver"];

export function Studio() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("detail");
  const [requestType, setRequestType] = useState<RequestTypeChoice>("auto");
  const [platform, setPlatform] = useState<Platform>("chatgpt");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<FourDPhase>("idle");
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  const canSubmit = input.trim().length >= 8 && !busy;
  const latticeOn = ghostHandEngaged(mode);

  async function run(opts?: { skipQuestions?: boolean; nextAnswers?: Record<string, string> }) {
    setBusy(true);
    setError(null);
    setPhase("deconstruct");
    const started = Date.now();
    let tick = 0;
    const stepper = window.setInterval(() => {
      tick += 1;
      if (tick < PHASES.length) setPhase(PHASES[tick]);
    }, 280);
    try {
      const response = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          mode,
          requestType,
          platform,
          answers: opts?.nextAnswers ?? answers,
          skipQuestions: opts?.skipQuestions ?? false,
        }),
      });
      const data = (await response.json()) as OptimizeResult & { error?: string };
      const wait = Math.max(0, 900 - (Date.now() - started));
      if (wait) await new Promise((r) => window.setTimeout(r, wait));
      if (!response.ok) {
        setResult(null);
        setError(data.error ?? "Optimization failed.");
        setPhase("idle");
        return;
      }
      setResult(data);
      setPhase(data.status === "questions" ? "questions" : "complete");
    } catch {
      setError("Could not reach the optimizer. Try again.");
      setPhase("idle");
    } finally {
      window.clearInterval(stepper);
      setBusy(false);
    }
  }

  function loadExample(prompt: string) {
    setInput(prompt);
    setResult(null);
    setAnswers({});
    setError(null);
    setPhase("idle");
    setDismissed(new Set());
  }

  function reset() {
    setInput("");
    setResult(null);
    setAnswers({});
    setError(null);
    setPhase("idle");
    setDismissed(new Set());
  }

  function applyInsert(insert: string) {
    setInput((prev) => {
      const trimmed = prev.trimEnd();
      if (!trimmed) return insert;
      if (trimmed.includes(insert)) return prev;
      return `${trimmed}\n\n${insert}`;
    });
  }

  const empty = !result && !busy && !error;

  return (
    <div className="relative flex flex-1 flex-col">
      <header className="border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <LyreMark />
            <div>
              <p className="font-heading text-2xl leading-none tracking-tight">Lyra</p>
              <p className="mt-1 text-xs tracking-[0.14em] text-muted-foreground uppercase">
                GHOST-HAND · Lyra-2 · Post-doc ·{" "}
                <Link href="/aip" className="underline-offset-4 hover:underline">
                  AIP-Σ0
                </Link>
                {" · "}
                <Link href="/inventory" className="underline-offset-4 hover:underline">
                  Inventory
                </Link>
                {" · "}
                <Link href="/corporate" className="underline-offset-4 hover:underline">
                  Corporate
                </Link>
              </p>
            </div>
          </div>
          <Tabs
            value={mode}
            onValueChange={(value) => {
              const next = parseMode(value);
              setMode(next);
              setResult(null);
              setPhase("idle");
              setAnswers({});
              setDismissed(new Set());
            }}
          >
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="detail">GHOST-HAND</TabsTrigger>
              <TabsTrigger value="postdoc">Post-doc</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-6 px-4 py-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-8 lg:px-6 lg:py-8">
        <section className="flex flex-col gap-4">
          <div>
            <h1 className="font-heading text-3xl leading-tight text-balance sm:text-4xl">
              Turn a rough ask into a prompt a model can actually execute.
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {mode === "postdoc"
                ? "Post-doctoral mode is on. A hard-coded live bot scores the brief as you type — question, identification, corpus, falsifiers. It does not call a model."
                : mode === "detail"
                  ? "GHOST-HAND is on. Lyra-2 runs a 13-axis lattice — 4-D plus GHOST plus HAND — and writes tensions into the prompt so the model cannot ignore the conflicts."
                  : "Basic mode rewrites immediately. The live bot still flags vague words and unsourced percents as you type."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Request type">
              <Select
                value={requestType}
                onValueChange={(value) => {
                  if (value) setRequestType(value as RequestTypeChoice);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} align="start">
                  <SelectItem value="auto">Auto-detect</SelectItem>
                  <SelectItem value="creative">Creative</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                  <SelectItem value="educational">Educational</SelectItem>
                  <SelectItem value="complex">Complex</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Target platform">
              <Select
                value={platform}
                onValueChange={(value) => {
                  if (value) setPlatform(value as Platform);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} align="start">
                  {(Object.keys(PLATFORM_LABELS) as Platform[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {PLATFORM_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="prompt">Your draft</Label>
            <Textarea
              id="prompt"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste a vague ask — e.g. write a blog post about AI, make it good."
              className="min-h-40 resize-y bg-card/60 text-sm leading-6"
            />
            <p className="text-xs text-muted-foreground">
              {mode === "postdoc"
                ? "The live bot inserts methods lines you can keep or edit. Optimize still runs GHOST-HAND plus the post-doc contract."
                : mode === "detail"
                  ? "GHOST-HAND asks Goal, Handoffs, Output, Stakes, and Taboos. Lyra-2 then scores those axes against 4-D and HAND and lists tensions."
                  : "Basic mode applies core techniques and ships a prompt immediately."}
            </p>
          </div>

          <SuggestionBot
            input={input}
            mode={mode}
            dismissed={dismissed}
            onApply={applyInsert}
            onDismiss={(id) =>
              setDismissed((prev) => {
                const next = new Set(prev);
                next.add(id);
                return next;
              })
            }
          />

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="lg"
              disabled={!canSubmit}
              onClick={() => run()}
              className="min-w-40"
            >
              {busy ? (
                <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
              ) : (
                <WandSparklesIcon data-icon="inline-start" />
              )}
              {busy ? "Optimizing" : "Optimize prompt"}
            </Button>
            <Button type="button" size="lg" variant="ghost" onClick={reset}>
              Clear
            </Button>
          </div>

          <div>
            <p className="mb-2 text-xs tracking-[0.16em] text-muted-foreground uppercase">
              Try a rough brief
            </p>
            <div className="flex flex-col gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example.id}
                  type="button"
                  onClick={() => loadExample(example.prompt)}
                  className="rounded-xl border border-border/80 bg-card/50 px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-card"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{example.title}</span>
                    <Badge variant="outline" className="capitalize">
                      {example.type}
                    </Badge>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {example.blurb}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="flex min-w-0 flex-col gap-4">
          <FourDRail phase={busy ? phase : result ? phase : "idle"} />
          <LatticeRail
            engaged={latticeOn}
            lattice={result?.ghostHand.lattice ?? (latticeOn ? idleLyra2Lattice() : undefined)}
          />

          {error ? (
            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle>Could not optimize</CardTitle>
                <CardDescription>{error}</CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          {empty ? <EmptyState mode={mode} /> : null}

          {result?.status === "questions" ? (
            <QuestionsPanel
              result={result}
              answers={answers}
              onChange={(id, value) => setAnswers((prev) => ({ ...prev, [id]: value }))}
              onContinue={() => run({ nextAnswers: answers, skipQuestions: true })}
              onSkip={() => run({ skipQuestions: true })}
              busy={busy}
            />
          ) : null}

          {result?.status === "complete" ? <ResultPanel result={result} /> : null}
        </section>
      </main>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function EmptyState({ mode }: { mode: Mode }) {
  return (
    <Card className="bg-card/50">
      <CardHeader>
        <CardTitle className="font-heading text-2xl">The 4-D method</CardTitle>
        <CardDescription>
          {mode === "postdoc"
            ? "Post-doctoral mode will stop after Diagnose if the research question, identification, corpus, or contribution is still open."
            : mode === "detail"
              ? "GHOST-HAND detailed mode will stop after Diagnose if Goal, Handoffs, Output, Stakes, or Taboos are still open."
              : "Paste a draft on the left. Lyra will rebuild it as a role, objective, constraints, process, and output contract."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {[
          {
            t: "Deconstruct",
            d: "Pull the real intent, named entities, and what the brief never said.",
          },
          {
            t: "Diagnose",
            d: "Score specificity and completeness. Flag soft words like “good” and “stuff”.",
          },
          {
            t: "Develop",
            d: "Pick techniques by type: tone locks for creative work, constraints for technical, few-shot for teaching, chain-of-thought for messy systems.",
          },
          {
            t: "Deliver",
            d: "A paste-ready prompt, a change log, and how to run it on the platform you picked.",
          },
        ].map((item) => (
          <div key={item.t} className="rounded-lg border border-border/70 bg-background/40 p-3">
            <p className="text-sm font-medium">{item.t}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.d}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function QuestionsPanel({
  result,
  answers,
  onChange,
  onContinue,
  onSkip,
  busy,
}: {
  result: OptimizeResult;
  answers: Record<string, string>;
  onChange: (id: string, value: string) => void;
  onContinue: () => void;
  onSkip: () => void;
  busy: boolean;
}) {
  const ready = (result.questions ?? []).some((q) => (answers[q.id] ?? "").trim());
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {result.mode === "postdoc" ? "Post-doctoral intake" : "GHOST-HAND intake"}
        </CardTitle>
        <CardDescription>
          Detected as {result.requestType} work.
          {result.mode === "postdoc"
            ? " Answer the research question, identification, corpus, and contribution you know — skip the rest and Lyra will label defaults, then apply HAND hardening."
            : " Answer the GHOST layers you know — skip the rest and Lyra will use labeled defaults, then apply HAND hardening."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-sm">
          <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">
            Intent
          </p>
          <p className="mt-1 leading-6">{result.deconstruct.intent}</p>
        </div>
        {(result.questions ?? []).map((q) => (
          <div key={q.id} className="flex flex-col gap-1.5">
            <Label htmlFor={q.id}>
              {q.ghostLetter ? `${q.ghostLetter} · ` : ""}
              {q.question}
            </Label>
            <p className="text-xs text-muted-foreground">{q.rationale}</p>
            <Input
              id={q.id}
              value={answers[q.id] ?? ""}
              placeholder={q.placeholder}
              onChange={(e) => onChange(q.id, e.target.value)}
            />
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onContinue} disabled={busy}>
            Continue
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
          <Button type="button" variant="ghost" onClick={onSkip} disabled={busy}>
            Skip — use smart defaults
          </Button>
        </div>
        {!ready ? (
          <p className="text-xs text-muted-foreground">
            You can continue with empty fields; unanswered questions become inferred defaults.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ResultPanel({ result }: { result: OptimizeResult }) {
  const [view, setView] = useState<"prompt" | "trace">("prompt");
  const aip = result.aipSigma0;
  const aipFlagged = Boolean(aip && (aip.briefScan.flags.length || aip.promptScan.flags.length));
  const diagTone = useMemo(() => {
    if (result.diagnose.specificity === "low") return "Needs structure";
    if (result.diagnose.completeness === "low") return "Incomplete brief";
    return "Ready to tighten";
  }, [result.diagnose]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="capitalize">{result.requestType}</Badge>
          <Badge variant="outline">{PLATFORM_LABELS[result.platform]}</Badge>
          {result.ghostHand.active ? <Badge>GHOST-HAND</Badge> : null}
          {result.mode === "postdoc" ? <Badge>Post-doc</Badge> : null}
          {result.ghostHand.hyperDimensional ? <Badge variant="secondary">Lyra-2</Badge> : null}
          {result.aipSigma0 ? (
            <Badge variant={result.aipSigma0.briefScan.verdict === "pass" ? "secondary" : "outline"}>
              AIP-Σ0 {result.aipSigma0.briefScan.verdict}
            </Badge>
          ) : null}
          <Badge variant="secondary">{diagTone}</Badge>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={view === "prompt" ? "default" : "ghost"}
            onClick={() => setView("prompt")}
          >
            Optimized prompt
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === "trace" ? "default" : "ghost"}
            onClick={() => setView("trace")}
          >
            4-D trace
          </Button>
        </div>
      </div>

      {view === "prompt" ? (
        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Your optimized prompt</CardTitle>
                <CardDescription>
                  Role: {result.role}
                </CardDescription>
              </div>
              <CopyButton text={result.optimizedPrompt} />
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <pre className="max-h-[32rem] overflow-auto rounded-lg bg-muted/40 p-4 font-mono text-[13px] leading-6 whitespace-pre-wrap text-foreground">
              {result.optimizedPrompt}
            </pre>
          </CardContent>
        </Card>
      ) : (
        <Trace result={result} />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle>What changed</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {result.whatChanged.map((item) => (
                <li key={item} className="flex gap-2 text-sm leading-6">
                  <SparklesIcon className="mt-1 size-3.5 shrink-0 text-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>How to run it</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ol className="list-decimal space-y-2 pl-4 text-sm leading-6">
              {result.implementation.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
            <p className="rounded-lg bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
              {result.platformNotes}
            </p>
          </CardContent>
        </Card>
      </div>

      {result.inferredDefaults.length ? (
        <p className="text-xs leading-5 text-muted-foreground">
          Inferred defaults: {result.inferredDefaults.join(" · ")}
        </p>
      ) : null}

      {aipFlagged && aip ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle>AIP-Σ0 scans</CardTitle>
            <CardDescription>
              Real scanner (not simulated). Brief flags are unsourced spans in your draft. Prompt
              flags are claims the optimizer added that were not in the brief.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <ScanFlags title="Brief" scan={aip.briefScan} />
            <ScanFlags title="Prompt" scan={aip.promptScan} />
          </CardContent>
        </Card>
      ) : aip ? (
        <p className="text-xs leading-5 text-muted-foreground">
          AIP-Σ0 brief {aip.briefScan.verdict} · prompt {aip.promptScan.verdict} · no ungrounded
          claims.
        </p>
      ) : null}
    </div>
  );
}

function Trace({ result }: { result: OptimizeResult }) {
  const { deconstruct: d, diagnose: diag } = result;
  return (
    <div className="grid gap-3">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Deconstruct</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <TraceBlock title="Intent" body={d.intent} />
          <TraceBlock
            title="Entities"
            body={d.entities.length ? d.entities.join(", ") : "None named"}
          />
          <TraceBlock
            title="Provided"
            body={d.provided.join(" · ")}
          />
          <TraceBlock
            title="Missing"
            body={d.missing.length ? d.missing.join(" · ") : "Nothing critical"}
          />
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Diagnose</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Specificity {diag.specificity}</Badge>
            <Badge variant="outline">Completeness {diag.completeness}</Badge>
            <Badge variant="outline">Complexity {diag.complexity}</Badge>
          </div>
          {[...diag.clarityGaps, ...diag.ambiguity].map((gap) => (
            <p key={gap} className="text-sm leading-6 text-muted-foreground">
              {gap}
            </p>
          ))}
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Develop</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {result.techniques.map((t) => (
              <Badge key={t} variant="secondary">
                {t}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>GHOST-HAND</CardTitle>
          <CardDescription>
            {result.ghostHand.hyperDimensional
              ? `Lyra-2 engaged · ${result.ghostHand.lattice.lockedCount}/${result.ghostHand.lattice.axisCount} axes locked`
              : result.ghostHand.active
                ? "Detailed protocol armed"
                : "Idle in Basic mode"}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {result.ghostHand.ghost.map((layer) => (
            <TraceBlock
              key={`g-${layer.letter}`}
              title={`${layer.letter} ${layer.name}`}
              body={`${layer.status ?? "armed"} — ${layer.value || layer.hint || ""}`}
            />
          ))}
          {result.ghostHand.hand.map((layer) => (
            <TraceBlock
              key={`h-${layer.letter}`}
              title={`HAND ${layer.letter} ${layer.name}`}
              body={layer.rule || ""}
            />
          ))}
          {result.ghostHand.lattice.tensions.map((tension) => (
            <TraceBlock
              key={tension.id}
              title={`${tension.left} ↔ ${tension.right}`}
              body={`${tension.severity}: ${tension.note}`}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ScanFlags({ title, scan }: { title: string; scan: AipScan }) {
  return (
    <div>
      <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {scan.verdict} · high {scan.highCount} · medium {scan.mediumCount}
      </p>
      {scan.flags.length ? (
        <ul className="mt-2 flex flex-col gap-2">
          {scan.flags.map((flag) => (
            <li key={`${flag.kind}-${flag.span}`} className="text-sm leading-6">
              <span className="font-medium">{flag.kind}</span>
              <span className="text-muted-foreground"> — {flag.span}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">No ungrounded claims.</p>
      )}
    </div>
  );
}

function TraceBlock({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">{title}</p>
      <p className="mt-1 text-sm leading-6">{body}</p>
    </div>
  );
}

function LyreMark() {
  return (
    <span
      className={cn(
        "grid size-10 place-items-center rounded-full border border-primary/40 bg-primary/10 text-primary",
      )}
      aria-hidden
    >
      <svg viewBox="0 0 32 32" className="size-5" fill="none">
        <path
          d="M8 7c4 0 4 18 0 18M24 7c-4 0-4 18 0 18M8 7c4-3 12-3 16 0M10 16h12"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="16" cy="5" r="1.2" fill="currentColor" />
      </svg>
    </span>
  );
}
