const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
// Small/fast model for the on-blur punctuation pass (called frequently, must be near-instant)
const OLLAMA_PUNCT_MODEL = process.env.OLLAMA_PUNCT_MODEL || 'llama3.2:1b';
// Larger model, custom-tuned for comic-themed alternative phrasing / sentence structure
const OLLAMA_REWRITE_MODEL = process.env.OLLAMA_REWRITE_MODEL || 'comic-rewrite';

// Strip surrounding quotes, code fences, and label prefixes the model sometimes adds
function cleanOutput(text) {
  let t = text.trim();
  t = t.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
  t = t.replace(/^(corrected text|rewritten text|result)\s*:\s*/i, '');
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1);
  }
  return t.trim();
}

async function callOllama(prompt, { model = OLLAMA_MODEL, system, temperature = 0.3, numPredict, timeoutMs = 120_000 } = {}) {
  let res;
  try {
    res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model,
        prompt,
        ...(system ? { system } : {}),
        stream: false,
        // Keep the model resident in RAM well past Ollama's 5-minute default so
        // low-traffic periods don't force a slow cold reload (~50s+) on the next request.
        keep_alive: '30m',
        options: {
          temperature,
          ...(numPredict ? { num_predict: numPredict } : {}),
        },
      }),
    });
  } catch (fetchErr) {
    const isTimeout = fetchErr.name === 'TimeoutError' || fetchErr.name === 'AbortError';
    const err = new Error(
      isTimeout
        ? `Ollama timed out after ${timeoutMs / 1000}s — the model may still be loading. Try again in a moment.`
        : 'Could not reach Ollama. Make sure it is running locally (ollama serve) and the model is pulled.'
    );
    err.status = 502;
    throw err;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Ollama error (${res.status}): ${body || res.statusText}`);
    err.status = 502;
    throw err;
  }
  const data = await res.json();
  return (data.response || '').trim();
}

const GRAMMAR_SYSTEM = `You are a spelling and grammar checker for dialogue in a comic book editor. ` +
  `You will be given a short piece of dialogue or narration text. ` +
  `Fix any spelling and grammar mistakes only. ` +
  `Preserve the original tone, slang, punctuation style, line breaks, and meaning as much as possible. ` +
  `Do not rephrase or shorten the text, do not add quotes, and do not explain your changes. ` +
  `Reply with only the corrected text and nothing else.`;

const REWRITE_SYSTEM = `You are a writing assistant for dialogue and narration in a comic book editor. ` +
  `You will be given a short piece of comic text and an instruction. ` +
  `Follow the instruction while keeping the core meaning, tone, and intent of the original text unchanged. ` +
  `Keep it suitable for a speech bubble or narration box (concise, natural-sounding dialogue). ` +
  `Reply with only the rewritten text and nothing else - no quotes, no explanations, no labels.`;

// Punctuation-only pass run on every blur — must NOT touch spelling/word choice.
const PUNCT_SYSTEM = `You fix punctuation, spacing, and capitalization for dialogue in a comic book editor. ` +
  `Fix only: missing/extra commas, periods, question marks, exclamation marks, quotation marks, spacing, and capitalization at the start of sentences. ` +
  `Do NOT fix spelling, do NOT change, replace, remove, or reorder any words, and do NOT rephrase. ` +
  `Keep every word exactly as written, including misspellings, slang, and made-up words. ` +
  `Reply with only the corrected text and nothing else - no quotes, no explanations.`;

const ALTERNATIVES_SYSTEM = `You are a writing assistant for dialogue and narration in a comic book editor. ` +
  `Given a short piece of comic text, suggest exactly 3 different alternative ways to phrase it, ` +
  `keeping the same core meaning, tone, and intent. Keep each suggestion concise and natural-sounding, suitable for a speech bubble or narration box. ` +
  `Reply with exactly 3 lines, each starting with "1. ", "2. ", "3. " followed by one alternative, and nothing else - no extra commentary.`;

// Single consolidated "Suggest" pass: spelling/grammar fix + trim + punctuation +
// comic-styled Indian English phrasing, while staying relevant to the original meaning.
// Returns exactly 3 distinct options so the user can pick one.
const SUGGEST_SYSTEM = `You are "Comic Scribe", an editor for dialogue and narration in a comic book, writing in a comic-style Indian English voice. ` +
  `Given a short piece of comic text, suggest exactly 3 different improved versions of it. Each version should: ` +
  `fix all spelling, grammar, and punctuation mistakes; ` +
  `trim filler and redundant words so it is concise and punchy; ` +
  `use natural, expressive comic-style Indian English wording that fits the tone and context of the original. ` +
  `Keep the core meaning, intent, and any character names exactly as in the original - do not invent new content or change the topic. ` +
  `Vary the phrasing between the 3 versions (e.g. one short/punchy, one with different word order, one with stronger word choices) rather than producing near-duplicates. ` +
  `Reply with exactly 3 lines, each starting with "1. ", "2. ", "3. " followed by one version, and nothing else - no extra commentary.`;

// POST /api/ai/grammar  { text }
exports.checkGrammar = async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'text is required' });

    const prompt = `${GRAMMAR_SYSTEM}\n\nText:\n"""${text.trim()}"""\n\nCorrected text:`;
    const raw = await callOllama(prompt);
    const corrected = cleanOutput(raw);

    res.json({ original: text, corrected, changed: corrected.trim() !== text.trim() });
  } catch (err) {
    next(err);
  }
};

// POST /api/ai/rewrite  { text, mode: 'alternative' | 'shorten' | 'suggest' }
// 'alternative' and 'suggest' return 3 suggestions (results); 'shorten' returns a single result.
exports.rewriteText = async (req, res, next) => {
  try {
    const { text, mode } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'text is required' });

    if (mode === 'alternative') {
      const prompt = `Text:\n"""${text.trim()}"""\n\nAlternatives:`;
      const raw = await callOllama(prompt, { model: OLLAMA_REWRITE_MODEL, system: ALTERNATIVES_SYSTEM, temperature: 0.7 });
      const results = raw
        .split('\n')
        .map((line) => cleanOutput(line.replace(/^\s*\d+[.)]\s*/, '')))
        .filter(Boolean)
        .slice(0, 3);

      return res.json({ original: text, results });
    }

    if (mode === 'suggest') {
      const prompt = `Text:\n"""${text.trim()}"""\n\nSuggestions:`;
      const raw = await callOllama(prompt, { model: OLLAMA_REWRITE_MODEL, system: SUGGEST_SYSTEM, temperature: 0.6 });
      const results = raw
        .split('\n')
        .map((line) => cleanOutput(line.replace(/^\s*\d+[.)]\s*/, '')))
        .filter(Boolean)
        .slice(0, 3);

      return res.json({ original: text, results });
    }

    const instruction = 'Rewrite the text to be noticeably shorter and more concise, while keeping the exact same meaning.';
    const prompt = `Instruction: ${instruction}\n\nText:\n"""${text.trim()}"""\n\nRewritten text:`;
    const raw = await callOllama(prompt, { model: OLLAMA_REWRITE_MODEL, system: REWRITE_SYSTEM });
    const result = cleanOutput(raw);

    res.json({ original: text, result });
  } catch (err) {
    next(err);
  }
};

// Lowercased sequence of word-tokens, used to make sure the punctuation pass
// didn't sneak in spelling/word changes.
function words(text) {
  return (text.toLowerCase().match(/[a-z0-9']+/g) || []);
}

// POST /api/ai/punctuate  { text }
// Fast, punctuation/capitalization-only pass run on blur. Never changes words —
// if the model alters any word, the change is rejected and the original is returned.
exports.punctuateText = async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'text is required' });

    const prompt = `${PUNCT_SYSTEM}\n\nText:\n"""${text}"""\n\nCorrected text:`;
    const raw = await callOllama(prompt, { model: OLLAMA_PUNCT_MODEL, temperature: 0, numPredict: Math.max(32, text.length + 16) });
    const corrected = cleanOutput(raw);

    const sameWords = JSON.stringify(words(corrected)) === JSON.stringify(words(text));
    if (!sameWords) {
      return res.json({ original: text, corrected: text, changed: false });
    }

    res.json({ original: text, corrected, changed: corrected !== text });
  } catch (err) {
    next(err);
  }
};
