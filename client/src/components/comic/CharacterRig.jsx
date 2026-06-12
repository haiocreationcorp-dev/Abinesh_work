import { useRef, useEffect } from 'react';

function fixSvgRefs(svgText) {
  const base = window.location.href.split('#')[0];
  return svgText
    .replace(/url\(#/g,           `url(${base}#`)
    .replace(/xlink:href="#/g,    `xlink:href="${base}#`)
    .replace(/(href\s*=\s*)"#/g,  `$1"${base}#`);
}

export default function CharacterRig({ character }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const isSvg = character.filePath.toLowerCase().endsWith('.svg');

    const showAsImg = () => {
      if (!containerRef.current) return;
      containerRef.current.innerHTML = '';
      const img = document.createElement('img');
      img.src = character.filePath;
      img.style.width = '120px';
      img.style.height = '200px';
      img.style.objectFit = 'contain';
      img.style.display = 'block';
      img.draggable = false;
      containerRef.current.appendChild(img);
    };

    if (!isSvg) {
      showAsImg();
      return;
    }

    fetch(character.filePath)
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed');
        return r.text();
      })
      .then((svgText) => {
        if (!containerRef.current) return;
        containerRef.current.innerHTML = fixSvgRefs(svgText);
        const svgEl = containerRef.current.querySelector('svg');
        if (!svgEl) { showAsImg(); return; }
        svgEl.style.width = '120px';
        svgEl.style.height = '200px';
        svgEl.style.overflow = 'visible';
        svgEl.style.pointerEvents = 'none'; // no part interaction
      })
      .catch(showAsImg);
  }, [character.filePath]);

  return (
    <div style={styles.wrapper}>
      <div ref={containerRef} style={styles.svg} />
    </div>
  );
}

const styles = {
  wrapper: { position: 'relative', display: 'inline-block' },
  svg: { display: 'block', lineHeight: 0 },
};
