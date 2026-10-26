import { MODULE_ID } from "./audio-engine.js";
import { isAudioFile, formatAudioLabel } from "./audio-sources.js";

const basename = path => path.split("/").filter(Boolean).pop() || "";
const unique = values => [...new Set(values ?? [])].sort();

/**
 * Root files become General pads. First-level folders become categories;
 * second-level folders become random pools of their immediate audio files.
 * Deeper folders are deliberately not traversed.
 */
export async function scanSoundboardDirectory(rootPath, source = "data") {
  if (typeof rootPath !== "string" || !rootPath.trim()) return [];
  const pads = [];
  const addFiles = (files, category) => {
    for (const file of unique(files).filter(isAudioFile)) {
      pads.push({
        id: `watch:${file}`,
        name: formatAudioLabel(basename(file), { file: true }),
        src: file, pool: [], isPool: false, isWatched: true, isWebUrl: false,
        category, volume: 0.8
      });
    }
  };
  const browseChild = async path => {
    try { return await foundry.applications.apps.FilePicker.browse(source, path); }
    catch (error) {
      console.warn(`${MODULE_ID} | Could not browse subfolder: ${path}`, error);
      return null;
    }
  };
  try {
    const root = await foundry.applications.apps.FilePicker.browse(source, rootPath.trim());
    addFiles(root.files, "General");
    for (const categoryDir of unique(root.dirs)) {
      const category = formatAudioLabel(basename(categoryDir)) || "General";
      const contents = await browseChild(categoryDir);
      if (!contents) continue;
      addFiles(contents.files, category);
      for (const poolDir of unique(contents.dirs)) {
        const poolContents = await browseChild(poolDir);
        if (!poolContents) continue;
        const pool = unique(poolContents.files).filter(isAudioFile);
        if (!pool.length) continue;
        pads.push({
          id: `watch-pool:${poolDir}`,
          name: formatAudioLabel(basename(poolDir)) || "Pool",
          src: pool[0], pool, poolCount: pool.length,
          isPool: true, isWatched: true, isWebUrl: false, category, volume: 0.8
        });
      }
    }
  } catch (error) {
    console.error(`${MODULE_ID} | Failed scanning root soundboard folder "${rootPath}":`, error);
    ui.notifications.error(`MB Soundboard: Could not scan watch folder "${rootPath}". Check console for details.`);
  }
  return pads;
}
