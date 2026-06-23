const DARK_BLUE = '#1E3A8A';

// Small "✨" corner button on a selected bubble/narration box — opens the AI
// Writing Assistant sidebar tab for this item (grammar / alternatives / shorten).
export default function AIQuickMenu({ onOpenAI, style }) {
  return (
    <div
      style={{ position: 'absolute', zIndex: 30, ...style }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        title="Open AI writing assistant"
        onClick={onOpenAI}
        style={{
          width: 22, height: 22, borderRadius: '50%',
          background: '#fff', color: DARK_BLUE,
          border: `1.5px solid ${DARK_BLUE}`,
          lineHeight: 1, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 1px 4px rgba(0,0,0,0.2)', padding: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" />
          <text x="12" y="14.5" textAnchor="middle" fontSize="6" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">AI</text>
          <line x1="9" y1="2" x2="9" y2="6" stroke="currentColor" strokeWidth="1.2" />
          <line x1="15" y1="2" x2="15" y2="6" stroke="currentColor" strokeWidth="1.2" />
          <line x1="9" y1="18" x2="9" y2="22" stroke="currentColor" strokeWidth="1.2" />
          <line x1="15" y1="18" x2="15" y2="22" stroke="currentColor" strokeWidth="1.2" />
          <line x1="2" y1="9" x2="6" y2="9" stroke="currentColor" strokeWidth="1.2" />
          <line x1="2" y1="15" x2="6" y2="15" stroke="currentColor" strokeWidth="1.2" />
          <line x1="18" y1="9" x2="22" y2="9" stroke="currentColor" strokeWidth="1.2" />
          <line x1="18" y1="15" x2="22" y2="15" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
    </div>
  );
}
