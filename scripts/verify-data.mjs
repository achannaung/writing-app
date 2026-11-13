#!/usr/bin/env node
// Validates phrases.json and checks that index.html is in sync with it.
// Run with: npm run verify

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function fail(message) {
  failures.push(message);
}

const raw = await readFile(path.join(root, "phrases.json"), "utf8");
let data;
try {
  data = JSON.parse(raw);
} catch (error) {
  console.error("phrases.json is not valid JSON:", error.message);
  process.exit(1);
}

if (!data || typeof data !== "object") fail("phrases.json must be an object.");
if (!Number.isInteger(data.version) || data.version < 1) fail("phrases.json needs an integer `version`.");
if (!Array.isArray(data.phrases)) fail("phrases.json needs a `phrases` array.");

const phrases = Array.isArray(data.phrases) ? data.phrases : [];
const texts = [];
const seen = new Map();
const INVISIBLE = /[\u0000-\u001f\u007f\u00a0\u200b-\u200f\u2028\u2029\ufeff]/;
const MAX_LENGTH = 200;

for (const [index, entry] of phrases.entries()) {
  if (!entry || typeof entry !== "object") {
    fail(`phrases[${index}] is not an object.`);
    continue;
  }
  if (typeof entry.text !== "string" || !entry.text.trim()) {
    fail(`phrases[${index}] has no text.`);
    continue;
  }
  const text = entry.text;
  texts.push(text);

  if (text !== text.trim()) fail(`Trailing/leading whitespace: ${JSON.stringify(text)}`);
  if (text.length > MAX_LENGTH) fail(`Too long (${text.length}): ${JSON.stringify(text)}`);
  if (INVISIBLE.test(text)) fail(`Invisible or control character: ${JSON.stringify(text)}`);

  const key = text.toLowerCase();
  if (seen.has(key)) fail(`Duplicate phrase: ${JSON.stringify(text)} (also at index ${seen.get(key)})`);
  else seen.set(key, index);

  if (entry.trigger !== undefined) {
    const trigger = entry.trigger;
    if (typeof trigger !== "string" || !trigger) {
      fail(`Invalid trigger for ${JSON.stringify(text)}.`);
    } else {
      if (trigger !== trigger.toLowerCase()) fail(`Trigger must be lowercase: ${trigger}`);
      if (!trigger.endsWith("/")) fail(`Trigger must end with "/": ${trigger}`);
      if (/[\r\n\t]/.test(trigger)) fail(`Trigger must be a single line: ${trigger}`);
    }
  }
}

// Trigger uniqueness
const triggerOwners = new Map();
for (const entry of phrases) {
  if (!entry || !entry.trigger) continue;
  if (triggerOwners.has(entry.trigger)) {
    fail(`Trigger "${entry.trigger}" used by both ${JSON.stringify(triggerOwners.get(entry.trigger))} and ${JSON.stringify(entry.text)}`);
  } else {
    triggerOwners.set(entry.trigger, entry.text);
  }
}

// Place-name integrity
const townshipRegions = new Map();
let townshipCount = 0;
for (const text of texts) {
  const match = text.match(/^(.*) Township \(([^,]+)\)$/);
  if (!match) continue;
  townshipCount += 1;
  const [, name, region] = match;
  if (!townshipRegions.has(name)) townshipRegions.set(name, new Set());
  townshipRegions.get(name).add(region);
}
if (!townshipCount) fail("No township entries found.");

let townCount = 0;
for (const text of texts) {
  const marker = text.lastIndexOf(" Town (");
  if (marker === -1) continue;
  const rest = text.slice(marker + " Town (".length);
  const match = rest.match(/^(.*) Township, ([^,]+)\)$/);
  if (!match) {
    fail(`Could not parse town entry: ${JSON.stringify(text)}`);
    continue;
  }
  townCount += 1;
  const [, parent, region] = match;
  if (!townshipRegions.has(parent)) {
    fail(`Town references a missing township: ${JSON.stringify(text)}`);
    continue;
  }
  const normalise = (value) => value.replace("Nay Pyi Taw Union Territory", "Nay Pyi Taw Territory");
  const regions = [...townshipRegions.get(parent)].map(normalise);
  if (!regions.includes(normalise(region))) {
    fail(`Region mismatch for ${JSON.stringify(text)}: parent is "${regions.join(" / ")}", town says "${region}"`);
  }
}
if (!townCount) fail("No town entries found.");

// index.html must embed exactly the same data
const html = await readFile(path.join(root, "index.html"), "utf8");
const embedded = html.match(/<script type="application\/json" id="seed-data">([\s\S]*?)<\/script>/);
if (!embedded) {
  fail("index.html has no seed-data block. Run `npm run sync`.");
} else {
  try {
    const inline = JSON.parse(embedded[1]);
    if (JSON.stringify(inline) !== JSON.stringify(data)) {
      fail("index.html seed data is out of date. Run `npm run sync`.");
    }
  } catch (error) {
    fail(`index.html seed data is not valid JSON: ${error.message}`);
  }
}

// Referenced local assets should exist
for (const match of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
  const target = match[1];
  if (/^(?:https?:|data:|mailto:)/.test(target)) continue;
  try {
    await readFile(path.join(root, target));
  } catch {
    fail(`index.html references a missing file: ${target}`);
  }
}

if (failures.length) {
  console.error(`✗ ${failures.length} data problem${failures.length === 1 ? "" : "s"}:\n`);
  for (const message of failures) console.error("  - " + message);
  process.exit(1);
}

console.log(
  `✓ Data OK — ${phrases.length} phrases (${townshipCount} townships, ${townCount} towns, ` +
    `${triggerOwners.size} shortcuts), and index.html is in sync.`
);
