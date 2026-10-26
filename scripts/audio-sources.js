const AUDIO_EXTENSIONS = [".ogg", ".mp3", ".wav", ".webm", ".flac", ".m4a"];

export function isAudioFile(path) {
  if (typeof path !== "string") return false;
  const pathname = path.split(/[?#]/, 1)[0].toLowerCase();
  return AUDIO_EXTENSIONS.some(extension => pathname.endsWith(extension));
}

export function formatAudioLabel(name, { file = false } = {}) {
  let label = name;
  try { label = decodeURIComponent(label); } catch { /* Keep filenames containing a literal %. */ }
  if (file) label = label.replace(/\.[^/.]+$/, "");
  return label.replace(/[-_]/g, " ").trim();
}

/** Accept direct HTTPS audio files, including signed URLs with query parameters. */
export function parseWebAudioUrl(value) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || !isAudioFile(url.pathname)) return null;
    return url.href;
  } catch {
    return null;
  }
}
