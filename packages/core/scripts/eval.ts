// Usage: npm run eval --workspace @dosewise/core -- path/to/cases.json
import { readFileSync } from "node:fs";
import { evaluate, GATE, type EvalCase } from "../src/evaluate";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run eval -- <cases.json>");
  process.exit(2);
}
const cases = JSON.parse(readFileSync(file, "utf8")) as EvalCase[];
const r = evaluate(cases);
const pct = (v: number | null) => (v === null ? "n/a" : `${(v * 100).toFixed(1)}%`);
console.log(`Cases: ${r.total}`);
console.log(`Right strength recognised: ${r.rightRecognised}/${r.rightTotal} = ${pct(r.recognitionRate)} (gate ${GATE.recognition * 100}%)`);
console.log(`Wrong strength flagged:    ${r.wrongFlagged}/${r.wrongTotal} = ${pct(r.flagRate)} (gate ${GATE.flag * 100}%)`);
console.log(`False alarms on right medicine: ${r.falseAlarms}`);
for (const f of r.failures) console.log(`  ✗ ${f.id}: expected ${f.expected}, got ${f.got} (${f.reason})`);
console.log(r.passes ? "GATE PASSED" : "GATE NOT PASSED");
process.exit(r.passes ? 0 : 1);
