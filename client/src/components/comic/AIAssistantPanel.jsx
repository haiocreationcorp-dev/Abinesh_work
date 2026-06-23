import { useState, useEffect, useRef } from 'react';
import { useComic } from '../../context/ComicContext.jsx';
import { rewriteText } from '../../api/ai.js';

const ORANGE = '#F97316';

// ── HTML <-> plain text helpers ─────────────────────────────────────────────────
function htmlToText(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div)>/gi, '\n');
  return (tmp.textContent || '').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
}
function textToHtml(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

// ── Locate the selected speech-bubble / narration text in the active panel ──────
function useSelectedTextItem(panelIndex) {
  const { state } = useComic();
  const sel = state.activeSelection;
  const panel = state.panels[panelIndex];
  if (!sel || sel.panelIndex !== panelIndex || !panel) return null;

  if (sel.kind === 'PLACED_BUBBLE') {
    const item = (panel.data?.bubbles || []).find((b) => b.instanceId === sel.instanceId);
    if (item) return { kind: sel.kind, item, label: 'Speech bubble', isHtml: true };
  } else if (sel.kind === 'NARRATION') {
    const item = (panel.data?.narrationBoxes || []).find((b) => b.instanceId === sel.instanceId);
    if (item) return { kind: sel.kind, item, label: 'Narration box', isHtml: true };
  } else if (sel.kind === 'BUBBLE') {
    const item = (panel.data?.speechBubbles || []).find((b) => b.instanceId === sel.instanceId);
    if (item) return { kind: sel.kind, item, label: 'Speech bubble', isHtml: false };
  }
  return null;
}

function SuggestionsCard({ title, before, options, onApply, onDismiss }) {
  return (
    <div style={st.resultCard}>
      <p style={st.resultTitle}>{title}</p>
      <div style={st.resultBlock}>
        <span style={st.resultLabel}>Before</span>
        <p style={st.resultText}>{before || <em style={{ color: '#9CA3AF' }}>(empty)</em>}</p>
      </div>
      {options.length === 0 && (
        <p style={st.resultText}><em style={{ color: '#9CA3AF' }}>(no suggestions)</em></p>
      )}
      {options.map((opt, i) => (
        <button key={i} onClick={() => onApply(opt)} style={st.optionCard}>
          <span style={{ ...st.resultLabel, color: ORANGE }}>Option {i + 1}</span>
          <p style={st.resultText}>{opt}</p>
        </button>
      ))}
      <button style={st.dismissBtn} onClick={onDismiss}>Dismiss</button>
    </div>
  );
}

export default function AIAssistantPanel({ panelIndex }) {
  const { dispatch } = useComic();
  const selected = useSelectedTextItem(panelIndex);
  const textareaRef = useRef(null);

  const [draftText, setDraftText] = useState('');
  const [target, setTarget] = useState(null); // { text, start, end } sent to AI
  const [result, setResult] = useState(null); // { title, before, after }
  const [loading, setLoading] = useState(null); // 'grammar' | 'alternative' | 'shorten' | null
  const [error, setError] = useState(null);

  // Sync the editable draft whenever a different bubble/narration is selected
  useEffect(() => {
    if (!selected) { setDraftText(''); setResult(null); setError(null); return; }
    const raw = selected.isHtml ? htmlToText(selected.item.text) : (selected.item.text || '');
    setDraftText(raw);
    setResult(null);
    setError(null);
  }, [selected?.item?.instanceId]); // eslint-disable-line

  const commitText = (text) => {
    if (!selected) return;
    const value = selected.isHtml ? textToHtml(text) : text;
    const { kind, item } = selected;
    if (kind === 'PLACED_BUBBLE') dispatch({ type: 'UPDATE_PANEL_BUBBLE', panelIndex, instanceId: item.instanceId, updates: { text: value } });
    else if (kind === 'NARRATION') dispatch({ type: 'UPDATE_NARRATION_BOX', panelIndex, instanceId: item.instanceId, updates: { text: value } });
    else if (kind === 'BUBBLE') dispatch({ type: 'UPDATE_BUBBLE', panelIndex, instanceId: item.instanceId, updates: { text: value } });
  };

  // Returns the highlighted portion of the textarea, or the whole text if nothing is selected
  const getTarget = () => {
    const ta = textareaRef.current;
    if (ta && ta.selectionEnd > ta.selectionStart) {
      return { text: draftText.slice(ta.selectionStart, ta.selectionEnd), start: ta.selectionStart, end: ta.selectionEnd };
    }
    return { text: draftText, start: 0, end: draftText.length };
  };

  const runSuggest = async () => {
    const t = getTarget();
    if (!t.text.trim()) return;
    setLoading('suggest'); setError(null); setResult(null);
    try {
      setTarget(t);
      const { results } = await rewriteText(t.text, 'suggest');
      setResult({
        title: 'Suggestions',
        before: t.text,
        options: results || [],
      });
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(null);
    }
  };

  const applyText = (text) => {
    if (!target) return;
    const updated = draftText.slice(0, target.start) + text + draftText.slice(target.end);
    setDraftText(updated);
    commitText(updated);
    setResult(null);
    setTarget(null);
  };

  if (!selected) {
    return (
      <div style={st.empty}>
        <div style={st.emptyIcon}>✨</div>
        <p style={st.emptyTitle}>AI Writing Assistant</p>
        <p style={st.emptyHint}>Select a speech bubble or narration box on the canvas to check spelling &amp; grammar, or get alternative / shorter phrasing for its text.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <p style={st.sectionTitle}>✨ AI Writing Assistant</p>
        <p style={st.sectionDesc}>Editing text of the selected {selected.label.toLowerCase()}. Highlight part of the text to apply suggestions to just that portion.</p>
      </div>

      <textarea
        ref={textareaRef}
        value={draftText}
        onChange={(e) => { setDraftText(e.target.value); setResult(null); }}
        onBlur={() => commitText(draftText)}
        style={st.textarea}
        placeholder="Bubble text…"
      />

      <div style={st.btnRow}>
        <button style={st.actionBtn} disabled={!!loading} onClick={runSuggest}>
          {loading === 'suggest' ? 'Thinking…' : '✨ Suggest'}
        </button>
      </div>

      {error && <p style={st.error}>{error}</p>}

      {result && (
        <SuggestionsCard
          title={result.title}
          before={result.before}
          options={result.options}
          onApply={applyText}
          onDismiss={() => { setResult(null); setTarget(null); }}
        />
      )}

      <p style={st.poweredBy}>Powered by a local Ollama model — make sure Ollama is running.</p>
    </div>
  );
}

const st = {
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8, padding: '32px 12px' },
  emptyIcon: { fontSize: 32 },
  emptyTitle: { fontSize: 15, fontWeight: 800, color: 'var(--t-text)', margin: 0 },
  emptyHint: { fontSize: 12.5, color: 'var(--t-text-faint)', margin: 0, lineHeight: 1.5 },

  sectionTitle: { fontSize: 15, fontWeight: 800, color: 'var(--t-text)', margin: '0 0 4px' },
  sectionDesc: { fontSize: 12, color: 'var(--t-text-faint)', margin: 0, lineHeight: 1.5 },

  textarea: {
    width: '100%', minHeight: 100, resize: 'vertical', boxSizing: 'border-box',
    border: '1.5px solid var(--t-border)', borderRadius: 10, padding: '10px 12px',
    fontSize: 13, fontFamily: 'inherit', lineHeight: 1.5,
    background: 'var(--t-bg3)', color: 'var(--t-text)', outline: 'none',
  },

  btnRow: { display: 'flex', gap: 8 },
  actionBtn: {
    flex: 1, padding: '10px 8px', borderRadius: 10, border: `1.5px solid ${ORANGE}`,
    background: '#fff', color: ORANGE, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
  },

  error: { fontSize: 12, color: '#ef4444', margin: 0, lineHeight: 1.5 },

  resultCard: { border: '1.5px solid var(--t-border)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  resultTitle: { fontSize: 13, fontWeight: 800, color: 'var(--t-text)', margin: 0 },
  resultBlock: { background: 'var(--t-bg3)', border: '1px solid var(--t-border)', borderRadius: 8, padding: '8px 10px' },
  resultLabel: { fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' },
  resultText: { fontSize: 13, color: 'var(--t-text)', margin: '4px 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.5 },

  optionCard: {
    display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
    background: '#FFF7ED', border: '1.5px solid #FED7AA', borderRadius: 8,
    padding: '8px 10px', font: 'inherit',
  },

  dismissBtn: { width: '100%', padding: '9px', borderRadius: 8, border: '1.5px solid var(--t-border)', background: 'none', color: 'var(--t-text-muted)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' },

  poweredBy: { fontSize: 10.5, color: 'var(--t-text-faint)', margin: 0, textAlign: 'center' },
};
