import { MODULE_ID, playCue } from "./audio-engine.js";

export function registerHypeTrackerHooks() {
  // 1. Combat Turn Start Hype Track
  Hooks.on("updateCombat", async (combat, changed, options, userId) => {
    if (!game.users.activeGM?.isSelf) return;
    if (!combat.started || (!("turn" in changed) && !("round" in changed))) return;
    if (options.direction === -1) return;

    const combatant = combat.combatant;
    const actor = combatant?.actor;
    if (!actor) return;

    const hype = actor.getFlag(MODULE_ID, "hype");
    if (!hype?.enabled || !hype?.turnStartSrc) return;

    if (hype.playMode === "firstTurnOnly" && combat.round > 1) return;

    // Respect hidden combatants so unseen monsters don't spoil their presence via audio
    const recipients = combatant.hidden
      ? game.users.filter(u => u.isGM).map(u => u.id)
      : [];

    await playCue(hype.turnStartSrc, {
      volume: hype.turnStartVolume ?? 0.8,
      channel: hype.channel ?? "interface",
      recipients
    });
  });

  // 2. Item / Spell / Attack Chat Roll Hype Track (System-Agnostic)
  Hooks.on("createChatMessage", async (message, options, userId) => {
    if (!game.users.activeGM?.isSelf) return;

    // Locate associated item from modern Foundry chat message flags or system speaker data
    const itemUuid = message.getFlag("core", "itemId")
      || message.flags?.pf2e?.origin?.uuid
      || message.flags?.dnd5e?.use?.itemUuid;

    let item = null;
    if (itemUuid && typeof fromUuidSync === "function") {
      try {
        item = await fromUuid(itemUuid);
      } catch (e) {
        item = null;
      }
    }

    if (!item && message.speaker?.actor) {
      const actor = game.actors.get(message.speaker.actor);
      const itemId = message.flags?.coc7?.itemId || message.getFlag("core", "itemId");
      if (actor && itemId) item = actor.items.get(itemId);
    }

    if (!item || !(item instanceof Item)) return;

    const hype = item.getFlag(MODULE_ID, "hype");
    if (!hype?.enabled || !hype?.turnStartSrc) return;

    // Respect whisper recipients if the roll was whispered or blind
    const recipients = Array.isArray(message.whisper) && message.whisper.length > 0
      ? message.whisper
      : [];

    await playCue(hype.turnStartSrc, {
      volume: hype.turnStartVolume ?? 0.8,
      channel: hype.channel ?? "interface",
      recipients
    });
  });
}
