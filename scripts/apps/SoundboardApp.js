import { MODULE_ID, playCue, broadcastStopAll } from "../audio-engine.js";
import { scanSoundboardDirectory } from "../directory-scanner.js";
import { AddUrlDialog } from "./AddUrlDialog.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SoundboardApp extends HandlebarsApplicationMixin(ApplicationV2) {
  #selectedRecipients = new Set();
  #includeGMInWhisper = true;
  #activeCategory = "All";
  #searchQuery = "";
  #watchedSoundsCache = null;
  #cachedWatchFolder = "";
  #scanPromise = null;

  static DEFAULT_OPTIONS = {
    id: "mb-soundboard-app",
    tag: "div",
    classes: ["mb-soundboard"],
    window: {
      title: "MB Soundboard",
      icon: "fa-solid fa-table-cells",
      resizable: true
    },
    position: { width: 760, height: 560 },
    actions: {
      toggleRecipient: SoundboardApp.#onToggleRecipient,
      clearRecipients: SoundboardApp.#onClearRecipients,
      toggleGMMonitor: SoundboardApp.#onToggleGMMonitor,
      selectCategory: SoundboardApp.#onSelectCategory,
      triggerSound: SoundboardApp.#onTriggerSound,
      addSound: SoundboardApp.#onAddSound,
      addWebUrl: SoundboardApp.#onAddWebUrl,
      setWatchFolder: SoundboardApp.#onSetWatchFolder,
      rescanWatchFolder: SoundboardApp.#onRescanWatchFolder,
      stopAll: SoundboardApp.#onStopAll
    }
  };

  static PARTS = {
    header: { template: `modules/${MODULE_ID}/templates/target-bar.hbs` },
    grid: { template: `modules/${MODULE_ID}/templates/sound-grid.hbs`, scrollable: [""] }
  };

  async #getMergedSounds() {
    const watchFolder = (game.settings.get(MODULE_ID, "watchFolder") ?? "").trim();
    if (watchFolder !== this.#cachedWatchFolder) {
      this.#cachedWatchFolder = watchFolder;
      this.#watchedSoundsCache = null;
      this.#scanPromise = null;
    }
    if (watchFolder && this.#watchedSoundsCache === null) {
      const pending = this.#scanPromise ??= scanSoundboardDirectory(watchFolder);
      const discovered = await pending;
      if (this.#cachedWatchFolder === watchFolder && this.#scanPromise === pending) {
        this.#watchedSoundsCache = discovered;
      }
    }
    const manualSounds = game.settings.get(MODULE_ID, "sounds") ?? [];
    return [...(watchFolder ? this.#watchedSoundsCache ?? [] : []), ...manualSounds];
  }

  async _prepareContext(options) {
    const activePlayers = game.users
      .filter(u => u.active && !u.isGM)
      .map(u => ({
        id: u.id,
        name: u.name,
        color: u.color?.css ?? "#ffffff",
        selected: this.#selectedRecipients.has(u.id)
      }));

    const allSounds = await this.#getMergedSounds();
    const categories = ["All", ...new Set(allSounds.map(s => s.category || "General"))];

    if (!categories.includes(this.#activeCategory)) {
      this.#activeCategory = "All";
    }

    const filteredSounds = allSounds.filter(s => {
      const cat = s.category || "General";
      const matchesCat = this.#activeCategory === "All" || cat === this.#activeCategory;
      const matchesSearch = !this.#searchQuery || s.name.toLowerCase().includes(this.#searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    });

    return {
      players: activePlayers,
      broadcastAll: this.#selectedRecipients.size === 0,
      includeGMInWhisper: this.#includeGMInWhisper,
      watchFolder: game.settings.get(MODULE_ID, "watchFolder") || "",
      categories: categories.map(c => ({ name: c, active: c === this.#activeCategory })),
      searchQuery: this.#searchQuery,
      sounds: filteredSounds
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const searchInput = this.element.querySelector(".mb-search-input");
    if (searchInput) {
      searchInput.oninput = (event) => {
        this.#searchQuery = event.target.value;
        this.render({ parts: ["grid"] });
      };
    }

    const pads = this.element.querySelectorAll(".mb-sound-pad");
    for (const pad of pads) {
      pad.oncontextmenu = async (event) => {
        event.preventDefault();
        const soundId = pad.dataset.soundId;
        const allSounds = await this.#getMergedSounds();
        const sound = allSounds.find(s => s.id === soundId);
        if (!sound) return;

        if (event.shiftKey) {
          if (sound.isWatched) {
            ui.notifications.warn("MB Soundboard: Watched folder pads are managed by your file system.");
            return;
          }
          const manualSounds = game.settings.get(MODULE_ID, "sounds") ?? [];
          const updated = manualSounds.filter(s => s.id !== soundId);
          await game.settings.set(MODULE_ID, "sounds", updated);
          this.render({ parts: ["header", "grid"] });
          ui.notifications.info(`MB Soundboard: Removed "${sound.name}".`);
          return;
        }

        const sourceToPlay = sound.isPool && sound.pool?.length ? sound.pool : sound.src;
        ui.notifications.info(`MB Soundboard: Previewing "${sound.name}" locally (GM only).`);
        await playCue(sourceToPlay, {
          volume: sound.volume ?? 0.8,
          localPreviewOnly: true
        });
      };
    }
  }

  static #onToggleRecipient(event, target) {
    const userId = target.dataset.userId;
    if (!userId) return;
    if (this.#selectedRecipients.has(userId)) {
      this.#selectedRecipients.delete(userId);
    } else {
      this.#selectedRecipients.add(userId);
    }
    this.render({ parts: ["header"] });
  }

  static #onClearRecipients() {
    this.#selectedRecipients.clear();
    this.render({ parts: ["header"] });
  }

  static #onToggleGMMonitor() {
    this.#includeGMInWhisper = !this.#includeGMInWhisper;
    this.render({ parts: ["header"] });
  }

  static #onSelectCategory(event, target) {
    this.#activeCategory = target.dataset.category || "All";
    this.render({ parts: ["header", "grid"] });
  }

  static async #onTriggerSound(event, target) {
    const soundId = target.dataset.soundId;
    const allSounds = await this.#getMergedSounds();
    const sound = allSounds.find(s => s.id === soundId);
    if (!sound) return;

    const recipients = Array.from(this.#selectedRecipients);
    if (recipients.length > 0 && this.#includeGMInWhisper && !recipients.includes(game.user.id)) {
      recipients.push(game.user.id);
    }

    const sourceToPlay = sound.isPool && sound.pool?.length ? sound.pool : sound.src;
    await playCue(sourceToPlay, {
      volume: sound.volume ?? 0.8,
      recipients
    });
  }

  static async #onAddSound() {
    new foundry.applications.apps.FilePicker({
      type: "audio",
      callback: async (path) => {
        const parts = path.split("/");
        const fileName = decodeURIComponent(parts.pop().replace(/\.[^/.]+$/, "")).replace(/[-_]/g, " ");
        const category = decodeURIComponent(parts.pop() || "General");
        const sounds = foundry.utils.deepClone(game.settings.get(MODULE_ID, "sounds") ?? []);
        sounds.push({
          id: foundry.utils.randomID(),
          name: fileName,
          src: path,
          category,
          volume: 0.8,
          isPool: false,
          isWatched: false,
          isWebUrl: false
        });
        await game.settings.set(MODULE_ID, "sounds", sounds);
        this.render({ parts: ["header", "grid"] });
      }
    }).render(true);
  }

  static #onAddWebUrl() {
    new AddUrlDialog({
      onSaved: () => this.render({ parts: ["header", "grid"] })
    }).render({ force: true });
  }

  static async #onSetWatchFolder() {
    const current = game.settings.get(MODULE_ID, "watchFolder") || "";
    new foundry.applications.apps.FilePicker({
      type: "folder",
      current,
      callback: async (folderPath) => {
        folderPath ||= "/";
        await game.settings.set(MODULE_ID, "watchFolder", folderPath);
        this.#watchedSoundsCache = null;
        this.#scanPromise = null;
        await this.#getMergedSounds();
        await this.render({ parts: ["header", "grid"] });
        ui.notifications.info(`MB Soundboard: Synced watch folder "${folderPath}" (${this.#watchedSoundsCache.length} pads).`);
      }
    }).render(true);
  }

  static async #onRescanWatchFolder() {
    const watchFolder = game.settings.get(MODULE_ID, "watchFolder") || "";
    if (!watchFolder) {
      return SoundboardApp.#onSetWatchFolder.call(this);
    }
    this.#watchedSoundsCache = null;
    this.#scanPromise = null;
    await this.#getMergedSounds();
    await this.render({ parts: ["header", "grid"] });
    ui.notifications.info(`MB Soundboard: Rescanned "${watchFolder}" (${this.#watchedSoundsCache.length} pads).`);
  }

  static #onStopAll() {
    broadcastStopAll();
  }
}
