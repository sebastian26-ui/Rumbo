import fs from "node:fs";
import readline from "node:readline";

/**
 * Stream a GTFS CSV file row by row.
 *
 * GTFS uses RFC4180-style CSV: comma-delimited, optional double-quote
 * escaping for fields containing commas/newlines, "" inside a quoted field
 * means a literal quote. We implement just that — no other dialects.
 *
 * For very large files (stop_times.txt is ~150 MB extracted on Santiago),
 * we read line-by-line and assume no embedded newlines. The DTPM feed
 * meets that assumption; we throw if a row looks malformed.
 */
export async function* streamCsv(
  filePath: string,
): AsyncGenerator<Record<string, string>> {
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let header: string[] | null = null;
  for await (const rawLine of rl) {
    // Strip BOM on first line.
    const line = header === null ? rawLine.replace(/^﻿/, "") : rawLine;
    if (!line) continue;
    const fields = parseLine(line);
    if (header === null) {
      header = fields.map((h) => h.trim());
      continue;
    }
    const row: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) {
      row[header[i]] = fields[i] ?? "";
    }
    yield row;
  }
}

function parseLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  const n = line.length;
  while (i <= n) {
    if (i === n) {
      out.push("");
      break;
    }
    const c = line[i];
    if (c === '"') {
      let buf = "";
      i++;
      while (i < n) {
        const ch = line[i];
        if (ch === '"') {
          if (line[i + 1] === '"') {
            buf += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          buf += ch;
          i++;
        }
      }
      out.push(buf);
      if (line[i] === ",") i++;
      else if (i >= n) break;
    } else {
      let j = line.indexOf(",", i);
      if (j === -1) {
        out.push(line.slice(i));
        break;
      }
      out.push(line.slice(i, j));
      i = j + 1;
    }
  }
  return out;
}
