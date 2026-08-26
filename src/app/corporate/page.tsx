import { CorporateTaxonomy } from "@/components/lyra/corporate-taxonomy";

export const metadata = {
  title: "Corporate taxonomy — Lyra",
  description:
    "Business-law forensic evidence map bound to this repo's files, lockfile, MCP, and credentials. Not a classified case file.",
};

export default function CorporatePage() {
  return (
    <div className="starfield relative flex min-h-full flex-1 flex-col">
      <CorporateTaxonomy />
      <footer className="border-t border-border/60 px-4 py-4 text-center text-xs text-muted-foreground">
        Internal investigations and regulatory defense. Intercepts and live NCIC queries are out of
        scope.
      </footer>
    </div>
  );
}
