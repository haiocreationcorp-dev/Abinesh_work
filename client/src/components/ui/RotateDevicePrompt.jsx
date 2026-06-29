// BharathComic's canvas-heavy tools (Comic Editor, Face/Pose/Dress Builder) need real
// horizontal room, which portrait phones/tablets can't give them — rather than redesign
// those tools for a narrow column, the site targets landscape only and asks portrait
// users to rotate. Pure CSS (see .rotate-prompt in index.css): a fixed full-screen
// overlay shown only via @media (orientation: portrait), so it needs no JS orientation
// listener and works identically across every route without each page opting in.
function IconRotate() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="2" width="10" height="16" rx="2" />
      <path d="M3 12a9 9 0 0 0 15.5 6.5" />
      <path d="M21 9a9 9 0 0 0-3-5.7" />
      <polyline points="21 4 21 9 16 9" />
    </svg>
  );
}

export default function RotateDevicePrompt() {
  return (
    <div className="rotate-prompt">
      <div style={{ opacity: 0.9 }}><IconRotate /></div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, margin: 0 }}>Please rotate your device</h2>
      <p style={{ fontSize: 14, opacity: 0.8, maxWidth: 320, margin: 0, lineHeight: 1.6 }}>
        BharathComic's comic editor and builder tools need a wide screen. Rotate to landscape to continue.
      </p>
    </div>
  );
}
