import { Studio } from "@/components/lyra/studio";

export default function Home() {
  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <Studio />
      <footer className="border-t border-border/40 px-4 py-4 text-center text-xs text-muted-foreground">
        Lyra runs the 4-D optimizer in this glass console — no model API key required.
      </footer>
    </div>
  );
}
