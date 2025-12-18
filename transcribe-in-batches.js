/**
 * summarize_by_chunks_responses.js
 *
 * Node.js (ESM) script that:
 *  1) Splits a large transcript into speaker/paragraph-aware chunks,
 *  2) Summarizes each chunk with the Responses API (gpt-5.2),
 *  3) Enforces a minimum per-chunk summary length (characters) with a safe “expand without new facts” pass,
 *  4) Checkpoints each part to disk so crashes/rate limits don’t lose progress,
 *  5) Combines parts into combined_summary.txt at the end (or on resume).
 *
 * Environment:
 *   OPENAI_API_KEY="..."
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import OpenAI from "openai";
import { fileURLToPath } from "url";

/* ======================
   USER CONFIGURATIONS
====================== */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY in environment.");
  process.exit(1);
}

// === INPUT FILE (EDIT THIS) ===
// Can be relative to this script, or absolute.
// Windows-safe absolute example:
const INPUT_TRANSCRIPT_PATH = String.raw`C:\Users\tyler\Desktop\Transcribe\Batch_Summarizer\transcription - session 7-8-25.txt`;
// Relative example (uncomment to use):
// const INPUT_TRANSCRIPT_PATH = "transcription - session 5-26-25.txt";

const MODEL = "gpt-5.2";

// Target chunk size (approx chars of transcript per request).
const TARGET_CHUNK_CHARS = 25_000;

// Hard cap: don’t let a single chunk get huge if there are no natural breaks.
const MAX_CHUNK_CHARS = 32_000;

// Minimum summary length per chunk (characters).
const MIN_CHUNK_SUMMARY_CHARS = 5_000;

// Optional: carry a small bridge from prior summary into the next request
const BRIDGE_CHARS = 1_200; // set to 0 to disable

// Responses API max output tokens per call.
const MAX_OUTPUT_TOKENS = 8_000;

// Lower temp = more deterministic/faithful summaries.
const TEMPERATURE = 0.2;

// File outputs
const OUTPUT_DIR = "summaries_out";
const COMBINED_FILENAME = "combined_summary.txt";

// System prompt
const SYSTEM_PROMPT = `
You are an expert in transcription and summarization, specializing in Dungeons & Dragons content.

Write a comprehensive, factual narrative of the in-world events described in the provided text.

Rules:
1) Do NOT refer to “this transcript” or “this session.” Write as a standalone story.
2) Do not describe out-of-character reactions unless they are explicitly spoken; you may summarize table logistics briefly when present, without speculation.
3) Preserve attribution: identify who speaks/acts using character names when present.
4) You may use subtle humor or mild roasts ONLY when it is clearly grounded in the described events.
5) Do NOT invent details. If the text is unclear, stay appropriately vague.
6) Use varied language; avoid repeating words like “interaction,” “exchange,” “banter,” “dialogue,” etc.
7) No intro paragraph and no concluding outro; end on the final factual event described.
8) Punctuation: Avoid em dashes (—). Do not use em dashes except in direct quotes when they appear in the provided text. Prefer commas, parentheses, or separate sentences.
`;

/* ======================
   PATH HELPERS (ESM-safe)
====================== */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveInputPath(p) {
  return path.isAbsolute(p) ? p : path.resolve(__dirname, p);
}

function safeFolderNameFromPath(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  return base
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "") // illegal Windows chars
    .replace(/\s+/g, " ")
    .trim();
}

/* ======================
   SMALL HELPERS
====================== */

function sha1(str) {
  return crypto.createHash("sha1").update(str).digest("hex");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readText(filePath) {
  return fs.readFileSync(path.resolve(filePath), "utf-8");
}

function writeText(filePath, contents) {
  fs.writeFileSync(path.resolve(filePath), contents, "utf-8");
}

function exists(filePath) {
  return fs.existsSync(path.resolve(filePath));
}

/**
 * Detect speaker tags like:
 *   "SPEAKER: Hopo"
 */
function looksLikeSpeakerLine(line) {
  return /^SPEAKER:\s*\S+/i.test(line.trim());
}

/**
 * Normalize:
 *   SPEAKER: Hopo
 * into:
 *   Hopo:
 */
function normalizeSpeakerTags(text) {
  return text.replace(/^SPEAKER:\s*(.+)$/gim, (_, name) => `${name.trim()}:`);
}

/**
 * Split transcript into speaker turns.
 */
function splitIntoBlocks(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let current = [];

  const flush = () => {
    if (current.length > 0) {
      blocks.push(current.join("\n").trimEnd());
      current = [];
    }
  };

  for (const line of lines) {
    if (looksLikeSpeakerLine(line)) {
      flush();
      current.push(line.trimEnd());
    } else {
      if (current.length > 0) current.push(line.trimEnd());
      // ignore anything before the first SPEAKER tag
    }
  }

  flush();
  return blocks;
}

/**
 * Build chunks from blocks to target size.
 */
function buildChunksFromBlocks(blocks, targetChars = TARGET_CHUNK_CHARS) {
  const chunks = [];
  let cur = "";

  for (const block of blocks) {
    if (block.length > MAX_CHUNK_CHARS) {
      if (cur.trim().length > 0) {
        chunks.push(cur.trimEnd());
        cur = "";
      }
      for (let i = 0; i < block.length; i += MAX_CHUNK_CHARS) {
        chunks.push(block.slice(i, i + MAX_CHUNK_CHARS));
      }
      continue;
    }

    const addition = (cur.length ? "\n\n" : "") + block;

    if (cur.length > 0 && cur.length + addition.length > MAX_CHUNK_CHARS) {
      chunks.push(cur.trimEnd());
      cur = "";
    }

    if (cur.length > 0 && cur.length >= targetChars) {
      chunks.push(cur.trimEnd());
      cur = "";
    }

    cur += (cur.length ? "\n\n" : "") + block;
  }

  if (cur.trim().length > 0) chunks.push(cur.trimEnd());
  return chunks;
}

/* ======================
   OPENAI CALLS (Responses API)
====================== */

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

async function withRetries(fn, { tries = 6, baseDelayMs = 750 } = {}) {
  let lastErr;

  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      const status = err?.status ?? err?.response?.status;
      const msg = String(err?.message || err);

      const retryable =
        status === 429 ||
        (status >= 500 && status <= 599) ||
        /ETIMEDOUT|ECONNRESET|ENOTFOUND|fetch failed|timeout/i.test(msg);

      if (!retryable || attempt === tries) throw err;

      const jitter = Math.floor(Math.random() * 250);
      const delay = baseDelayMs * Math.pow(2, attempt - 1) + jitter;
      console.warn(
        `Retryable error (attempt ${attempt}/${tries}, status=${status ?? "?"}). Waiting ${delay}ms...`
      );
      await sleep(delay);
    }
  }

  throw lastErr;
}

async function summarizeChunk({ chunkText, chunkIndex, totalChunks, bridgeText }) {
  const normalizedChunk = normalizeSpeakerTags(chunkText);

  const input = `
You are summarizing PART ${chunkIndex + 1} of ${totalChunks}.

${bridgeText ? `Continuity notes (from earlier parts, may be incomplete):\n\`\`\`\n${bridgeText}\n\`\`\`\n` : ""}

Transcript text to summarize:
\`\`\`
${normalizedChunk}
\`\`\`

Write the summary now.
`;

  const resp = await withRetries(() =>
    openai.responses.create({
      model: MODEL,
      instructions: SYSTEM_PROMPT,
      input,
      temperature: TEMPERATURE,
      max_output_tokens: MAX_OUTPUT_TOKENS,
    })
  );

  const text = (resp.output_text || "").trim();
  if (!text) throw new Error("Empty model output_text received.");
  return text;
}

async function expandSummaryNoNewFacts({ summary, minChars }) {
  const input = `
The summary below is under ${minChars} characters.

IMPORTANT CONSTRAINT:
- Do NOT add any new events, items, numbers, quotes, or facts that are not already present in the summary text.
- You may only (a) rephrase, (b) add connective tissue, (c) clarify wording, and (d) reorganize for readability.
- Preserve attribution (who did/said what) exactly as already stated.
- Do not pad with repetitive phrasing; expand by improving clarity and structure.
- Do not introduce em dashes (—). Prefer short sentences.

Summary to expand:
\`\`\`
${summary}
\`\`\`

Expand it now while obeying the constraint.
`;

  const resp = await withRetries(() =>
    openai.responses.create({
      model: MODEL,
      instructions: SYSTEM_PROMPT,
      input,
      temperature: TEMPERATURE,
      max_output_tokens: MAX_OUTPUT_TOKENS,
    })
  );

  const text = (resp.output_text || "").trim();
  if (!text) throw new Error("Empty model output_text received during expansion.");
  return text;
}

/* ======================
   CHECKPOINTING / RESUME
====================== */

function partFilePath(runId, partIndex) {
  return path.join(OUTPUT_DIR, runId, `part_${String(partIndex + 1).padStart(3, "0")}.txt`);
}

function runMetaPath(runId) {
  return path.join(OUTPUT_DIR, runId, `run_meta.json`);
}

function combinedPath(runId) {
  return path.join(OUTPUT_DIR, runId, COMBINED_FILENAME);
}

function loadExistingParts(runId, totalChunks) {
  const parts = new Array(totalChunks).fill(null);
  for (let i = 0; i < totalChunks; i++) {
    const p = partFilePath(runId, i);
    if (exists(p)) parts[i] = readText(p).trimEnd();
  }
  return parts;
}

function combineParts(parts) {
  return parts
    .map((content, idx) => `Part ${idx + 1}\n\n${content || ""}`.trimEnd())
    .join("\n\n");
}

/* ======================
   MAIN
====================== */

async function main() {
  const transcriptPath = resolveInputPath(INPUT_TRANSCRIPT_PATH);

  if (!fs.existsSync(transcriptPath)) {
    console.error(`Input file not found: ${transcriptPath}`);
    process.exit(1);
  }

  const fullTranscript = readText(transcriptPath);

  // Folder name inside summaries_out = input filename (sanitized)
  const runId = safeFolderNameFromPath(transcriptPath);

  ensureDir(OUTPUT_DIR);
  ensureDir(path.join(OUTPUT_DIR, runId));

  const blocks = splitIntoBlocks(fullTranscript);
  const chunks = buildChunksFromBlocks(blocks);

  const meta = {
    runId,
    transcriptPath,
    transcriptSha1: sha1(fullTranscript),
    targetChunkChars: TARGET_CHUNK_CHARS,
    maxChunkChars: MAX_CHUNK_CHARS,
    minSummaryChars: MIN_CHUNK_SUMMARY_CHARS,
    model: MODEL,
    createdAt: new Date().toISOString(),
    totalChunks: chunks.length,
  };
  writeText(runMetaPath(runId), JSON.stringify(meta, null, 2));

  console.log(`Run ID: ${runId}`);
  console.log(`Split transcript into ${chunks.length} chunks (blocks: ${blocks.length}).`);
  console.log(`Output folder: ${path.join(OUTPUT_DIR, runId)}`);

  const existingParts = loadExistingParts(runId, chunks.length);

  let lastSummaryTail = "";

  for (let i = 0; i < chunks.length; i++) {
    const partPath = partFilePath(runId, i);

    if (existingParts[i]) {
      console.log(`Skipping chunk ${i + 1}/${chunks.length} (already exists: ${path.basename(partPath)})`);
      if (BRIDGE_CHARS > 0) lastSummaryTail = existingParts[i].slice(-BRIDGE_CHARS);
      continue;
    }

    console.log(`\nSummarizing chunk ${i + 1}/${chunks.length}...`);

    const bridgeText = BRIDGE_CHARS > 0 ? lastSummaryTail : "";

    let summary = await summarizeChunk({
      chunkText: chunks[i],
      chunkIndex: i,
      totalChunks: chunks.length,
      bridgeText,
    });

    if (summary.length < MIN_CHUNK_SUMMARY_CHARS) {
      console.log(` → Under ${MIN_CHUNK_SUMMARY_CHARS} chars (${summary.length}). Expanding (no new facts)...`);
      summary = await expandSummaryNoNewFacts({
        summary,
        minChars: MIN_CHUNK_SUMMARY_CHARS,
      });
    }

    writeText(partPath, summary.trimEnd());
    console.log(` → Wrote ${path.basename(partPath)} (${summary.length} chars)`);

    if (BRIDGE_CHARS > 0) lastSummaryTail = summary.slice(-BRIDGE_CHARS);
  }

  const finalParts = loadExistingParts(runId, chunks.length);

  const missing = finalParts
    .map((p, idx) => (p ? null : idx + 1))
    .filter(Boolean);

  if (missing.length) {
    console.warn(`\nWARNING: Missing parts: ${missing.join(", ")}. Combined file will be incomplete.`);
  }

  const combined = combineParts(finalParts);
  writeText(combinedPath(runId), combined);

  console.log(`\nCombined summary written to: ${combinedPath(runId)}`);
  console.log(`Combined length: ${combined.length} chars`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
