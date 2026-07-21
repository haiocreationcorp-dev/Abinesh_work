// Builds a readable /editor/:comicId route param that still resolves to the real comic —
// title turned into a slug, with the actual database id appended as the last `-` segment
// (cuid ids contain no dashes, so splitting on the last `-` always recovers it exactly).
export const comicEditorParam = (comic) => {
  const slug = (comic.title || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug ? `${slug}-${comic.id}` : comic.id;
};

// Recovers the real comic id from a route param produced by comicEditorParam — also accepts
// a bare id (old links, or a comic with no title yet), since the id itself has no dashes.
export const comicIdFromParam = (param) => {
  if (!param) return param;
  const lastDash = param.lastIndexOf('-');
  return lastDash === -1 ? param : param.slice(lastDash + 1);
};
