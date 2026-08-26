import { Studio } from "@/components/lyra/studio";

export default function Home() {
  return (
    <div className="starfield relative flex min-h-full flex-1 flex-col">
      <Studio />
      <footer className="border-t border-border/60 px-4 py-4 text-center text-xs text-muted-foreground">
        Lyra runs the 4-D optimizer on this server — no model API key required. Paste the
        result into ChatGPT, Claude, Gemini, or any other assistant.
      </footer>
    </div>
  );
}
