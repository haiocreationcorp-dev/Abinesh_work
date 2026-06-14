import { createContext, useContext, useReducer, useCallback } from 'react';

const genId = () => crypto.randomUUID();

// How many panels each layout requires
export const LAYOUT_COUNT = { single: 1, '2h': 2, '2v': 2, '4': 4 };

// Sum of panel counts for pages 0..pageIdx-1
function pageStartIndex(pages, pageIdx) {
  let start = 0;
  for (let i = 0; i < pageIdx; i++) start += (LAYOUT_COUNT[pages[i]?.layout] || 1);
  return start;
}

const EMPTY_PANEL_DATA = () => ({
  background: null,
  lightingOverlay: null,
  characters: [],
  faces: [],
  props: [],
  effects: [],
  costumes: [],
  sounds: [],
  speechBubbles: [],
  narrationBoxes: [],
  bubbles: [],
});

const makePanel = (order) => ({ id: genId(), order, data: EMPTY_PANEL_DATA() });
const makePage  = (layout = 'single') => ({ id: genId(), layout });

const initialState = {
  comicId: null,
  title: 'Untitled Comic',
  author: '',
  panels: [makePanel(0)],
  pages: [makePage('single')],
  activePageIndex: 0,
  activePanelIndex: 0,
  activeSelection: null, // { kind, instanceId, panelIndex } — UI only, not in undo snapshot
  clipboard: null,       // { kindKey, item } — UI only, not in undo snapshot
  isDirty: false,
  past: [],
  future: [],
};

// Snapshot of the parts that participate in undo/redo
const snapshot = (state) => ({
  panels: state.panels,
  pages: state.pages,
  activePageIndex: state.activePageIndex,
  activePanelIndex: state.activePanelIndex,
});

function baseReducer(state, action) {
  switch (action.type) {

    case 'LOAD_COMIC': {
      const rawPanels = action.comic.panels || [];
      const rawPages  = Array.isArray(action.comic.pages) && action.comic.pages.length
        ? action.comic.pages
        : rawPanels.map(() => makePage('single')); // fallback: one page per panel

      return {
        ...state,
        comicId: action.comic.id,
        title: action.comic.title,
        author: action.comic.author || '',
        panels: rawPanels.map((p) => ({
          id: p.id,
          order: p.order,
          data: { ...EMPTY_PANEL_DATA(), ...(typeof p.data === 'string' ? JSON.parse(p.data) : (p.data || {})) },
        })),
        pages: rawPages,
        activePageIndex: 0,
        activePanelIndex: 0,
        isDirty: false,
      };
    }

    case 'SET_TITLE':
      return { ...state, title: action.title, isDirty: true };

    case 'SET_AUTHOR':
      return { ...state, author: action.author, isDirty: true };

    // ── Page actions ─────────────────────────────────────────────────────────

    case 'ADD_PAGE': {
      const layout = action.layout || 'single';
      const count  = LAYOUT_COUNT[layout] || 1;
      const newPage    = makePage(layout);
      const newPanels  = Array.from({ length: count }, (_, i) => makePanel(state.panels.length + i));
      const newPageIdx = state.pages.length;
      return {
        ...state,
        pages: [...state.pages, newPage],
        panels: [...state.panels, ...newPanels],
        activePageIndex: newPageIdx,
        activePanelIndex: state.panels.length,
        isDirty: true,
      };
    }

    case 'ADD_PAGE_AT': {
      const layout  = action.layout || 'single';
      const count   = LAYOUT_COUNT[layout] || 1;
      const at      = action.insertAt ?? state.pages.length;
      const panelAt = pageStartIndex(state.pages, at);
      const newPage   = makePage(layout);
      const newPanels = Array.from({ length: count }, () => makePanel(0));
      const newPages  = [...state.pages.slice(0, at), newPage, ...state.pages.slice(at)];
      const allPanels = [
        ...state.panels.slice(0, panelAt),
        ...newPanels,
        ...state.panels.slice(panelAt),
      ].map((p, i) => ({ ...p, order: i }));
      return {
        ...state,
        pages: newPages,
        panels: allPanels,
        activePageIndex: at,
        activePanelIndex: panelAt,
        isDirty: true,
      };
    }

    case 'REORDER_PAGE': {
      const { from, to } = action;
      if (from === to) return state;
      // Build per-page panel slices
      const slices = [];
      let off = 0;
      for (const page of state.pages) {
        const cnt = LAYOUT_COUNT[page.layout] || 1;
        slices.push({ page, panels: state.panels.slice(off, off + cnt) });
        off += cnt;
      }
      const reordered = [...slices];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);
      const newPages  = reordered.map((s) => s.page);
      const newPanels = reordered.flatMap((s) => s.panels).map((p, i) => ({ ...p, order: i }));
      // Keep active page tracking the same logical page after move
      let newActive = state.activePageIndex;
      if (newActive === from) newActive = to;
      else if (from < to && newActive > from && newActive <= to) newActive--;
      else if (from > to && newActive >= to && newActive < from) newActive++;
      return {
        ...state,
        pages: newPages,
        panels: newPanels,
        activePageIndex: newActive,
        activePanelIndex: pageStartIndex(newPages, newActive),
        isDirty: true,
      };
    }

    case 'REMOVE_PAGE': {
      const { pageIndex } = action;
      const start = pageStartIndex(state.pages, pageIndex);
      const count = LAYOUT_COUNT[state.pages[pageIndex]?.layout] || 1;

      const newPages  = state.pages.filter((_, i) => i !== pageIndex);
      const newPanels = [
        ...state.panels.slice(0, start),
        ...state.panels.slice(start + count),
      ].map((p, i) => ({ ...p, order: i }));

      if (newPages.length === 0) {
        return { ...state, pages: [], panels: [], activePageIndex: 0, activePanelIndex: 0, isDirty: true };
      }

      const newPageIdx  = Math.min(pageIndex, newPages.length - 1);
      const newPanelIdx = pageStartIndex(newPages, newPageIdx);
      return {
        ...state,
        pages: newPages,
        panels: newPanels,
        activePageIndex: newPageIdx,
        activePanelIndex: newPanelIdx,
        isDirty: true,
      };
    }

    case 'SET_ACTIVE_PAGE': {
      const { pageIndex } = action;
      return {
        ...state,
        activePageIndex: pageIndex,
        activePanelIndex: pageStartIndex(state.pages, pageIndex),
      };
    }

    case 'SET_PAGE_LAYOUT': {
      const { pageIndex, layout } = action;
      const oldCount = LAYOUT_COUNT[state.pages[pageIndex]?.layout] || 1;
      const newCount = LAYOUT_COUNT[layout] || 1;
      const start    = pageStartIndex(state.pages, pageIndex);

      const newPages = state.pages.map((p, i) => i === pageIndex ? { ...p, layout } : p);
      let newPanels  = [...state.panels];

      if (newCount > oldCount) {
        const toAdd = Array.from({ length: newCount - oldCount }, () => makePanel(0));
        newPanels = [...newPanels.slice(0, start + oldCount), ...toAdd, ...newPanels.slice(start + oldCount)];
      } else if (newCount < oldCount) {
        newPanels = [...newPanels.slice(0, start + newCount), ...newPanels.slice(start + oldCount)];
      }

      newPanels = newPanels.map((p, i) => ({ ...p, order: i }));
      return {
        ...state,
        pages: newPages,
        panels: newPanels,
        activePanelIndex: Math.min(state.activePanelIndex, newPanels.length - 1),
        isDirty: true,
      };
    }

    // ── Panel-level actions (operate on state.panels by flat index) ───────────

    case 'SET_ACTIVE_PANEL':
      // Clear selection only when actually switching to a different panel
      return {
        ...state,
        activePanelIndex: action.index,
        activeSelection: state.activePanelIndex !== action.index ? null : state.activeSelection,
      };

    case 'SET_ACTIVE_SELECTION':
      return { ...state, activeSelection: action.selection };

    case 'TOGGLE_CROP_MODE':
      if (!state.activeSelection) return state;
      return { ...state, activeSelection: { ...state.activeSelection, cropping: !state.activeSelection.cropping } };

    // Atomically activates a panel AND selects an item — avoids race with SET_ACTIVE_PANEL
    case 'SELECT_ITEM_IN_PANEL':
      return {
        ...state,
        activePanelIndex: action.panelIndex,
        activeSelection: { kind: action.kind, instanceId: action.instanceId, panelIndex: action.panelIndex },
      };

    case 'UPDATE_PANEL_DATA': {
      const panels = state.panels.map((p, i) =>
        i === action.index ? { ...p, data: { ...p.data, ...action.data } } : p
      );
      return { ...state, panels, isDirty: true };
    }

    case 'ADD_CHARACTER_TO_PANEL': {
      const panels = state.panels.map((p, i) => {
        if (i !== action.panelIndex) return p;
        const character = {
          instanceId: genId(),
          assetId: action.asset.id,
          filePath: action.asset.filePath,
          name: action.asset.name,
          position: action.position || { x: 80, y: 40 },
          scale: 1,
          rotation: 0,
          flipX: false,
          bodyParts: {},
        };
        return { ...p, data: { ...EMPTY_PANEL_DATA(), ...p.data, characters: [...(p.data.characters || []), character] } };
      });
      return { ...state, panels, isDirty: true };
    }

    case 'UPDATE_CHARACTER': {
      const panels = state.panels.map((p, i) => {
        if (i !== action.panelIndex) return p;
        const characters = p.data.characters.map((c) =>
          c.instanceId === action.instanceId ? { ...c, ...action.updates } : c
        );
        return { ...p, data: { ...p.data, characters } };
      });
      return { ...state, panels, isDirty: true };
    }

    case 'REMOVE_CHARACTER': {
      const panels = state.panels.map((p, i) => {
        if (i !== action.panelIndex) return p;
        return { ...p, data: { ...p.data, characters: p.data.characters.filter((c) => c.instanceId !== action.instanceId) } };
      });
      return { ...state, panels, isDirty: true };
    }

    case 'ADD_FACE_TO_PANEL': {
      const panels = state.panels.map((p, i) => {
        if (i !== action.panelIndex) return p;
        const face = {
          instanceId: action.instanceId || genId(),
          faceAssetId: action.asset.id,
          name: action.asset.name,
          position: action.position || { x: 80, y: 40 },
          scale: 1,
          rotation: 0,
          flipX: false,
          faceShape: action.faceShape,
          parts: action.parts || {},
        };
        return { ...p, data: { ...EMPTY_PANEL_DATA(), ...p.data, faces: [...(p.data.faces || []), face] } };
      });
      return { ...state, panels, isDirty: true };
    }

    case 'UPDATE_FACE': {
      const panels = state.panels.map((p, i) => {
        if (i !== action.panelIndex) return p;
        const faces = (p.data.faces || []).map((f) =>
          f.instanceId === action.instanceId ? { ...f, ...action.updates } : f
        );
        return { ...p, data: { ...p.data, faces } };
      });
      return { ...state, panels, isDirty: true };
    }

    case 'SET_FACE_PART': {
      const panels = state.panels.map((p, i) => {
        if (i !== action.panelIndex) return p;
        const faces = (p.data.faces || []).map((f) =>
          f.instanceId === action.instanceId ? { ...f, parts: { ...f.parts, [action.partType]: action.part } } : f
        );
        return { ...p, data: { ...p.data, faces } };
      });
      return { ...state, panels, isDirty: true };
    }

    case 'REMOVE_FACE': {
      const panels = state.panels.map((p, i) => {
        if (i !== action.panelIndex) return p;
        return { ...p, data: { ...p.data, faces: (p.data.faces || []).filter((f) => f.instanceId !== action.instanceId) } };
      });
      return { ...state, panels, isDirty: true };
    }

    case 'ADD_PROP_TO_PANEL': {
      const panels = state.panels.map((p, i) => {
        if (i !== action.panelIndex) return p;
        const item = {
          instanceId: genId(),
          assetId: action.asset.id,
          filePath: action.asset.filePath,
          name: action.asset.name,
          position: action.position || { x: 50, y: 50 },
          scale: 1,
          rotation: 0,
        };
        const key = action.kind;
        return { ...p, data: { ...EMPTY_PANEL_DATA(), ...p.data, [key]: [...(p.data[key] || []), item] } };
      });
      return { ...state, panels, isDirty: true };
    }

    case 'UPDATE_PLACED_ITEM': {
      const panels = state.panels.map((p, i) => {
        if (i !== action.panelIndex) return p;
        const arr = p.data[action.kind].map((item) =>
          item.instanceId === action.instanceId ? { ...item, ...action.updates } : item
        );
        return { ...p, data: { ...p.data, [action.kind]: arr } };
      });
      return { ...state, panels, isDirty: true };
    }

    case 'REMOVE_PLACED_ITEM': {
      const panels = state.panels.map((p, i) => {
        if (i !== action.panelIndex) return p;
        return { ...p, data: { ...p.data, [action.kind]: p.data[action.kind].filter((item) => item.instanceId !== action.instanceId) } };
      });
      return { ...state, panels, isDirty: true };
    }

    case 'SET_BACKGROUND': {
      const panels = state.panels.map((p, i) =>
        i === action.panelIndex ? { ...p, data: { ...p.data, background: action.background } } : p
      );
      return { ...state, panels, isDirty: true };
    }

    case 'SET_LIGHTING_OVERLAY': {
      const panels = state.panels.map((p, i) =>
        i === action.panelIndex ? { ...p, data: { ...p.data, lightingOverlay: action.overlay } } : p
      );
      return { ...state, panels, isDirty: true };
    }

    case 'ADD_SPEECH_BUBBLE': {
      const panels = state.panels.map((p, i) => {
        if (i !== action.panelIndex) return p;
        const bubble = {
          instanceId: genId(),
          type: 'speech',
          text: 'Hello!',
          position: { x: 10, y: 5 },
          width: 160,
          height: 70,
          tailX: 80,
          tailY: 70,
          style: { fillColor: '#ffffff', strokeColor: '#000000', fontSize: 13, fontFamily: 'Comic Neue, cursive' },
        };
        return { ...p, data: { ...EMPTY_PANEL_DATA(), ...p.data, speechBubbles: [...(p.data.speechBubbles || []), bubble] } };
      });
      return { ...state, panels, isDirty: true };
    }

    case 'UPDATE_BUBBLE': {
      const panels = state.panels.map((p, i) => {
        if (i !== action.panelIndex) return p;
        const speechBubbles = p.data.speechBubbles.map((b) =>
          b.instanceId === action.instanceId ? { ...b, ...action.updates } : b
        );
        return { ...p, data: { ...p.data, speechBubbles } };
      });
      return { ...state, panels, isDirty: true };
    }

    case 'REMOVE_BUBBLE': {
      const panels = state.panels.map((p, i) => {
        if (i !== action.panelIndex) return p;
        return { ...p, data: { ...p.data, speechBubbles: p.data.speechBubbles.filter((b) => b.instanceId !== action.instanceId) } };
      });
      return { ...state, panels, isDirty: true };
    }

    case 'ADD_PANEL_BUBBLE': {
      const panels = state.panels.map((p, i) => {
        if (i !== action.panelIndex) return p;
        const b = {
          instanceId: genId(),
          filePath: action.asset.filePath,
          position: action.position || { x: 60, y: 40 },
          width: 220, height: 150,
          flipX: false, rotation: 0,
          showShadow: true,
          fillColor: '#F5C518',
          strokeColor: '#000000',
          text: '',
          textStyle: { fontFamily: "'Comic Sans MS', cursive", fontSize: 16, color: '#000000' },
        };
        return { ...p, data: { ...p.data, bubbles: [...(p.data.bubbles || []), b] } };
      });
      return { ...state, panels, isDirty: true };
    }

    case 'UPDATE_PANEL_BUBBLE': {
      const panels = state.panels.map((p, i) => {
        if (i !== action.panelIndex) return p;
        return { ...p, data: { ...p.data, bubbles: (p.data.bubbles || []).map((b) => b.instanceId === action.instanceId ? { ...b, ...action.updates } : b) } };
      });
      return { ...state, panels, isDirty: true };
    }

    case 'REMOVE_PANEL_BUBBLE': {
      const panels = state.panels.map((p, i) => {
        if (i !== action.panelIndex) return p;
        return { ...p, data: { ...p.data, bubbles: (p.data.bubbles || []).filter((b) => b.instanceId !== action.instanceId) } };
      });
      return { ...state, panels, isDirty: true };
    }

    case 'ADD_NARRATION_BOX': {
      const panels = state.panels.map((p, i) => {
        if (i !== action.panelIndex) return p;
        const box = {
          instanceId: genId(),
          text: 'Narration text...',
          position: action.position || 'top',
          style: { fillColor: '#F9E07A', textColor: '#000000', fontSize: 13, height: 40, width: 175, ...(action.style || {}) },
        };
        return { ...p, data: { ...p.data, narrationBoxes: [...(p.data.narrationBoxes || []), box] } };
      });
      return { ...state, panels, isDirty: true };
    }

    case 'UPDATE_NARRATION_BOX': {
      const panels = state.panels.map((p, i) => {
        if (i !== action.panelIndex) return p;
        const narrationBoxes = (p.data.narrationBoxes || []).map((b) =>
          b.instanceId === action.instanceId ? { ...b, ...action.updates } : b
        );
        return { ...p, data: { ...p.data, narrationBoxes } };
      });
      return { ...state, panels, isDirty: true };
    }

    case 'REMOVE_NARRATION_BOX': {
      const panels = state.panels.map((p, i) => {
        if (i !== action.panelIndex) return p;
        return { ...p, data: { ...p.data, narrationBoxes: (p.data.narrationBoxes || []).filter((b) => b.instanceId !== action.instanceId) } };
      });
      return { ...state, panels, isDirty: true };
    }

    case 'COPY_ITEM':
      return { ...state, clipboard: { kindKey: action.kindKey, item: action.item } };

    case 'PASTE_ITEM': {
      const src = state.clipboard;
      if (!src) return state;
      const panels = state.panels.map((p, i) => {
        if (i !== action.panelIndex) return p;
        const newItem = {
          ...src.item,
          instanceId: genId(),
          position: {
            x: (src.item.position?.x || 0) + 20,
            y: (src.item.position?.y || 0) + 20,
          },
        };
        return { ...p, data: { ...p.data, [src.kindKey]: [...(p.data[src.kindKey] || []), newItem] } };
      });
      return { ...state, panels, isDirty: true };
    }

    case 'MOVE_ITEM_TO_PANEL': {
      const { fromPanelIndex, toPanelIndex, kindKey, instanceId, position } = action;
      if (fromPanelIndex === toPanelIndex) return state;
      const srcPanel = state.panels[fromPanelIndex];
      if (!srcPanel) return state;
      const item = (srcPanel.data[kindKey] || []).find((x) => x.instanceId === instanceId);
      if (!item) return state;
      const panels = state.panels.map((p, i) => {
        if (i === fromPanelIndex)
          return { ...p, data: { ...p.data, [kindKey]: (p.data[kindKey] || []).filter((x) => x.instanceId !== instanceId) } };
        if (i === toPanelIndex)
          return { ...p, data: { ...p.data, [kindKey]: [...(p.data[kindKey] || []), { ...item, position }] } };
        return p;
      });
      return { ...state, panels, isDirty: true };
    }

    case 'MARK_SAVED':
      return { ...state, isDirty: false };

    // ── Undo / Redo ───────────────────────────────────────────────────────────

    case 'UNDO': {
      if (!state.past?.length) return state;
      const prev = state.past[state.past.length - 1];
      // Handle both old format (plain array) and new snapshot format
      const restored = prev?.panels ? prev : { panels: prev, pages: state.pages, activePageIndex: state.activePageIndex, activePanelIndex: state.activePanelIndex };
      return {
        ...state,
        ...restored,
        past: state.past.slice(0, -1),
        future: [snapshot(state), ...(state.future || [])].slice(0, 50),
        isDirty: true,
      };
    }

    case 'REDO': {
      if (!state.future?.length) return state;
      const next = state.future[0];
      const restored = next?.panels ? next : { panels: next, pages: state.pages, activePageIndex: state.activePageIndex, activePanelIndex: state.activePanelIndex };
      return {
        ...state,
        ...restored,
        past: [...(state.past || []), snapshot(state)].slice(-50),
        future: state.future.slice(1),
        isDirty: true,
      };
    }

    default:
      return state;
  }
}

// Actions that don't push to undo history
const SKIP_HISTORY = new Set(['UNDO', 'REDO', 'LOAD_COMIC', 'SET_ACTIVE_PAGE', 'SET_ACTIVE_PANEL', 'MARK_SAVED', 'SET_TITLE']);

function reducer(state, action) {
  // PUSH_HISTORY saves current state to past without applying any change
  if (action.type === 'PUSH_HISTORY') {
    return {
      ...state,
      past: [...(state.past || []), snapshot(state)].slice(-50),
      future: [],
    };
  }
  const next = baseReducer(state, action);
  if (SKIP_HISTORY.has(action.type) || action.preview || (next.panels === state.panels && next.pages === state.pages)) return next;
  return {
    ...next,
    past: [...(state.past || []), snapshot(state)].slice(-50),
    future: [],
  };
}

const ComicContext = createContext(null);

export function ComicProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const loadComic = useCallback((comic) => dispatch({ type: 'LOAD_COMIC', comic }), []);

  // Active panel is the flat-array panel at activePanelIndex
  const activePanel = state.panels[state.activePanelIndex] || state.panels[0];

  // Panels belonging to the active page
  const activePage     = state.pages[state.activePageIndex] || state.pages[0];
  const pageStart      = (state.pages && state.activePageIndex != null)
    ? (() => { let s = 0; for (let i = 0; i < state.activePageIndex; i++) s += (LAYOUT_COUNT[state.pages[i]?.layout] || 1); return s; })()
    : 0;
  const pageCount      = LAYOUT_COUNT[activePage?.layout] || 1;
  const activePagePanels = state.panels.slice(pageStart, pageStart + pageCount);

  return (
    <ComicContext.Provider value={{ state, dispatch, loadComic, activePanel, activePage, activePagePanels, pageStart }}>
      {children}
    </ComicContext.Provider>
  );
}

export const useComic = () => useContext(ComicContext);
