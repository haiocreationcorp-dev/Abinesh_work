import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getStudentComic } from '../api/teacher.js';
import { renderPage, pageStartIndex, LAYOUT_COUNT } from '../utils/comicRenderer.js';

export default function TeacherComicViewPage() {
  const { studentId, comicId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [student, setStudent] = useState(null);
  const [comic, setComic] = useState(null);
  const [pageImages, setPageImages] = useState([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getStudentComic(studentId, comicId)
      .then(async ({ student, comic }) => {
        if (cancelled) return;
        setStudent(student);
        setComic(comic);
        const pages = comic.pages?.length ? comic.pages : [{ layout: 'single' }];
        const images = [];
        for (let i = 0; i < pages.length; i++) {
          const layout = pages[i]?.layout || 'single';
          const start = pageStartIndex(pages, i);
          const panels = comic.panels.slice(start, start + (LAYOUT_COUNT[layout] || 1));
          const canvas = await renderPage(panels, layout);
          images.push(canvas.toDataURL('image/png'));
        }
        if (!cancelled) setPageImages(images);
      })
      .catch((err) => !cancelled && setError(err.response?.data?.error || 'Could not load this comic'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [studentId, comicId]);

  return (
    <div className="page">
      <div className="container section">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/teacher/students')} style={{ marginBottom: 16 }}>
          ← Back to My Students
        </button>

        {loading && <div className="spinner" />}
        {error && <p className="form-error">{error}</p>}

        {!loading && !error && comic && (
          <>
            <h2 style={styles.heading}>{comic.title}</h2>
            <p className="text-muted text-sm" style={{ marginBottom: 24 }}>
              by {student?.name || student?.email} · view only
            </p>
            <div style={styles.pages}>
              {pageImages.map((src, i) => (
                <img key={i} src={src} alt={`Page ${i + 1}`} style={styles.pageImg} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  heading: { fontSize: 24, fontWeight: 700, marginBottom: 4 },
  pages: { display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center' },
  pageImg: { maxWidth: '100%', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)' },
};
