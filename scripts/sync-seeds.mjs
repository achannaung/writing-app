#!/usr/bin/env node
// Regenerates the inline seed data block in index.html from phrases.json.
// index.html stays a static, dependency-free file; phrases.json is the source of truth.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = path.join(root, "index.html");
const dataPath = path.join(root, "phrases.json");

const START = "<!-- SEED_DATA_START -->";
const END = "<!-- SEED_DATA_END -->";

const data = JSON.parse(await readFile(dataPath, "utf8"));
const html = await readFile(htmlPath, "utf8");

const start = html.indexOf(START);
const end = html.indexOf(END);
if (start === -1 || end === -1 || end < start) {
  throw new Error(`Could not find seed markers in ${htmlPath}`);
}

const json = JSON.stringify(data);
const block =
  START +
  '\n<script type="application/json" id="seed-data">' +
  json +
  "</script>\n" +
  END;

const next = html.slice(0, start) + block + html.slice(end + END.length);
await writeFile(htmlPath, next);

console.log(
  `Synced ${data.phrases.length} phrases into index.html (${(json.length / 1024).toFixed(1)} KB).`
);
