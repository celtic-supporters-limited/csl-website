#!/usr/bin/env node
/**
 * scripts/obfuscate-export.ts
 *
 * Replaces PII (email and name fields) in a CSV export with fake data.
 * All other columns — amounts, intervals, status, dates, Stripe IDs — are
 * passed through unchanged so the downstream import preserves real plan data.
 *
 * PII detection (case-insensitive header matching):
 *   email columns : header contains "email"
 *   name columns  : header is/contains "name", "first", "last", "surname",
 *                   "forename", "given", "display"
 *
 * Usage:
 *   npx tsx scripts/obfuscate-export.ts --input export.csv
 *   npx tsx scripts/obfuscate-export.ts --input export.csv --output obfuscated.csv
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// ── CSV helpers ───────────────────────────────────────────────────────────────

function parseCSV(content: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const nonEmpty = lines.filter((l) => l.trim());
  if (nonEmpty.length < 2) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const fields: string[] = [];
    let field = "";
    let inQuotes = false;
    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        fields.push(field); field = "";
      } else {
        field += ch;
      }
      i++;
    }
    fields.push(field);
    return fields;
  };

  const headers = parseRow(nonEmpty[0]).map((h) => h.trim());
  const rows = nonEmpty.slice(1).map((line) => {
    const values = parseRow(line);
    return Object.fromEntries(headers.map((h, i) => [h, (values[i] ?? "").trim()]));
  });

  return { headers, rows };
}

function toCSV(headers: string[], rows: Record<string, string>[]): string {
  const esc = (v: string) => /[,"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h] ?? "")).join(",")),
  ].join("\n");
}

// ── PII detection ─────────────────────────────────────────────────────────────

type PiiType = "email" | "name-full" | "name-first" | "name-last" | null;

function detectPii(header: string): PiiType {
  const h = header.toLowerCase().replace(/[\s_\-]/g, "");
  if (h.includes("email")) return "email";
  if (h === "firstname" || h.includes("first") || h.includes("forename") || h.includes("given")) return "name-first";
  if (h === "lastname" || h.includes("last") || h.includes("surname") || h.includes("family")) return "name-last";
  if (h === "name" || h.includes("fullname") || h.includes("displayname") || h.includes("customername")) return "name-full";
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const inputFlag  = args.indexOf("--input");
const outputFlag = args.indexOf("--output");

if (inputFlag === -1 || !args[inputFlag + 1]) {
  console.error("Usage: npx tsx scripts/obfuscate-export.ts --input <file.csv> [--output <out.csv>]");
  process.exit(1);
}

const inputPath  = resolve(process.cwd(), args[inputFlag + 1]);
const outputPath = outputFlag !== -1 && args[outputFlag + 1]
  ? resolve(process.cwd(), args[outputFlag + 1])
  : inputPath.replace(/\.csv$/i, "-obfuscated.csv");

const raw = readFileSync(inputPath, "utf-8");
const { headers, rows } = parseCSV(raw);

if (headers.length === 0) {
  console.error("No data found in CSV.");
  process.exit(1);
}

// Map each header to its PII type (null = pass-through)
const piiMap = headers.map((h) => ({ header: h, pii: detectPii(h) }));

const detected = piiMap.filter((c) => c.pii !== null);
if (detected.length === 0) {
  console.warn("Warning: no PII columns detected. Headers found:", headers.join(", "));
  console.warn("Check column names — expected headers containing 'email', 'name', 'first', 'last', etc.");
}

console.log(`PII columns detected:`);
for (const { header, pii } of detected) {
  console.log(`  "${header}" → ${pii}`);
}
console.log(`Pass-through columns: ${piiMap.filter((c) => c.pii === null).map((c) => `"${c.header}"`).join(", ")}`);
console.log();

let counter = 1;
const obfuscated = rows.map((row) => {
  const n = String(counter).padStart(3, "0");
  const result = { ...row };

  for (const { header, pii } of piiMap) {
    if (!pii) continue;
    switch (pii) {
      case "email":       result[header] = `member-${n}@migrate-test.example`; break;
      case "name-full":   result[header] = `Test Member ${n}`;                 break;
      case "name-first":  result[header] = `Test`;                             break;
      case "name-last":   result[header] = `Member${n}`;                       break;
    }
  }

  counter++;
  return result;
});

writeFileSync(outputPath, toCSV(headers, obfuscated), "utf-8");
console.log(`Obfuscated ${obfuscated.length} rows → ${outputPath}`);
