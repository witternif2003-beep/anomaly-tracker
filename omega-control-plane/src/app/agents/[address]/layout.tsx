import { Tabs } from "./tabs";

export default async function AgentLayout({ children, params }: LayoutProps<"/agents/[address]">) {
  const { address } = await params;
  return (
    <div className="space-y-4">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-dim">Automaton</div>
        <h1 className="break-all font-mono text-base">{address}</h1>
      </div>
      <Tabs address={address} />
      {children}
    </div>
  );
}
