export const MODULE_ID = "mb-soundboard";

// Track active local Sound instances so they can be stopped immediately
const activeSounds = new Set();
let stopEpoch = 0;
let trackingRegistered = false;

/**
 * Core's playAudio receiver calls AudioHelper.play directly. Track our marked
 * cues on that path as well as local previews, leaving all other audio alone.
 */
export function registerAudioTracking() {
  if (trackingRegistered) return;
  trackingRegistered = true;
  const helper = foundry.audio.AudioHelper;
  const originalPlay = helper.play;
  helper.play = function(data, socketOptions) {
    if (data?.mbSoundboard !== true) return originalPlay.call(this, data, socketOptions);
    const epoch = stopEpoch;
    return Promise.resolve(originalPlay.call(this, data, socketOptions)).then(sound => {
      if (!sound) return sound;
      // Loading can finish after Stop All has already been pressed.
      if (epoch !== stopEpoch) {
        sound.stop();
        return sound;
      }
      activeSounds.add(sound);
      const forget = () => activeSounds.delete(sound);
      sound.addEventListener?.("end", forget, { once: true });
      sound.addEventListener?.("stop", forget, { once: true });
      return sound;
    });
  };
}

/**
 * Resolve wildcard audio paths (e.g. "assets/audio/goblin-*.ogg") to a single random file.
 * @param {string|string[]} rawSrc - Local path, web URL, wildcard pattern, or random pool
 * @returns {Promise<string|null>}
 */
export async function resolveAudioSrc(rawSrc) {
  if (Array.isArray(rawSrc)) {
    const pool = rawSrc.filter(src => typeof src === "string" && src.trim());
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }
  if (typeof rawSrc !== "string" || !rawSrc.trim()) return null;
  const src = rawSrc.trim();
  // A signed web URL can contain a literal *, which must never reach FilePicker.
  if (/^https?:\/\//i.test(src) || !src.includes("*")) return src;
  try {
    const result = await foundry.applications.apps.FilePicker.browse("data", src, { wildcard: true });
    const files = result?.files ?? [];
    if (!files.length) {
      ui.notifications.warn(`MB Soundboard: No files matched wildcard "${src}"`);
      return null;
    }
    return files[Math.floor(Math.random() * files.length)];
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to resolve wildcard path:`, error);
    return null;
  }
}

/**
 * Play an audio cue across clients or to targeted players.
 * @param {string|string[]} rawSrc - Path, web URL, wildcard pattern, or random pool
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
  const epoch = stopEpoch;
  const src = await resolveAudioSrc(rawSrc);
  if (!src || epoch !== stopEpoch) return null;

  const numericVolume = Number(volume);
  const clampedVolume = Number.isFinite(numericVolume) ? Math.min(Math.max(numericVolume, 0), 1) : 0.8;

  const audioData = {
    src,
    mbSoundboard: true,
    volume: clampedVolume,
    autoplay: true,
    loop: false,
    channel
  };

  registerAudioTracking();
  const selected = Array.isArray(recipients) ? [...new Set(recipients)] : [];
  if (!localPreviewOnly) {
    // Preserve Foundry's server-side recipient filtering. Exclude this user
    // from the socket send because their local playback is handled below.
    const socketOptions = selected.length
      ? { recipients: selected.filter(id => id !== game.user.id) }
      : {};
    game.socket.emit("playAudio", audioData, socketOptions);
  }

  if (!localPreviewOnly && selected.length && !selected.includes(game.user.id)) return null;
  return foundry.audio.AudioHelper.play(audioData, false);
}

/**
 * Stop all sounds currently playing on this client started by MB Soundboard.
 */
export function stopAllLocalCues() {
  stopEpoch++;
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
