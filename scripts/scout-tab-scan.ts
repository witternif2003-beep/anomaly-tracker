/**
 * Scan local + live anomaly bakes with Error scout; print open/P1 findings.
 */
import { readFileSync } from "node:fs";
import https from "node:https";
import { inspectTrackerBook } from "../src/lib/scout-healer";

function getJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "lyra-scout", "Cache-Control": "no-cache" } }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

function report(name: string, book: any) {
  const findings = inspectTrackerBook(book, { extreme: true });
  const open = findings.filter((f) => !f.healed && f.id !== "all-clear");
  const p1 = open.filter((f) => f.severity === "P1");
  console.log(
    `\n=== ${name} postdoc=${book?.postdocCatalog?.total ?? "?"} open=${open.length} P1=${p1.length} gates=${findings.length} ===`,
  );
  for (const f of p1) {
    console.log(`P1 ${f.id} | ${f.title} | ${(f.detail || "").slice(0, 160)}`);
  }
  for (const f of open.filter((x) => x.severity !== "P1")) {
    console.log(`${f.severity} ${f.id} | ${f.title} | ${(f.detail || "").slice(0, 120)}`);
  }
  return { open, p1 };
}

async function main() {
  const local = JSON.parse(readFileSync("public/static/anomaly.json", "utf8"));
  report("LOCAL", local);
  try {
    const live = await getJson(
      "https://witternif2003-beep.github.io/anomaly-tracker/static/anomaly.json",
    );
    report("LIVE-PAGES", live);
  } catch (e) {
    console.error("LIVE-PAGES fetch failed", e);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
