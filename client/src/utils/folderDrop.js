// Recursively reads a dropped folder's contents via the browser's FileSystemEntry API,
// returning a flat array of File objects with `webkitRelativePath` set to match the shape
// a native <input webkitdirectory> selection produces — so existing folder-name/pathing
// logic can treat a drop and a browse-folder pick identically.
export async function readDroppedFolder(dataTransferItems) {
  const entries = Array.from(dataTransferItems)
    .map((item) => (item.webkitGetAsEntry ? item.webkitGetAsEntry() : null))
    .filter(Boolean);

  const files = [];
  await Promise.all(entries.map((entry) => walkEntry(entry, entry.name, files)));
  return files;
}

function walkEntry(entry, path, files) {
  if (entry.isFile) {
    return new Promise((resolve, reject) => {
      entry.file((file) => {
        try {
          Object.defineProperty(file, 'webkitRelativePath', { value: path, configurable: true });
        } catch {
          file.webkitRelativePath = path;
        }
        files.push(file);
        resolve();
      }, reject);
    });
  }
  if (entry.isDirectory) {
    return readAllEntries(entry.createReader()).then((children) =>
      Promise.all(children.map((child) => walkEntry(child, `${path}/${child.name}`, files)))
    );
  }
  return Promise.resolve();
}

// FileSystemDirectoryReader.readEntries() only returns one batch per call (browser-capped,
// often ~100 entries) — it must be called repeatedly until it returns an empty array.
function readAllEntries(reader) {
  return new Promise((resolve, reject) => {
    const all = [];
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) { resolve(all); return; }
        all.push(...batch);
        readBatch();
      }, reject);
    };
    readBatch();
  });
}
