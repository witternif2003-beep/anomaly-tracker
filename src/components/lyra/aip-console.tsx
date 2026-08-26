"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LoaderCircleIcon, ShieldCheckIcon, ShieldAlertIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AipDeepDive } from "@/lib/aip-sigma0/dive";
import type { AipScan } from "@/lib/aip-sigma0/scanner";
import { cn } from "@/lib/utils";

const SAMPLE =
  "Miranda v. Arizona held that 87% of suspects waive, see 384 U.S. 436. Studies show https://example.com/holdings.";

export function AipConsole() {
  const [dive, setDive] = useState<AipDeepDive | null>(null);
  const [diveError, setDiveError] = useState<string | null>(null);
  const [diveBusy, setDiveBusy] = useState(true);
  const [text, setText] = useState(SAMPLE);
  const [anchors, setAnchors] = useState("");
  const [scan, setScan] = useState<AipScan | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanBusy, setScanBusy] = useState(false);

  async function loadDive() {
    setDiveBusy(true);
    setDiveError(null);
    try {
      const response = await fetch("/api/aip/dive");
      const data = (await response.json()) as AipDeepDive & { error?: string };
      if (!response.ok) {
        setDive(null);
        setDiveError(data.error ?? "Deep dive failed.");
        return;
      }
      setDive(data);
    } catch {
      setDive(null);
      setDiveError("Could not reach the AIP-Σ0 deep-dive endpoint.");
    } finally {
      setDiveBusy(false);
    }
  }

  useEffect(() => {
    void loadDive();
  }, []);

  async function runScan() {
    const body = text.trim();
    if (body.length < 4) {
      setScanError("Paste at least a few words to scan.");
      setScan(null);
      return;
    }
    setScanBusy(true);
    setScanError(null);
    try {
      const response = await fetch("/api/aip/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: body,
          anchors: anchors
            .split(/\n+/)
            .map((line) => line.trim())
            .filter(Boolean),
        }),
      });
      const data = (await response.json()) as AipScan & { error?: string };
      if (!response.ok) {
        setScan(null);
        setScanError(data.error ?? "Scan failed.");
        return;
      }
      setScan(data);
    } catch {
      setScan(null);
      setScanError("Could not reach the scanner.");
    } finally {
      setScanBusy(false);
    }
  }

  return (
    <div className="relative flex flex-1 flex-col">
      <header className="border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <p className="font-heading text-2xl leading-none tracking-tight">AIP-Σ0</p>
            <p className="mt-1 text-xs tracking-[0.14em] text-muted-foreground uppercase">
              Full-spectrum anti-hallucination · live deep dive
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Back to studio
            </Link>
            <Button size="sm" variant="ghost" onClick={() => void loadDive()} disabled={diveBusy}>
              Re-run dive
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-8 lg:px-6 lg:py-8">
        <section className="flex flex-col gap-4">
          <div>
            <h1 className="font-heading text-3xl leading-tight text-balance sm:text-4xl">
              Real scanner. Live fixtures. No simulated pass.
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Anchor Inventory Protocol Σ0 flags citations, percents, URLs, case names, and weasel
              authority unless they appear in the brief or a SHA-256 tool receipt. This page runs
              the fixture suite in-process on every load.
            </p>
          </div>

          {diveBusy && !dive ? (
            <Card>
              <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
                <LoaderCircleIcon className="size-4 animate-spin" />
                Running live fixtures and optimizer self-scan…
              </CardContent>
            </Card>
          ) : null}

          {diveError ? (
            <Card>
              <CardHeader>
                <CardTitle>Deep dive failed</CardTitle>
                <CardDescription>{diveError}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button type="button" onClick={() => void loadDive()}>
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {dive ? <DiveReport dive={dive} /> : null}
        </section>

        <aside className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>On-demand scan</CardTitle>
              <CardDescription>
                Claims not in the anchors list come back as review. This is the same scanner
                local-v1 uses.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="aip-text">Text to check</Label>
                <Textarea
                  id="aip-text"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  rows={7}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="aip-anchors">Anchors (one per line, optional)</Label>
                <Textarea
                  id="aip-anchors"
                  value={anchors}
                  onChange={(event) => setAnchors(event.target.value)}
                  rows={4}
                  placeholder="Miranda v. Arizona&#10;87%&#10;384 U.S. 436"
                />
              </div>
              <Button type="button" onClick={() => void runScan()} disabled={scanBusy}>
                {scanBusy ? "Scanning…" : "Scan"}
              </Button>
              {scanError ? <p className="text-sm text-destructive">{scanError}</p> : null}
              {scan ? <ScanResult scan={scan} /> : null}
            </CardContent>
          </Card>
        </aside>
      </main>
    </div>
  );
}

function DiveReport({ dive }: { dive: AipDeepDive }) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                {dive.ok ? (
                  <ShieldCheckIcon className="size-5 text-primary" />
                ) : (
                  <ShieldAlertIcon className="size-5 text-destructive" />
                )}
                {dive.ok ? "Hardening active" : "Dive reported a failure"}
              </CardTitle>
              <CardDescription>
                {dive.fixtureResults.filter((f) => f.ok).length}/{dive.fixtureCount} fixtures ·{" "}
                {dive.elapsedMs} ms · simulated={String(dive.simulated)} · Cloudflare live deploy={
                  String(dive.cloudflareLiveDeploy)
                }
              </CardDescription>
            </div>
            <Badge variant={dive.ok ? "secondary" : "destructive"}>
              {dive.ok ? "PASS" : "FAIL"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-4 font-mono text-xs leading-5 break-all text-muted-foreground">
          proof {dive.proofHash}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {dive.bands.map((band) => (
          <Card key={band.id} size="sm">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">{band.id}</CardTitle>
                <Badge variant={band.ok ? "secondary" : "destructive"}>
                  {band.ok ? "live" : "fail"}
                </Badge>
              </div>
              <CardDescription>{band.surface}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm leading-6">{band.proof}</CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fixture suite</CardTitle>
          <CardDescription>
            Each row is scanText() on this request. Grounded rows must PASS; unsourced rows must
            REVIEW and include the expected flag kinds.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="pb-2 pr-3 font-medium">Fixture</th>
                <th className="pb-2 pr-3 font-medium">Wanted</th>
                <th className="pb-2 pr-3 font-medium">Got</th>
                <th className="pb-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {dive.fixtureResults.map((row) => (
                <tr key={row.id} className="border-t border-border/60">
                  <td className="py-2 pr-3">
                    <div className="font-medium">{row.label}</div>
                    <div className="text-xs text-muted-foreground">{row.id}</div>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">{row.expectVerdict}</td>
                  <td className="py-2 pr-3 font-mono text-xs">
                    {row.scan.verdict} · h{row.scan.highCount} m{row.scan.mediumCount}
                  </td>
                  <td className="py-2">
                    <Badge variant={row.ok ? "secondary" : "destructive"}>
                      {row.ok ? "ok" : row.detail}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Optimizer self-scan</CardTitle>
          <CardDescription>
            Unsourced Miranda in the brief must REVIEW. The rewritten prompt, scanned with the
            brief as anchors, must PASS — Lyra must not mint extra cites.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <ScanResult scan={dive.optimizer.briefScan} emptyLabel="No brief scan" title="Brief" />
          <ScanResult scan={dive.optimizer.promptScan} emptyLabel="No prompt scan" title="Prompt" />
        </CardContent>
      </Card>
    </div>
  );
}

function ScanResult({
  scan,
  title,
  emptyLabel,
}: {
  scan: AipScan | null;
  title?: string;
  emptyLabel?: string;
}) {
  if (!scan) {
    return <p className="text-sm text-muted-foreground">{emptyLabel ?? "No scan yet."}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {title ? <p className="text-sm font-medium">{title}</p> : null}
        <Badge variant={scan.verdict === "pass" ? "secondary" : "outline"}>
          AIP-Σ0 {scan.verdict}
        </Badge>
        <span className="text-xs text-muted-foreground">
          high {scan.highCount} · medium {scan.mediumCount} · checked {scan.checkedCount} · grounded{" "}
          {scan.groundedCount}
        </span>
      </div>
      {scan.flags.length ? (
        <ul className="flex flex-col gap-1.5">
          {scan.flags.map((flag) => (
            <li key={`${flag.kind}-${flag.span}`} className="text-sm leading-6">
              <span className="font-medium">{flag.kind}</span>
              <span className="text-muted-foreground"> — {flag.span}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No ungrounded claims.</p>
      )}
    </div>
  );
}
