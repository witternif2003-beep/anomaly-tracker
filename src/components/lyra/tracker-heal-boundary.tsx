"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = { children: ReactNode };
type State = { error: Error | null; retries: number };

function isEffectEventRenderFault(error: Error): boolean {
  const msg = error.message || "";
  return msg.includes("#440") || /useEffectEvent.*during rendering/i.test(msg);
}

/**
 * Additive self-heal shell: catches render crashes and auto-retries without removing features.
 * Backs off on React #440 so a bad timer does not spin an infinite heal loop.
 */
export class TrackerHealBoundary extends Component<Props, State> {
  state: State = { error: null, retries: 0 };
  timer: number | null = null;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("[lyra.scout] tracker render fault — scheduling self-heal", error.message, info.componentStack);
    if (this.timer) window.clearTimeout(this.timer);
    const delay = isEffectEventRenderFault(error)
      ? Math.min(8000, 2000 + this.state.retries * 1500)
      : 1600;
    this.timer = window.setTimeout(() => {
      this.setState((s) => ({ error: null, retries: s.retries + 1 }));
    }, delay);
  }

  componentWillUnmount() {
    if (this.timer) window.clearTimeout(this.timer);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto w-full max-w-3xl px-4 py-10">
          <Card className="border-amber-400/30">
            <CardHeader>
              <CardTitle className="font-display text-lg">Scout self-heal in progress</CardTitle>
              <CardDescription>
                A render fault was caught. Reloading the tracker shell automatically — no features removed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="font-mono text-xs text-muted-foreground">{this.state.error.message}</p>
              <p className="text-xs text-muted-foreground">Auto-retry #{this.state.retries + 1}</p>
              <Button
                type="button"
                onClick={() => this.setState((s) => ({ error: null, retries: s.retries + 1 }))}
              >
                Retry now
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
