# MB Soundboard & Hype Tracks

A lightweight Foundry VTT soundboard with player-targeted audio, local previews, random sound pools, and actor/item hype tracks.

## Install
Download the module files into your Foundry user-data `Data/modules/mb-soundboard` folder, restart Foundry so it discovers the module, and enable **MB Soundboard & Hype Tracks** in your world's **Manage Modules** screen. Published release downloads, when available, use the manifest link in `module.json`.

After updating, reload every connected client so players receive the current audio tracker. Version **1.1.0** preserves existing saved pads and the earlier playback fixes.

## Open and play
Open **Ambient Sound Controls** on the left toolbar and click the grid button, or press **Shift+B** as GM.

- **All Players** broadcasts to the table. Select player pills to send cues only to those players.
- **GM Monitor: On/Off** includes or excludes this GM client from selected-player audio. It defaults to On for the window; broadcasts and local previews are unaffected.
- **Left-click a pad** to play it. **Right-click** to preview locally without sending audio to players.
- **Stop All** stops module cues on every connected client, including received cues and pending loads. Other Foundry audio keeps playing.
- **Shift+right-click** deletes a saved manual or web pad. Watched pads are managed by the files in the watch folder.

## Watch folders and random pools
Click **Watch Folder**, or set **Root Soundboard Watch Folder** in module settings. Choose a folder within Foundry's user-data browser.

```text
My Audio/
  welcome.ogg                 → General: welcome
  Combat/
    battle-theme.mp3          → Combat: battle theme
    Sword Hits/
      hit-1.wav               → Combat: Sword Hits (one random-pool pad)
      hit-2.wav
  Weather/
    rain.ogg                  → Weather: rain
```

Root files become **General** pads. First-level subfolders supply category tabs. Each second-level subfolder becomes one **random-pool pad**, marked with a dice icon and variation count. Only immediate audio files in that pool are included; deeper folders are ignored. Empty pools and non-audio files are skipped.

A pool chooses a single variation for each click or preview. All recipients receive that same chosen file. Supported formats are `.ogg`, `.mp3`, `.wav`, `.webm`, `.flac`, and `.m4a`, subject to each browser's audio decoding support.

Use **Rescan Watch Folder** after adding, moving, or removing files. This scans on demand; it does not monitor the operating system continuously. Changing or clearing the watch-folder setting updates the open board. Manual and web pads remain saved separately and survive rescans.

## Local files and web audio
**Add File** adds one local audio file as a saved pad.

**Add Web URL** opens a form for a custom pad name, category, volume, and direct **HTTPS** audio-file URL. The file stays on its original host; it is not uploaded to Foundry. Signed URLs with query parameters are supported. The host must allow browser audio access (CORS), and every recipient needs access to it. Ordinary web pages and video-sharing links are not audio files.

Use the form's preview button to test locally before saving. Invalid links leave the form open for correction. Volume ranges from **0 (silent) to 1**.

## Hype tracks and macros
Use **Hype Track** in an Actor or Item sheet header to assign an audio cue. Actors can trigger at every combat turn or only in round 1; hidden combatants send their cues only to GMs. Item cues follow supported item references in chat messages. System-specific item flag formats may vary.

The macro API is `game.modules.get("mb-soundboard").api`:

```js
const board = game.modules.get("mb-soundboard").api;
board.open();
await board.playCue("assets/audio/sting-*.ogg", { volume: 0.5 });
await board.playCue(["assets/audio/hit-1.wav", "assets/audio/hit-2.wav"], {
  volume: 0.5,
  localPreviewOnly: true
});
board.stopAll();
```

`playCue` accepts a local path, wildcard path, web URL, or array of paths. Optional `recipients` is an array of user IDs; omit it to broadcast. An excluded sender stays silent. `localPreviewOnly` always limits playback to the initiating client.

## Validation and compatibility
Foundry **13.351 / PF2e 7.10.1** was used for live testing. Foundry 14 has not been tested live; the manifest's verified version reflects the tested major version.

Run the regression suite with Node.js:

```sh
node --experimental-vm-modules --test tests/*.test.mjs
```

The tests cover recipient routing, volume, cue stopping, pending loads, preview isolation, scan depth, pools, cache refresh, saved-pad preservation, and URL validation/forms.

The module marks its audio payloads and wraps `AudioHelper.play` to track its cues on Foundry's native receiving path. Unmarked audio delegates to the original helper, and routing retains Foundry's server-side recipient filtering.
