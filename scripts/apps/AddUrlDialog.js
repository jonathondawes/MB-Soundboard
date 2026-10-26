import { MODULE_ID, playCue } from "../audio-engine.js";
import { parseWebAudioUrl } from "../audio-sources.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const volumeOf = value => Math.min(Math.max(Number.isFinite(Number(value)) ? Number(value) : 0.8, 0), 1);

export class AddUrlDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.onSaved = options.onSaved;
  }

  static DEFAULT_OPTIONS = {
    id: "mb-add-url-dialog",
    tag: "form",
    classes: ["mb-soundboard-url-dialog"],
    window: { title: "Add Web Audio URL Pad", icon: "fa-solid fa-link", resizable: false },
    position: { width: 440, height: "auto" },
    form: { handler: AddUrlDialog.#onSubmit, submitOnChange: false, closeOnSubmit: false },
    actions: { previewUrl: AddUrlDialog.#onPreviewUrl }
  };

  static PARTS = { form: { template: `modules/${MODULE_ID}/templates/add-url-dialog.hbs` } };

  async _prepareContext() {
    return { defaultCategory: "Web Streams", defaultVolume: 0.8 };
  }

  static async #onPreviewUrl() {
    const src = parseWebAudioUrl(this.element.querySelector("input[name='src']")?.value ?? "");
    if (!src) {
      ui.notifications.warn("MB Soundboard: Enter a direct HTTPS audio file URL (.ogg, .mp3, .wav, .webm, .flac, or .m4a).");
      return;
    }
    const volume = volumeOf(this.element.querySelector("input[name='volume']")?.value ?? 0.8);
    try {
      await playCue(src, { volume, localPreviewOnly: true });
      ui.notifications.info("MB Soundboard: Playing Web URL locally.");
    } catch (error) {
      console.warn(`${MODULE_ID} | Web audio preview failed`, error);
      ui.notifications.warn("MB Soundboard: Could not play this URL. Check that it is a direct audio file and its host allows browser audio access.");
    }
  }

  static async #onSubmit(event, form, formData) {
    if (!game.user.isGM) return;
    const data = foundry.utils.expandObject(formData.object);
    const src = parseWebAudioUrl(data.src ?? "");
    const name = data.name?.trim();
    if (!src || !name) {
      ui.notifications.warn("MB Soundboard: Enter a Pad Name and a direct HTTPS audio file URL.");
      return; // Keep the form and its entries open for correction.
    }
    const sounds = foundry.utils.deepClone(game.settings.get(MODULE_ID, "sounds") ?? []);
    sounds.push({
      id: foundry.utils.randomID(), name, src,
      category: data.category?.trim() || "Web Streams", volume: volumeOf(data.volume ?? 0.8),
      isPool: false, isWatched: false, isWebUrl: true
    });
    try {
      await game.settings.set(MODULE_ID, "sounds", sounds);
    } catch (error) {
      console.error(`${MODULE_ID} | Could not save Web URL pad`, error);
      ui.notifications.error("MB Soundboard: Could not save the pad. Your entries are still available to retry.");
      return;
    }
    ui.notifications.info(`MB Soundboard: Added Web URL pad "${name}".`);
    await this.close();
    if (typeof this.onSaved === "function") this.onSaved();
  }
}
