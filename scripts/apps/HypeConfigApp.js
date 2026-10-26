import { MODULE_ID, playCue } from "../audio-engine.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class HypeConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.document = options.document;
  }

  static DEFAULT_OPTIONS = {
    id: "mb-hype-config",
    tag: "form",
    classes: ["mb-soundboard-hype-config"],
    window: {
      title: "Configure Hype Track",
      icon: "fa-solid fa-bolt",
      resizable: false
    },
    position: { width: 440, height: "auto" },
    form: {
      handler: HypeConfigApp.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true
    },
    actions: {
      browseAudio: HypeConfigApp.#onBrowseAudio,
      previewHype: HypeConfigApp.#onPreviewHype
    }
  };

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/hype-config.hbs` }
  };

  async _prepareContext() {
    const hype = this.document.getFlag(MODULE_ID, "hype") ?? {
      enabled: false,
      turnStartSrc: "",
      turnStartVolume: 0.8,
      playMode: "everyTurn",
      channel: "interface"
    };

    return {
      docName: this.document.name,
      isActor: this.document instanceof Actor,
      hype
    };
  }

  static #onBrowseAudio() {
    const input = this.element.querySelector("input[name='turnStartSrc']");
    new foundry.applications.apps.FilePicker({
      type: "audio",
      current: input?.value || "",
      callback: (path) => {
        if (input) input.value = path;
      }
    }).render(true);
  }

  static async #onPreviewHype() {
    const src = this.element.querySelector("input[name='turnStartSrc']")?.value;
    const volume = Number(this.element.querySelector("input[name='turnStartVolume']")?.value ?? 0.8);
    if (!src) {
      ui.notifications.warn("MB Soundboard: Select an audio path first.");
      return;
    }
    await playCue(src, { volume, localPreviewOnly: true });
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    await this.document.setFlag(MODULE_ID, "hype", {
      enabled: Boolean(data.enabled),
      turnStartSrc: data.turnStartSrc?.trim() ?? "",
      turnStartVolume: Number(data.turnStartVolume ?? 0.8),
      playMode: data.playMode ?? "everyTurn",
      channel: data.channel ?? "interface"
    });
    ui.notifications.info(`MB Soundboard: Saved Hype Track for ${this.document.name}.`);
  }
}
