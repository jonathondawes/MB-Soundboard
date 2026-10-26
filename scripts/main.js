import { MODULE_ID, registerAudioTracking, playCue, stopAllLocalCues, broadcastStopAll } from "./audio-engine.js";
import { registerHypeTrackerHooks } from "./hype-tracker.js";
import { SoundboardApp } from "./apps/SoundboardApp.js";
import { HypeConfigApp } from "./apps/HypeConfigApp.js";

let soundboardInstance = null;

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing MB Soundboard & Hype Tracks`);

  game.settings.register(MODULE_ID, "sounds", {
    name: "Soundboard Pads",
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  game.settings.register(MODULE_ID, "watchFolder", {
    name: "Root Soundboard Watch Folder",
    hint: "Point to a root audio folder. 1st-level subfolders become Category Tabs; 2nd-level sub-subfolders become randomized sound pool pads.",
    scope: "world",
    config: true,
    type: String,
    default: "",
    filePicker: "folder",
    onChange: () => {
      if (soundboardInstance?.rendered) soundboardInstance.render({ parts: ["header", "grid"] });
    }
  });

  game.keybindings.register(MODULE_ID, "openSoundboard", {
    name: "Toggle MB Soundboard",
    hint: "Opens or closes the MB Soundboard window.",
    editable: [{ key: "KeyB", modifiers: ["Shift"] }],
    restricted: true,
    onDown: () => {
      openSoundboard();
      return true;
    }
  });

  registerAudioTracking();
  registerHypeTrackerHooks();
});

Hooks.once("ready", () => {
  game.socket.on(`module.${MODULE_ID}`, (payload) => {
    if (payload?.action === "stopAll") {
      stopAllLocalCues();
    }
  });

  // Expose Public Macro API: game.modules.get("mb-soundboard").api
  const mod = game.modules.get(MODULE_ID);
  if (mod) {
    mod.api = {
      open: openSoundboard,
      playCue,
      stopAll: broadcastStopAll
    };
  }
});

function openSoundboard() {
  if (!game.user.isGM) return;
  if (!soundboardInstance) soundboardInstance = new SoundboardApp();
  if (soundboardInstance.rendered) {
    soundboardInstance.close();
  } else {
    soundboardInstance.render({ force: true });
  }
}

// Scene Controls Integration (v13 & v14 compatible)
Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user.isGM) return;

  const soundControl = Array.isArray(controls)
    ? controls.find(c => c.name === "sounds")
    : controls.sounds;

  if (!soundControl) return;

  const toolDef = {
    name: "mb-soundboard",
    title: "Open MB Soundboard (Shift+B)",
    icon: "fa-solid fa-table-cells",
    button: true,
    onClick: () => openSoundboard(),
    onChange: () => openSoundboard()
  };

  if (Array.isArray(soundControl.tools)) {
    soundControl.tools.push(toolDef);
  } else if (soundControl.tools && typeof soundControl.tools === "object") {
    soundControl.tools["mb-soundboard"] = toolDef;
  }
});

// ApplicationV2 Header Controls (Actors & Items)
Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
  if (!game.user.isGM) return;
  if (!(app.document instanceof Actor || app.document instanceof Item)) return;

  controls.push({
    icon: "fa-solid fa-bolt",
    label: "Hype Track",
    action: "configureMBHypeTrack",
    onClick: () => new HypeConfigApp({ document: app.document }).render({ force: true })
  });
});

// Fallback for Legacy V1 Actor & Item Sheets
Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
  if (!game.user.isGM) return;
  buttons.unshift({
    label: "Hype Track",
    class: "mb-hype-track-btn",
    icon: "fas fa-bolt",
    onclick: () => new HypeConfigApp({ document: sheet.actor }).render({ force: true })
  });
});

Hooks.on("getItemSheetHeaderButtons", (sheet, buttons) => {
  if (!game.user.isGM) return;
  buttons.unshift({
    label: "Hype Track",
    class: "mb-hype-track-btn",
    icon: "fas fa-bolt",
    onclick: () => new HypeConfigApp({ document: sheet.item }).render({ force: true })
  });
});
