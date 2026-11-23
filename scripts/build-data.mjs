// Regenerates data/issuers.csv and DATA.md from data/issuers.json (the source of truth).
// Usage: node scripts/build-data.mjs
import { readFileSync, writeFileSync } from "node:fs";

const rows = JSON.parse(readFileSync(new URL("../data/issuers.json", import.meta.url)));
const KIND = { state: "State", city: "City", issuer: "Other issuer" };
const cols = ["id", "name", "kind", "state", "offering", "sale_date", "par_amount", "underwriter_discount",
  "fee_per_1000", "sale_method", "lead_underwriters", "confidence", "source_url", "notes", "lat", "lon"];
const rate = (r) => (r.underwriter_discount != null && r.par_amount ? (r.underwriter_discount / r.par_amount) * 1000 : null);
const csvCell = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

const csv = [cols.join(",")].concat(rows.map((r) => cols.map((c) =>
  csvCell(c === "fee_per_1000" ? (rate(r) == null ? null : rate(r).toFixed(2)) : r[c])).join(","))).join("\n") + "\n";
writeFileSync(new URL("../data/issuers.csv", import.meta.url), csv);

const usd = (v) => (v == null ? "—" : "$" + Math.round(v).toLocaleString("en-US"));
const md = (s) => String(s ?? "—").replace(/\|/g, "\\|").replace(/\n/g, " ");
const order = { state: 0, city: 1, issuer: 2 };
const sorted = rows.slice().sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name));
const withFee = rows.filter((r) => r.underwriter_discount != null);
const total = withFee.reduce((s, r) => s + r.underwriter_discount, 0);

let out = `# Underwriting fee table

Latest municipal bond offering for each issuer and the underwriters' discount (the bank's spread) paid on it.
Generated from \`data/issuers.json\` by \`scripts/build-data.mjs\`. ${rows.length} issuers, ${withFee.length} with a disclosed fee, ${usd(total)} in fees total.

Confidence: **high** = stated in the official statement or an official sale document; **medium** = computed from the purchase price or taken from a secondary report; **low** = rough.

`;
for (const kind of ["state", "city", "issuer"]) {
  const list = sorted.filter((r) => r.kind === kind);
  if (!list.length) continue;
  out += `## ${KIND[kind]}${kind === "city" ? "ies" : "s"}\n\n| Issuer | St | Offering | Sale date | Par | Underwriting fee | Per $1,000 | Method | Lead underwriter(s) | Conf. | Source |\n|---|---|---|---|---:|---:|---:|---|---|---|---|\n`;
  for (const r of list) {
    const k = rate(r);
    out += `| ${md(r.name)} | ${r.state} | ${md(r.offering)} | ${r.sale_date ?? "—"} | ${usd(r.par_amount)} | ${usd(r.underwriter_discount)} | ${k == null ? "—" : "$" + k.toFixed(2)} | ${md(r.sale_method)} | ${md(r.lead_underwriters)} | ${md(r.confidence)} | ${r.source_url ? `[link](${r.source_url})` : "—"} |\n`;
  }
  out += "\n";
}
writeFileSync(new URL("../DATA.md", import.meta.url), out);
console.log(`wrote data/issuers.csv and DATA.md (${rows.length} rows)`);
