// On-blur text correction for comic dialogue/narration boxes.
// Punctuation, spacing, and capitalization are fixed intelligently by a small/fast
// local Ollama model (see /api/ai/punctuate) — it never changes spelling or word choice.
// If Ollama is unreachable, falls back to a quick local regex-based punctuation pass.

import { punctuateText } from '../api/ai.js';

// Local fallback: punctuation, spacing, and capitalization fixes (no word changes).
function fixPunctuation(text) {
  let t = text;

  // Collapse multiple spaces (but not newlines)
  t = t.replace(/[ \t]{2,}/g, ' ');
  // Remove space before punctuation
  t = t.replace(/ +([,.!?;:])/g, '$1');
  // Ensure a space after punctuation when followed by a letter
  t = t.replace(/([,.!?;:])(?=[A-Za-z])/g, '$1 ');
  // Collapse repeated terminal punctuation (e.g. "??" -> "?", "!!!" -> "!")
  t = t.replace(/([!?])\1+/g, '$1');
  // Collapse 2 dots to 1 (leave "..." ellipses alone)
  t = t.replace(/(?<!\.)\.\.(?!\.)/g, '.');
  // Standalone lowercase "i" -> "I"
  t = t.replace(/\bi\b/g, 'I');
  // Capitalize the first letter of the text and after sentence-ending punctuation
  t = t.replace(/(^\s*|[.!?]\s+)([a-z])/g, (m, lead, letter) => lead + letter.toUpperCase());
  // Trim trailing spaces on each line
  t = t.replace(/[ \t]+(\r?\n|$)/g, '$1');
  // Ensure the text ends with terminal punctuation
  if (/[A-Za-z0-9'")\]]$/.test(t)) {
    t += '.';
  }

  return t;
}

/**
 * Run the on-blur punctuation corrector on a plain-text string.
 * Returns { changed, corrected } — corrected is the punctuation-fixed text.
 */
export async function correctText(text) {
  if (!text || !text.trim()) return { changed: false, corrected: text };

  // Always apply the instant local punctuation/capitalization pass first.
  const local = fixPunctuation(text);

  // Then let Ollama refine it further (e.g. missing commas). The server rejects
  // any response that changes word choice, so this can only improve punctuation.
  try {
    const { corrected, changed } = await punctuateText(local);
    if (changed && corrected) return { changed: corrected !== text, corrected };
  } catch {
    // Ollama unreachable — local pass below is still applied.
  }

  return { changed: local !== text, corrected: local };
}
