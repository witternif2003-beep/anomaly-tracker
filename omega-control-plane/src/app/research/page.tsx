import Link from "next/link";
import { Card } from "@/components/ui";

const ACCESSED = "accessed 2026-10-25";
const S = {
  psr: { t: "Bailey & López de Prado, “The Sharpe Ratio Efficient Frontier”, Journal of Risk (2012)", u: "https://www.davidhbailey.com/dhbpapers/sharpe-frontier.pdf", doi: "https://doi.org/10.21314/JOR.2012.255" },
  dsr: { t: "Bailey & López de Prado, “The Deflated Sharpe Ratio: Correcting for Selection Bias, Backtest Overfitting and Non-Normality”, Journal of Portfolio Management (2014)", u: "https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf" },
  pbo: { t: "Bailey, Borwein, López de Prado & Zhu, “The Probability of Backtest Overfitting”, Journal of Computational Finance", u: "https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf", doi: "https://doi.org/10.21314/JCF.2016.322" },
  hl: { t: "Harvey & Liu, “Backtesting”, Journal of Portfolio Management", u: "https://people.duke.edu/~charvey/Research/Published_Papers/P120_Backtesting.PDF" },
};
type Key = keyof typeof S;

function Cite({ k }: { k: Key }) {
  const s = S[k];
  return (
    <span className="text-[11px] text-dim">
      {" "}[<a href={s.u} target="_blank" rel="noreferrer" className="text-accent">{s.t}</a>
      {"doi" in s && (
        <>
          {" · "}
          <a href={s.doi} target="_blank" rel="noreferrer" className="text-accent">DOI</a>
        </>
      )}
      , {ACCESSED}]
    </span>
  );
}
const F = ({ children }: { children: React.ReactNode }) => <span className="break-all font-mono text-[12px] text-fg">{children}</span>;
const P = ({ children }: { children: React.ReactNode }) => <p className="mb-2 text-sm leading-relaxed text-dim">{children}</p>;

const EVIDENCE: [string, string, React.ReactNode][] = [
  ["PSR = Φ((SR̂ − SR*)·√(n−1) / √(1 − γ₃·SR̂ + (γ₄−1)/4·SR̂²)); MinTRL in observations", "A", <Cite key="psr" k="psr" />],
  ["The asymptotics behind PSR/MinTRL assume CLT; the paper cautions samples should exceed 30 observations", "A", <Cite key="clt" k="psr" />],
  ["E[max SR] across N unskilled trials uses the Euler-Mascheroni constant (DSR eq. 1)", "A", <Cite key="dsr" k="dsr" />],
  ["PBO via combinatorially symmetric cross-validation; rejecting PBO > 0.05 is described as a customary approach", "A", <Cite key="pbo" k="pbo" />],
  ["A flat 50% Sharpe haircut is a rule of thumb; the multiple-testing haircut is nonlinear (Bonferroni / Holm / BHY)", "A", <Cite key="hl" k="hl" />],
  ["Survival tiers: high 500, normal 50, low_compute 10, critical 0 (credit cents)", "A", <F key="s">automaton-upstream src/types.ts:231</F>],
  ["Conway topup tiers $5 / 25 / 100 / 500 / 1000 / 2500", "A", <F key="t">automaton-upstream src/conway/topup.ts:24</F>],
  ["Gates N ≥ 1,000 and PSR capped at 0.95 are operator policy, not results from the papers", "policy", <F key="r">rules/dsr-pbo-validation-suite.md:55</F>],
  ["Any strategy or configuration yields $7,000/day", "UNVERIFIED", <span key="x" className="text-[11px] text-dim">no source; shown only as an operator target (src/lib/pnl.ts:46)</span>],
];

export default function Research() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Profit research plan</h1>
        <P>
          How to raise an automaton&apos;s realised net profit by experiment, and how to tell a real edge from luck. Confidence in the plan: <b className="text-fg">medium</b>. The statistics are standard and peer-reviewed; whether any
          lever raises profit for a given agent is unknown until measured. Nothing here forecasts or guarantees a profit figure.
        </P>
      </div>

      <Card title="1 · What is measured (no projections)">
        <P>
          Net = revenue − cost, from the agent&apos;s own ledger in each signed snapshot: <F>pnlFromAggregates()</F> in <F>src/lib/pnl.ts:14</F>. Revenue is <F>transfer_in</F>; cost is the larger of ledger costs and
          <F> inference_costs</F>; topups are funding, not revenue. Daily net comes from the <F>transactions_by_day</F> aggregate (<F>agent/omega-sync.mts:103</F>) via <F>dailyPnl()</F> (<F>src/lib/pnl.ts:32</F>). The live
          tab (<F>/agents/&lt;address&gt;/profit</F>, served by <F>src/app/api/agents/[address]/profit/route.ts:10</F>) shows the 24 h window, net per hour, burn and credit runway.
        </P>
      </Card>

      <Card title="2 · Levers (each one is a hypothesis to test, not a known gain)">
        <ul className="list-disc space-y-1 pl-5 text-sm text-dim">
          <li><b className="text-fg">Model routing</b> — cost per turn by model (Economics tab, <F>inference_by_model</F>). H: a cheaper model for routine turns cuts cost without lowering revenue.</li>
          <li><b className="text-fg">Heartbeat cadence</b> — fewer idle wake-ups lower burn. H: a longer interval lowers cost per day with no revenue loss.</li>
          <li><b className="text-fg">Revenue tasks</b> — which goals or skills produce <F>transfer_in</F>. H: re-weighting toward them raises revenue per turn.</li>
          <li><b className="text-fg">Survival</b> — <F>omega-sync --keep-alive</F> (<F>agent/omega-sync.mts:344</F>) buys credits from the agent&apos;s own USDC below the normal tier, which prevents low_compute downtime only while USDC remains.</li>
        </ul>
      </Card>

      <Card title="3 · Experiment protocol">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-dim">
          <li><b className="text-fg">Register every variant before running it</b> (honest trial count N). Today the app treats the live configuration as the only trial (<F>validateTrackRecord()</F>, <F>src/lib/stats.ts:91</F>); a variant registry is not built yet.</li>
          <li><b className="text-fg">One change at a time.</b> With one agent, use a switchback design: alternate variants in fixed day-blocks so weekday and demand effects average out. With a fleet, randomise agents into arms.</li>
          <li><b className="text-fg">Fix the stopping rule in advance</b> (an observation count, not &quot;until it looks good&quot;).</li>
          <li><b className="text-fg">Unit of analysis is the day</b>: daily net $ per arm. Below 30 days per arm the result is labelled <F>statistically_indistinguishable_from_noise</F>.<Cite k="psr" /></li>
          <li><b className="text-fg">Pass every gate in §4</b> before adopting a variant; otherwise keep the incumbent.</li>
        </ol>
      </Card>

      <Card title="4 · Statistical gates (computed live on the Profit tab)">
        <div className="space-y-2 text-sm text-dim">
          <div><b className="text-fg">PSR</b> — probability the true Sharpe exceeds SR* = 0 given n, skew γ₃ and kurtosis γ₄ (<F>src/lib/stats.ts:57</F>). Gate ≥ 0.95, value capped at 0.95 (<F>:80</F>, operator policy).<Cite k="psr" /></div>
          <div><b className="text-fg">MinTRL</b> — observations needed for 95% confidence that SR &gt; SR* (<F>:61</F>).<Cite k="psr" /></div>
          <div><b className="text-fg">DSR</b> — PSR with SR* raised to E[max SR] over N trials (<F>:67</F>); needs more than one registered trial, so it is NULL today.<Cite k="dsr" /></div>
          <div><b className="text-fg">PBO / CSCV</b> — probability the in-sample winner is below median out of sample; needs a T × N matrix of variant returns, NULL for a single live record.<Cite k="pbo" /></div>
          <div><b className="text-fg">Harvey-Liu haircut</b> — Sharpe after a multiple-testing adjustment of the p-value (Holm or BHY); no adjustment applies with one trial.<Cite k="hl" /></div>
          <div><b className="text-fg">Data floor</b> — N ≥ 1,000 daily observations (<F>:81</F>, operator policy). This is about 2.7 years of daily data, so the overall gate will read REJECT_DATA for most agents.</div>
        </div>
      </Card>

      <Card title="5 · Red team">
        <ul className="list-disc space-y-1 pl-5 text-sm text-dim">
          <li><b className="text-fg">Strongest counterargument:</b> agent P&amp;L has no capital base, so a &quot;Sharpe&quot; of daily dollars mixes scale with skill. Treat it as a signal-to-noise ratio, not a fund-style Sharpe.</li>
          <li><b className="text-fg">Least supported claim:</b> that any lever in §2 helps a given agent. None has been measured here.</li>
          <li><b className="text-fg">Survivorship:</b> agents that died stop syncing; fleet averages over live agents overstate returns. Keep dead agents in any fleet analysis.</li>
          <li><b className="text-fg">Non-stationarity:</b> Conway pricing and demand change, so past days may not represent future ones; switchbacks and short blocks reduce but don&apos;t remove this.</li>
          <li><b className="text-fg">Source independence:</b> PSR, DSR and PBO share an author (López de Prado), so they are not three independent sources; Harvey &amp; Liu is independent. The formulas are cross-checked by unit tests against an independent Python stdlib computation (<F>tests/stats.test.ts</F>).</li>
          <li><b className="text-fg">Goodhart:</b> optimising the dashboard number (e.g. skipping costs by idling) can raise short-run net while lowering revenue later.</li>
        </ul>
      </Card>

      <Card title="6 · Evidence table">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed break-words text-left text-xs">
            <thead className="text-dim">
              <tr>
                <th className="py-1 pr-2">claim</th>
                <th className="py-1 pr-2">grade</th>
                <th className="py-1">source · date</th>
              </tr>
            </thead>
            <tbody>
              {EVIDENCE.map(([c, g, s]) => (
                <tr key={c} className="border-t border-line align-top">
                  <td className="py-1 pr-2 text-fg">{c}</td>
                  <td className={`py-1 pr-2 font-mono ${g === "A" ? "text-good" : "text-warn"}`}>{g}</td>
                  <td className="py-1">{s}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <P>
          What would change the conclusions: a registered multi-variant experiment with ≥ 30 days per arm and DSR / PBO passing; or evidence that daily P&amp;L is strongly autocorrelated (the PSR variance would then need
          adjusting). See the live gates on any agent&apos;s <Link href="/" className="text-accent">Profit (live)</Link> tab.
        </P>
      </Card>
    </div>
  );
}
