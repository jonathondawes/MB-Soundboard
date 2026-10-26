# MB Soundboard & Hype Tracks (`mb-soundboard`)

A fast, zero-dependency **Foundry VTT (v13 / v14)** module combining the best features of **Soundboard by Blitz** and **Maestro** on Foundry's modern `ApplicationV2` architecture.

## Features
- **Player-Targeted Soundboard ("Whisper Audio"):** Click one or more player pills in the top Target Bar to send audio cues exclusively to those players (perfect for horror hallucinations, secret insights, or individual whispers), or leave on **All Players** to broadcast to the table.
- **Instant Local GM Preview:** **Right-click** any sound pad to preview the audio in your own headphones without broadcasting to players.
- **One-Click Folder Import & Category Tabs:** Point the Soundboard at any local folder of audio files to auto-populate pads and organize them by folder category.
- **Actor Combat Turn Hype Tracks:** Click the **Hype Track** bolt icon on any Actor Sheet header to play a custom theme or voice bark when their combat turn begins (Every Turn or Round 1 Boss Intro). Respects hidden combatants automatically.
- **Item / Attack Roll Audio Cues:** Assign a Hype Track to any Item, Weapon, or Spell sheet header so it triggers automatically when rolled to chat.
- **Wildcard Audio Support:** Use `*` in file paths (e.g., `assets/sfx/sword-slash-*.ogg`) to randomly pick a variation each time.

## Controls & Shortcuts
- **Toggle Soundboard:** `Shift + B` (or click the grid button under the **Sounds** layer on the left toolbar).
- **Left-Click Pad:** Play sound to selected recipients.
- **Right-Click Pad:** Preview locally (GM only).
- **GM Monitor: On/Off:** Include or exclude your GM client when playing to selected players. Defaults to On for this window. All Players broadcasts and right-click previews are unaffected.
- **Stop All:** Stop MB Soundboard cues on all connected clients, including received cues and cues still loading. Other Foundry audio is left playing.
- **Shift + Right-Click Pad:** Delete pad.


## Playback fixes
Zero volume remains silent. Selected-player audio only plays on the GM client when the GM is included, without a duplicate socket echo. After installing an update, reload **every connected client** so all players use the updated audio tracking.

The module marks its audio payloads and wraps `AudioHelper.play` to track those cues on Foundry's native receiving path. Unmarked audio delegates directly to the original helper. Audio still uses Foundry's server-side recipient filtering.

## Validation
The playback fixes were tested on Foundry **13.351 / PF2e 7.10.1**, including separate GM and player clients. Foundry 14 has not been tested live.

Run the automated routing, volume, stop, pending-load, and unrelated-audio checks with Node.js:

```sh
node --experimental-vm-modules --test tests/audio-engine.test.mjs
```
