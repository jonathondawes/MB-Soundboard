import { MODULE_ID, playCue, broadcastStopAll } from "../audio-engine.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SoundboardApp extends HandlebarsApplicationMixin(ApplicationV2) {
  #selectedRecipients = new Set();
  #includeGMInWhisper = true;
  #activeCategory = "All";
  #searchQuery = "";

  static DEFAULT_OPTIONS = {
    id: "mb-soundboard-app",
    tag: "div",
    classes: ["mb-soundboard"],
    window: {
      title: "MB Soundboard",
      icon: "fa-solid fa-table-cells",
      resizable: true
    },
    position: { width: 700, height: 540 },
    actions: {
      toggleRecipient: SoundboardApp.#onToggleRecipient,
      clearRecipients: SoundboardApp.#onClearRecipients,
      toggleGMMonitor: SoundboardApp.#onToggleGMMonitor,
      selectCategory: SoundboardApp.#onSelectCategory,
      triggerSound: SoundboardApp.#onTriggerSound,
      addSound: SoundboardApp.#onAddSound,
      importFolder: SoundboardApp.#onImportFolder,
      stopAll: SoundboardApp.#onStopAll
    }
  };

  static PARTS = {
    header: { template: `modules/${MODULE_ID}/templates/target-bar.hbs` },
    grid: { template: `modules/${MODULE_ID}/templates/sound-grid.hbs`, scrollable: [""] }
  };

  async _prepareContext(options) {
    const activePlayers = game.users
      .filter(u => u.active && !u.isGM)
      .map(u => ({
        id: u.id,
        name: u.name,
        color: u.color?.css ?? "#ffffff",
        selected: this.#selectedRecipients.has(u.id)
      }));

    const allSounds = game.settings.get(MODULE_ID, "sounds") ?? [];
    const categories = ["All", ...new Set(allSounds.map(s => s.category || "General"))];

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
      categories: categories.map(c => ({ name: c, active: c === this.#activeCategory })),
      searchQuery: this.#searchQuery,
      sounds: filteredSounds
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    // Search input filtering
    const searchInput = this.element.querySelector(".mb-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (event) => {
        this.#searchQuery = event.target.value;
        this.render({ parts: ["grid"] });
      });
    }

    // Right-click pad to preview locally; Shift+Right-click to delete pad
    const pads = this.element.querySelectorAll(".mb-sound-pad");
    for (const pad of pads) {
      pad.addEventListener("contextmenu", async (event) => {
        event.preventDefault();
        const soundId = pad.dataset.soundId;
        const sounds = game.settings.get(MODULE_ID, "sounds") ?? [];
        const sound = sounds.find(s => s.id === soundId);
        if (!sound) return;

        if (event.shiftKey) {
          const updated = sounds.filter(s => s.id !== soundId);
          await game.settings.set(MODULE_ID, "sounds", updated);
          this.render({ parts: ["header", "grid"] });
          ui.notifications.info(`MB Soundboard: Removed "${sound.name}".`);
          return;
        }

        ui.notifications.info(`MB Soundboard: Previewing "${sound.name}" locally (GM only).`);
        await playCue(sound.src, {
          volume: sound.volume ?? 0.8,
          localPreviewOnly: true
        });
      });
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
    const sounds = game.settings.get(MODULE_ID, "sounds") ?? [];
    const sound = sounds.find(s => s.id === soundId);
    if (!sound) return;

    const recipients = Array.from(this.#selectedRecipients);
    if (recipients.length > 0 && this.#includeGMInWhisper && !recipients.includes(game.user.id)) {
      recipients.push(game.user.id);
    }

    await playCue(sound.src, {
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
          volume: 0.8
        });
        await game.settings.set(MODULE_ID, "sounds", sounds);
        this.render({ parts: ["header", "grid"] });
      }
    }).render(true);
  }

  static async #onImportFolder() {
    new foundry.applications.apps.FilePicker({
      type: "folder",
      callback: async (folderPath) => {
        const result = await foundry.applications.apps.FilePicker.browse("data", folderPath);
        const audioExtensions = [".ogg", ".mp3", ".wav", ".webm", ".flac", ".m4a"];
        const audioFiles = (result.files ?? []).filter(f =>
          audioExtensions.some(ext => f.toLowerCase().endsWith(ext))
        );

        if (audioFiles.length === 0) {
          ui.notifications.warn("MB Soundboard: No audio files found in that folder.");
          return;
        }

        const folderName = decodeURIComponent(folderPath.split("/").filter(Boolean).pop() || "Imported");
        const sounds = foundry.utils.deepClone(game.settings.get(MODULE_ID, "sounds") ?? []);

        for (const file of audioFiles) {
          const name = decodeURIComponent(file.split("/").pop().replace(/\.[^/.]+$/, "")).replace(/[-_]/g, " ");
          sounds.push({
            id: foundry.utils.randomID(),
            name,
            src: file,
            category: folderName,
            volume: 0.8
          });
        }

        await game.settings.set(MODULE_ID, "sounds", sounds);
        this.render({ parts: ["header", "grid"] });
        ui.notifications.info(`MB Soundboard: Imported ${audioFiles.length} sounds into "${folderName}".`);
      }
    }).render(true);
  }

  static #onStopAll() {
    broadcastStopAll();
  }
}
