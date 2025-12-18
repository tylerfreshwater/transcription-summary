# Transcript Summarizer & Expansion Script (Node.js)

This Node.js utility automates the process of summarizing extremely large transcripts (specifically optimized for Dungeons & Dragons sessions) using OpenAI's Responses API. It intelligently splits text into speaker-aware chunks, enforces a minimum length for summaries, and includes a checkpointing system to resume progress after crashes or rate limits.

## Key Features

* **Speaker-Aware Chunking:** Recognizes `SPEAKER: Name` tags to ensure chunks break naturally between dialogue rather than in the middle of a sentence.
* **Expansion Pass:** If a summary is too short, the script runs a secondary "no-new-facts" expansion pass to improve narrative flow and detail without hallucinating details.
* **Progress Checkpointing:** Saves each chunk to disk immediately. If the script is interrupted, it will skip already-completed parts when restarted.
* **Bridge Logic:** Carries a small "bridge" of context from the end of one summary into the next request to maintain narrative continuity.
* **D&D Optimized:** Pre-configured with a system prompt designed for factual, narrative storytelling of tabletop RPG sessions.

---

## Prerequisites

* **Node.js:** v16.0.0 or higher (uses ESM syntax).
* **OpenAI API Key:** An active key with access to the `gpt-5.2` model (or your preferred model).

---

## Installation

1. Clone or download this repository to your local machine.
2. Navigate to the folder in your terminal.
3. Install dependencies:

```bash
npm install openai
```

---

## Setup & Configuration

### 1. Environment Variable
You must set your OpenAI API key in your environment.

**Windows (Command Prompt):**
```dos
setx OPENAI_API_KEY "your_api_key_here"
```

**Linux/macOS:**
```bash
export OPENAI_API_KEY='your_api_key_here'
```

### 2. Script Configuration
Open `summarize_by_chunks_responses.js` and edit the **USER CONFIGURATIONS** section:

* **`INPUT_TRANSCRIPT_PATH`**: Set the path to your `.txt` transcript file.
* **`TARGET_CHUNK_CHARS`**: Adjust the size of the transcript segments (default 25k).
* **`MIN_CHUNK_SUMMARY_CHARS`**: The minimum length required for a summary before an expansion pass is triggered.
* **`MODEL`**: Set to `gpt-5.2` or your desired OpenAI model.

---

## Usage

Run the script using Node:

```bash
node summarize_by_chunks_responses.js
```

---

## Output Structure

The script creates a `summaries_out` directory. Inside, it creates a folder named after your input file:

* `part_001.txt`, `part_002.txt`, etc.: Individual summaries for each chunk.
* `run_meta.json`: Metadata about the run (model used, chunk sizes, etc.).
* **`combined_summary.txt`**: The final, concatenated narrative.

---

## How it Works

1.  **Normalization:** Converts `SPEAKER: Name` tags into a cleaner `Name:` format.
2.  **Chunking:** Groups speaker blocks into chunks roughly the size of `TARGET_CHUNK_CHARS`.
3.  **Summarization:** Sends chunks to OpenAI. If `BRIDGE_CHARS` is enabled, it includes the end of the previous summary for context.
4.  **Verification:** If the output is shorter than the minimum requirement, it asks the AI to expand the narrative purely by adding "connective tissue" and clarity without adding new facts.
5.  **Assembly:** Once all parts are generated, it compiles them into a single chronological story.

---

## Note

Ensure your transcript follows the `SPEAKER: Name` format for the best chunking results. If your transcript uses a different format, you may need to adjust the `looksLikeSpeakerLine` regex in the script.
