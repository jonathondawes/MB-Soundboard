import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

async function environment(tree={}) {
  const values={sounds:[],watchFolder:''}, browses=[], sends=[], plays=[], notices=[];
  class App {
    renders=0; closed=false;
    constructor(options={}){this.options=options;}
    render(){this.renders++;return Promise.resolve(this);}
    close(){this.closed=true;return Promise.resolve(this);}
    _onRender(){}
  }
  const context=vm.createContext({URL, console:{warn(){},error(){}},Math:Object.create(Math)});
  context.ui={notifications:Object.fromEntries(['warn','info','error'].map(level=>[level,message=>notices.push({level,message})]))};
  context.game={user:{id:'gm',isGM:true},users:[{id:'p1',name:'Player',active:true,isGM:false}],settings:{get:(_,key)=>values[key],set:async(_,key,value)=>values[key]=value},socket:{emit:(...args)=>sends.push(args)}};
  context.foundry={utils:{deepClone:structuredClone,randomID:()=>String(values.sounds.length+1),expandObject:x=>x},applications:{api:{ApplicationV2:App,HandlebarsApplicationMixin:x=>x},apps:{FilePicker:{browse:async(source,path)=>{
    browses.push({source,path});
    if(tree[path] instanceof Error)throw tree[path];
    if(!tree[path])throw new Error('Missing folder '+path);
    return structuredClone(tree[path]);
  }}}},audio:{AudioHelper:{play:async data=>{
    plays.push(data);
    return {playing:true,volume:data.volume,stop(){this.playing=false;},addEventListener(){}};
  }}}};
  const modules=new Map();
  async function load(path){
    if(modules.has(path))return modules.get(path);
    const module=new vm.SourceTextModule(await readFile(new URL(path,import.meta.url),'utf8'),{context,identifier:path});
    modules.set(path,module);
    await module.link((specifier,parent)=>load(new URL(specifier,'file://'+parent.identifier).pathname));
    return module;
  }
  // Absolute identifiers let nested imports resolve like browser ES modules.
  const root=new URL('../scripts/',import.meta.url).pathname;
  async function namespace(path){const module=await load(root+path);await module.evaluate();return module.namespace;}
  return {values,browses,sends,plays,notices,context,namespace};
}
const hierarchy={
 '/audio':{files:['/audio/start.MP3','/audio/readme.txt'],dirs:['/audio/Rain.Indoor','/audio/Combat']},
 '/audio/Rain.Indoor':{files:['/audio/Rain.Indoor/100% rain.wav'],dirs:[]},
 '/audio/Combat':{files:['/audio/Combat/battle-theme.ogg'],dirs:['/audio/Combat/Empty','/audio/Combat/Sword_hits']},
 '/audio/Combat/Empty':{files:['readme.txt'],dirs:[]},
 '/audio/Combat/Sword_hits':{files:['/audio/Combat/Sword_hits/hit-2.wav','/audio/Combat/Sword_hits/hit-1.FLAC','/audio/Combat/Sword_hits/hit-2.wav','ignore.png'],dirs:['/audio/Combat/Sword_hits/Deeper']}
};

test('two-level scanner builds loose pads, categories and one deduplicated pool',async()=>{
 const env=await environment(hierarchy), {scanSoundboardDirectory:scan}=await env.namespace('directory-scanner.js');
 const pads=await scan('/audio');
 assert.equal(pads.length,4);
 assert.equal(pads.find(p=>p.category==='General').name,'start');
 assert.equal(pads.find(p=>p.category==='Rain.Indoor').name,'100% rain');
 const pool=pads.find(p=>p.isPool);
 assert.equal(pool.name,'Sword hits');assert.equal(pool.poolCount,2);
 assert.equal(pool.category,'Combat');assert.equal(pool.isWatched,true);
 assert.equal(env.browses.some(b=>b.path.endsWith('/Deeper')),false);
 const repeat=await scan('/audio');assert.deepEqual(Array.from(repeat,p=>p.id),Array.from(pads,p=>p.id));
});
test('scanner isolates inaccessible children, handles root failures, and forwards source',async()=>{
 const tree={'root':{files:['ok.wav'],dirs:['broken','fine']},broken:new Error('Denied'),fine:{files:['fine.ogg'],dirs:[]}};
 const env=await environment(tree),{scanSoundboardDirectory:scan}=await env.namespace('directory-scanner.js');
 assert.equal((await scan('root','s3')).length,2);
 assert.equal(env.browses.every(b=>b.source==='s3'),true);
 assert.equal((await scan('missing')).length,0);
 assert.equal(env.notices.some(n=>n.level==='error'),true);
 const count=env.browses.length;assert.equal((await scan(' ')).length,0);assert.equal(env.browses.length,count);
});
test('HTTPS validation accepts all supported extensions and signed URLs, rejects non-audio pages and other protocols',async()=>{
 const env=await environment(),{parseWebAudioUrl:parse}=await env.namespace('audio-sources.js');
 for(const ext of ['ogg','mp3','wav','webm','flac','m4a'])assert.ok(parse(`https://cdn.example/sound.${ext}?token=a*b#test`));
 assert.ok(parse('https://cdn.example/sound.MP3'));
 for(const src of ['http://cdn.example/a.wav','javascript:alert(1)','https://youtube.com/watch?v=x','https://cdn.example/?file=a.wav','invalid','https://user:password@cdn.example/a.wav'])assert.equal(parse(src),null);
});
test('pool resolution picks once before broadcast; URL * never invokes FilePicker',async()=>{
 const env=await environment(),engine=await env.namespace('audio-engine.js');
 env.context.Math.random=()=>.99;
 await engine.playCue(['a.wav','b.wav'],{volume:0});
 assert.equal(env.plays[0].src,'b.wav');assert.equal(env.sends[0][1].src,'b.wav');assert.equal(env.plays[0].volume,0);
 assert.equal(await engine.resolveAudioSrc([]),null);
 assert.equal(await engine.resolveAudioSrc([null,'',5]),null);
 const url='https://cdn.example/a.ogg?sig=*';assert.equal(await engine.resolveAudioSrc(url),url);assert.equal(env.browses.length,0);
 assert.equal(await engine.resolveAudioSrc(42),null);
});
test('watch cache refreshes on rescan, folder change and clear without changing manual pads',async()=>{
 const env=await environment(hierarchy),{SoundboardApp}=await env.namespace('apps/SoundboardApp.js');
 env.values.sounds=[{id:'saved',name:'Saved',category:'Manual',src:'saved.wav'}];env.values.watchFolder='/audio';
 const app=new SoundboardApp();assert.equal((await app._prepareContext()).sounds.length,5);
 const count=env.browses.length;await app._prepareContext();assert.equal(env.browses.length,count);
 hierarchy['/audio'].files.push('/audio/new.wav');
 await SoundboardApp.DEFAULT_OPTIONS.actions.rescanWatchFolder.call(app);assert.equal((await app._prepareContext()).sounds.length,6);
 hierarchy['/audio'].files.pop();
 env.values.watchFolder='/audio/Rain.Indoor';assert.equal((await app._prepareContext()).sounds.length,2);
 env.values.watchFolder='';assert.equal((await app._prepareContext()).sounds.length,1);assert.equal(env.values.sounds[0].id,'saved');
});
test('watched-pad deletion is blocked; manual deletion and repeated search renders work',async()=>{
 const env=await environment(hierarchy),{SoundboardApp}=await env.namespace('apps/SoundboardApp.js');
 env.values.watchFolder='/audio';env.values.sounds=[{id:'manual',name:'Manual',src:'manual.wav'}];
 const app=new SoundboardApp(),search={},pad={dataset:{soundId:'watch:/audio/start.MP3'}};
 app.element={querySelector:()=>search,querySelectorAll:()=>[pad]};
 app._onRender({},{});app._onRender({},{});
 await pad.oncontextmenu({preventDefault(){},shiftKey:true});assert.equal(env.values.sounds.length,1);
 pad.dataset.soundId='manual';await pad.oncontextmenu({preventDefault(){},shiftKey:true});assert.equal(env.values.sounds.length,0);
 const before=app.renders;search.oninput({target:{value:'Sword'}});assert.equal(app.renders,before+1);
 assert.equal((await app._prepareContext()).sounds[0].isPool,true);
});
test('URL form retains invalid entries and saves a muted manual pad only after validation',async()=>{
 const env=await environment(),{AddUrlDialog}=await env.namespace('apps/AddUrlDialog.js');
 let callbacks=0;const app=new AddUrlDialog({onSaved:()=>callbacks++});const submit=AddUrlDialog.DEFAULT_OPTIONS.form.handler;
 await submit.call(app,null,null,{object:{name:'Test',src:'http://example.com/a.wav'}});
 assert.equal(app.closed,false);assert.equal(env.values.sounds.length,0);
 await submit.call(app,null,null,{object:{name:'  Web Cue ',src:'https://example.com/a.wav?sig=abc',volume:0,category:' '}});
 assert.equal(app.closed,true);assert.equal(callbacks,1);assert.equal(env.values.sounds[0].volume,0);
 assert.equal(env.values.sounds[0].category,'Web Streams');assert.equal(env.values.sounds[0].isWebUrl,true);
});
test('URL preview is local and invalid preview never starts audio',async()=>{
 const env=await environment(),{AddUrlDialog}=await env.namespace('apps/AddUrlDialog.js');
 const app=new AddUrlDialog();let src='http://example.com/a.wav';app.element={querySelector:selector=>({value:selector.includes("'src'")?src:'0'})};
 const preview=AddUrlDialog.DEFAULT_OPTIONS.actions.previewUrl;
 await preview.call(app);assert.equal(env.plays.length,0);
 src='https://example.com/a.wav';await preview.call(app);assert.equal(env.plays[0].src,src);assert.equal(env.plays[0].volume,0);assert.equal(env.sends.length,0);
});
