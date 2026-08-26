import { cn } from "@/lib/utils";

const STEPS = [
  { id: "deconstruct", n: "01", title: "Deconstruct", hint: "Intent, entities, gaps" },
  { id: "diagnose", n: "02", title: "Diagnose", hint: "Clarity and completeness" },
  { id: "develop", n: "03", title: "Develop", hint: "Role, techniques, structure" },
  { id: "deliver", n: "04", title: "Deliver", hint: "Prompt you can paste" },
] as const;

export type FourDPhase =
  | "idle"
  | "deconstruct"
  | "diagnose"
  | "develop"
  | "deliver"
  | "questions"
  | "complete";

export function FourDRail({ phase }: { phase: FourDPhase }) {
  const order = ["deconstruct", "diagnose", "develop", "deliver"] as const;
  const activeIndex =
    phase === "complete" || phase === "questions"
      ? 4
      : phase === "idle"
        ? -1
        : order.indexOf(phase as (typeof order)[number]);

  return (
    <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {STEPS.map((step, i) => {
        const done = activeIndex > i || phase === "complete" || phase === "questions";
        const current = activeIndex === i;
        return (
          <li
            key={step.id}
            className={cn(
              "rounded-xl border px-3 py-2.5 transition-colors",
              done
                ? "border-primary/40 bg-primary/8"
                : current
                  ? "border-primary/60 bg-primary/12 shadow-[0_0_0_1px_var(--primary)]"
                  : "border-border/80 bg-card/40",
            )}
          >
            <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground">
              {step.n}
            </p>
            <p className="mt-0.5 text-sm font-medium text-foreground">{step.title}</p>
            <p className="text-xs text-muted-foreground">{step.hint}</p>
          </li>
        );
      })}
    </ol>
  );
}
