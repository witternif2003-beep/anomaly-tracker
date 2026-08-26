import { InventoryNotebook } from "@/components/lyra/inventory-notebook";

export const metadata = {
  title: "Install inventory — Lyra",
  description:
    "Live inventory of the Lyra toolchain, P1 catalog, legal research sources, and expansion plan. Not a classified document.",
};

export default function InventoryPage() {
  return (
    <div className="starfield relative flex min-h-full flex-1 flex-col">
      <InventoryNotebook />
      <footer className="border-t border-border/60 px-4 py-4 text-center text-xs text-muted-foreground">
        This notebook is compiled on this server from install status. It is not a government
        program document.
      </footer>
    </div>
  );
}
