import { readFileSync } from "node:fs";
import path from "node:path";
import type { ComponentProps } from "react";
import { InventoryNotebook } from "@/components/lyra/inventory-notebook";

export const metadata = {
  title: "Install inventory — Lyra",
  description:
    "Live inventory of the Lyra toolchain, P1 catalog, legal research sources, and expansion plan. Not a classified document.",
};

export default function InventoryPage() {
  const initialData = JSON.parse(
    readFileSync(path.join(process.cwd(), "public/static/notebook.json"), "utf8"),
  ) as ComponentProps<typeof InventoryNotebook>["initialData"];

  return (
    <div className="starfield relative flex min-h-full flex-1 flex-col">
      <InventoryNotebook initialData={initialData} />
      <footer className="border-t border-border/60 px-4 py-4 text-center text-xs text-muted-foreground">
        Compiled at build time from install snapshots for static Pages. Not a government program
        document.
      </footer>
    </div>
  );
}
