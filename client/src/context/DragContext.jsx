import { createContext, useContext, useState, useRef, useCallback } from 'react';

const Ctx = createContext(null);

export function DragProvider({ children }) {
  const [dragging, setDragging] = useState(null); // { imageUrl } | null
  const overlayRef = useRef(null);

  const startDrag = useCallback((info) => {
    setDragging(info);
  }, []);

  const moveOverlay = useCallback((x, y) => {
    if (overlayRef.current) {
      overlayRef.current.style.transform = `translate(${x}px, ${y}px)`;
    }
  }, []);

  const endDrag = useCallback(() => {
    setDragging(null);
  }, []);

  return (
    <Ctx.Provider value={{ dragging, startDrag, moveOverlay, endDrag }}>
      {children}

      {/* Floating drag preview — positioned via direct DOM, no React re-renders */}
      {dragging && (
        <div
          ref={overlayRef}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            pointerEvents: 'none',
            zIndex: 99999,
            transform: 'translate(-9999px, -9999px)',
          }}
        >
          <img
            src={dragging.imageUrl}
            alt=""
            draggable={false}
            style={{
              width: 90,
              height: 90,
              objectFit: 'contain',
              display: 'block',
              transform: 'translate(-50%, -50%)',
              borderRadius: 10,
              boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
              opacity: 0.93,
              filter: 'drop-shadow(0 4px 14px rgba(249,115,22,0.35))',
              transition: 'none',
            }}
          />
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useDrag = () => useContext(Ctx);
