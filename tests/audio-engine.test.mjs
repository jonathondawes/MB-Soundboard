import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../scripts/audio-engine.js', import.meta.url), 'utf8');

async function table() {
  const clients = [];
  async function client(id) {
    const sounds = [], pending = [], events = [];
    const context = vm.createContext({ console, Set, Promise, Math, Number });
    context.game = { user: { id }, socket: { emit(event, data, options) {
      events.push({event, data, options});
      for (const other of clients) {
        if (options?.recipients ? !options.recipients.includes(other.id) : other.id === id) continue;
        if (event === 'playAudio') other.context.foundry.audio.AudioHelper.play(structuredClone(data), false);
        if (event === 'module.mb-soundboard') other.engine.stopAllLocalCues();
      }
    }}};
    context.ui = {notifications:{info(){}, warn(){}}};
    context.foundry = {
      applications:{apps:{FilePicker:{browse:async()=>({files:['a.wav','b.wav']})}}},
      audio:{AudioHelper:{play(data) {
        if (data.autoplay === false) return;
        const sound = { playing:true, volume:data.volume, data, listeners:{},
          stop(){this.playing=false; this.listeners.stop?.();},
          addEventListener(event, fn){this.listeners[event]=fn;}
        };
        sounds.push(sound);
        return data.src === 'loading.wav' ? new Promise(resolve=>pending.push(()=>resolve(sound))) : Promise.resolve(sound);
      }}}
    };
    const engine = new vm.SourceTextModule(source, {context});
    await engine.link(()=>{});
    await engine.evaluate();
    const result = {id, context, engine:engine.namespace, sounds, pending, events};
    result.engine.registerAudioTracking();
    clients.push(result);
    return result;
  }
  return {gm:await client('gm'), player:await client('player'), outsider:await client('outsider')};
}
const tick = () => new Promise(resolve=>setImmediate(resolve));

test('zero, clamping and invalid volumes', async()=>{
  const {gm}=await table();
  for (const [volume, expected] of [[0,0],[-2,0],[5,1],[NaN,.8],[Infinity,.8],['0',0]]) {
    const sound=await gm.engine.playCue('a.wav',{volume,localPreviewOnly:true});
    assert.equal(sound.volume,expected);
  }
});
test('selected recipients, GM exclusion, no self echo, and preview isolation',async()=>{
  const {gm,player,outsider}=await table();
  assert.equal(await gm.engine.playCue('a.wav',{recipients:['player']}),null);
  await tick();
  assert.equal(gm.sounds.length,0);
  assert.equal(player.sounds.length,1);
  assert.equal(outsider.sounds.length,0);
  await gm.engine.playCue('a.wav',{recipients:['gm','player','gm']});
  await tick();
  assert.equal(gm.sounds.length,1);
  assert.equal(player.sounds.length,2);
  await gm.engine.playCue('a.wav',{localPreviewOnly:true,recipients:['player']});
  assert.equal(gm.sounds.length,2);
  assert.equal(player.sounds.length,2);
});
test('broadcast stop reaches receivers while unrelated audio keeps playing',async()=>{
  const {gm,player,outsider}=await table();
  const ordinary=await player.context.foundry.audio.AudioHelper.play({src:'a.wav',volume:.4},false);
  await gm.engine.playCue('a.wav');
  await tick();
  assert.equal(player.sounds.length,2);
  gm.engine.broadcastStopAll();
  assert.equal(gm.sounds[0].playing,false);
  assert.equal(player.sounds[1].playing,false);
  assert.equal(outsider.sounds[0].playing,false);
  assert.equal(ordinary.playing,true);
});
test('Stop All cancels cues still loading on sender and receiver',async()=>{
  const {gm,player,outsider}=await table();
  const loading=gm.engine.playCue('loading.wav');
  await tick();
  gm.engine.broadcastStopAll();
  gm.pending[0](); player.pending[0](); outsider.pending[0]();
  await loading; await tick();
  assert.equal(gm.sounds[0].playing,false);
  assert.equal(player.sounds[0].playing,false);
});
test('Stop All cancels pending wildcard resolution, not future cues',async()=>{
  const {gm}=await table();
  let finish;
  gm.context.foundry.applications.apps.FilePicker.browse=()=>new Promise(resolve=>finish=resolve);
  const loading=gm.engine.playCue('*.wav');
  gm.engine.stopAllLocalCues();
  finish({files:['a.wav']});
  assert.equal(await loading,null);
  assert.equal(gm.sounds.length,0);
  assert.equal((await gm.engine.playCue('a.wav',{localPreviewOnly:true})).playing,true);
});
test('tracking registration is idempotent and unrelated helper results pass through',async()=>{
  const {gm}=await table();
  const play=gm.context.foundry.audio.AudioHelper.play;
  gm.engine.registerAudioTracking();
  assert.equal(gm.context.foundry.audio.AudioHelper.play,play);
  const ordinary=await play({src:'a.wav',volume:.3},false);
  gm.engine.stopAllLocalCues();
  assert.equal(ordinary.playing,true);
});
