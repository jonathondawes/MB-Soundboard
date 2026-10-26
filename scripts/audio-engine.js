export const MODULE_ID = "mb-soundboard";

// Track active local Sound instances so they can be stopped immediately
const activeSounds = new Set();

/**
 * Resolve wildcard audio paths (e.g. "assets/audio/goblin-*.ogg") to a single random file.
 * @param {string} src - File path or wildcard pattern
 * @returns {Promise<string|null>}
 */
export async function resolveAudioSrc(src) {
  if (!src || !src.includes("*")) return src;
  try {
    const browseResult = await foundry.applications.apps.FilePicker.browse("data", src, { wildcard: true });
    const files = browseResult?.files ?? [];
    if (files.length === 0) {
      ui.notifications.warn(`MB Soundboard: No files matched wildcard "${src}"`);
      return null;
    }
    return files[Math.floor(Math.random() * files.length)];
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to resolve wildcard path:`, err);
    return src;
  }
}

/**
 * Play an audio cue across clients or to targeted players.
 * @param {string} rawSrc - Path or wildcard path to the audio file
 * @param {object} options
 * @param {number} [options.volume=0.8] - Playback volume (0.0 to 1.0)
 * @param {string} [options.channel="interface"] - Audio channel ("interface", "environment", "music")
 * @param {string[]} [options.recipients=[]] - Array of User IDs. Empty = broadcast to everyone.
 * @param {boolean} [options.localPreviewOnly=false] - If true, only plays locally for the triggering user.
 */
export async function playCue(rawSrc, {
  volume = 0.8,
  channel = "interface",
  recipients = [],
  localPreviewOnly = false
} = {}) {
  const src = await resolveAudioSrc(rawSrc);
  if (!src) return null;

  const clampedVolume = Math.min(Math.max(Number(volume) || 0.8, 0), 1);

  const audioData = {
    src,
    volume: clampedVolume,
    autoplay: true,
    loop: false,
    channel
  };

  let socketOptions = true;
  if (localPreviewOnly) {
    socketOptions = false;
  } else if (Array.isArray(recipients) && recipients.length > 0) {
    socketOptions = { recipients };
  }

  const sound = await foundry.audio.AudioHelper.play(audioData, socketOptions);
  if (sound) {
    activeSounds.add(sound);
    sound.addEventListener?.("end", () => activeSounds.delete(sound));
    sound.addEventListener?.("stop", () => activeSounds.delete(sound));
  }
  return sound;
}

/**
 * Stop all sounds currently playing on this client started by MB Soundboard.
 */
export function stopAllLocalCues() {
  for (const sound of activeSounds) {
    try {
      sound.stop();
    } catch (err) {
      console.warn(`${MODULE_ID} | Error stopping sound:`, err);
    }
  }
  activeSounds.clear();
}

/**
 * Broadcast a socket command to stop all active cues on all connected clients.
 */
export function broadcastStopAll() {
  stopAllLocalCues();
  game.socket.emit(`module.${MODULE_ID}`, { action: "stopAll" });
  ui.notifications.info("MB Soundboard: Stopped all active audio cues.");
}
