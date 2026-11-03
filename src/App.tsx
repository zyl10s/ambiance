import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Plus, Save, Trash2, Volume2, VolumeX, Settings2, Music2 } from 'lucide-react';
import { isTauri } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { mkdir, readDir, readFile, writeFile } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';

type Theme = 'dark-academia' | 'light-academia' | 'romantic-academia' | 'modern' | 'gothic' | 'cyberpunk';
type Sound = { id: string; name: string; file: string; volume: number; muted: boolean; active: boolean };
type Preset = { id: string; name: string; mix: Pick<Sound,'id'|'volume'|'muted'|'active'>[] };
type Settings = { theme: Theme; autoplay: 'off'|'last'|'preset'; launchPreset: string; startHidden: boolean };
const themes: { id: Theme; label: string }[] = [
  {id:'dark-academia',label:'Dark Academia'}, {id:'light-academia',label:'Light Academia'}, {id:'romantic-academia',label:'Romantic Academia'},
  {id:'modern',label:'Modern'}, {id:'gothic',label:'Gothic'}, {id:'cyberpunk',label:'Cyberpunk'}
];
const defaultSettings: Settings = {theme:'dark-academia',autoplay:'off',launchPreset:'',startHidden:false};
const stored = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || '') as T; } catch { return fallback; } };
const persist = (key:string,value:unknown) => localStorage.setItem(key,JSON.stringify(value));
const uid = () => crypto.randomUUID();
const safeFilename = (name:string) => name.replace(/[^a-zA-Z0-9._-]/g,'_');

export default function App() {
  const [settings,setSettings] = useState<Settings>(()=>stored('ambiance.settings',defaultSettings));
  const [sounds,setSounds] = useState<Sound[]>(()=>stored('ambiance.sounds',[]));
  const [presets,setPresets] = useState<Preset[]>(()=>stored('ambiance.presets',[]));
  const [playing,setPlaying] = useState(false);
  const [showSettings,setShowSettings] = useState(false);
  const [notice,setNotice] = useState('');
  const audio = useRef<Map<string,HTMLAudioElement>>(new Map());
  const urls = useRef<Map<string,string>>(new Map());
  const soundsRef = useRef(sounds); soundsRef.current=sounds;
  const playingRef = useRef(playing); playingRef.current=playing;
  const initialized = useRef(false);
  const [ready,setReady] = useState(false);

  useEffect(()=>{persist('ambiance.settings',settings);document.documentElement.dataset.theme=settings.theme},[settings]);
  useEffect(()=>persist('ambiance.sounds',sounds),[sounds]);
  useEffect(()=>persist('ambiance.presets',presets),[presets]);

  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      if(isTauri()){
        const dir=await join(await appDataDir(),'sounds');
        await mkdir(dir,{recursive:true});
        const files=await readDir(dir);
        for(const file of files){
          if(!file.name)continue;
          const bytes=await readFile(await join(dir,file.name));
          const url=URL.createObjectURL(new Blob([bytes]));
          if(cancelled){URL.revokeObjectURL(url);continue;}
          urls.current.set(file.name,url);
        }
      }
      if(!cancelled)setReady(true);
    })().catch(e=>{setNotice('Could not load saved audio: '+String(e));setReady(true)});
    return()=>{cancelled=true;};
  },[]);

  useEffect(()=>{
    if(!ready||initialized.current)return;
    initialized.current=true;
    if(settings.autoplay==='last')setPlaying(true);
    if(settings.autoplay==='preset'){
      const preset=presets.find(p=>p.id===settings.launchPreset);
      if(preset){applyPreset(preset);setPlaying(true);}
    }
  },[ready]);

  useEffect(()=>{
    if(!ready)return;
    const keep=new Set(sounds.map(s=>s.id));
    for(const [id,element] of audio.current){
      if(!keep.has(id)){element.pause();element.src='';audio.current.delete(id);}
    }
    for(const s of sounds){
      let element=audio.current.get(s.id);
      const src=urls.current.get(s.file);
      if(!src)continue;
      if(!element){element=new Audio(src);element.loop=true;audio.current.set(s.id,element);}
      element.volume=s.muted?0:s.volume/100;
      if(playing&&s.active){if(element.paused)void element.play().catch(()=>setNotice('Playback was blocked. Press play again.'));}
      else element.pause();
    }
  },[sounds,playing,ready]);

  useEffect(()=>()=>{for(const a of audio.current.values())a.pause();for(const u of urls.current.values())URL.revokeObjectURL(u);},[]);
  const updateSound=(id:string,patch:Partial<Sound>)=>setSounds(old=>old.map(s=>s.id===id?{...s,...patch}:s));
  const applyPreset=(preset:Preset)=>setSounds(old=>old.map(s=>({...s,...preset.mix.find(m=>m.id===s.id),active:!!preset.mix.find(m=>m.id===s.id)?.active})));
  const savePreset=()=>{
    const name=prompt('Name your preset');
    if(!name?.trim())return;
    setPresets(old=>[...old,{id:uid(),name:name.trim(),mix:sounds.map(({id,volume,muted,active})=>({id,volume,muted,active}))}]);
    setNotice('Preset saved.');
  };
  const importFiles=async()=>{
    try{
      if(isTauri()){
        const selected=await open({multiple:true,filters:[{name:'Audio',extensions:['mp3','wav','ogg','flac','m4a','webm']}]});
        if(!selected)return;
        const paths=Array.isArray(selected)?selected:[selected];
        const dir=await join(await appDataDir(),'sounds');
        await mkdir(dir,{recursive:true});
        const added:Sound[]=[];
        for(const path of paths){
          const bytes=await readFile(path);
          const name=path.split(/[\\/]/).pop()||'Audio';
          const file=uid()+'-'+safeFilename(name);
          await writeFile(await join(dir,file),bytes);
          urls.current.set(file,URL.createObjectURL(new Blob([bytes])));
          added.push({id:uid(),name:name.replace(/\.[^.]+$/,''),file,volume:60,muted:false,active:true});
        }
        setSounds(old=>[...old,...added]);
      } else {
        const picker=document.createElement('input');picker.type='file';picker.multiple=true;picker.accept='audio/*';
        picker.onchange=()=>{
          const files=Array.from(picker.files||[]);
          const added=files.map(file=>{
            const key=uid()+'-'+file.name;urls.current.set(key,URL.createObjectURL(file));
            return {id:uid(),name:file.name.replace(/\.[^.]+$/,''),file:key,volume:60,muted:false,active:true};
          });
          setSounds(old=>[...old,...added]);
          setNotice('Browser imports are temporary. Use the desktop app for persistent audio.');
        };
        picker.click();
      }
    }catch(e){setNotice('Import failed: '+String(e));}
  };
  return <div className="player">
    <header className="player-header">
      <strong>Ambiance</strong>
      <div className="player-tools">
        <button className="icon-button" title="Import audio" aria-label="Import audio" onClick={importFiles}><Plus size={19}/></button>
        <button className="icon-button" title="Settings" aria-label="Settings" onClick={()=>setShowSettings(!showSettings)}><Settings2 size={19}/></button>
      </div>
    </header>
    {showSettings&&<section className="player-settings">
      <label>Theme <select value={settings.theme} onChange={e=>setSettings({...settings,theme:e.target.value as Theme})}>{themes.map(t=><option value={t.id} key={t.id}>{t.label}</option>)}</select></label>
      <label>On launch <select value={settings.autoplay} onChange={e=>setSettings({...settings,autoplay:e.target.value as Settings['autoplay']})}><option value="off">Do not play</option><option value="last">Last sounds</option><option value="preset">Preset</option></select></label>
      {settings.autoplay==='preset'&&<label>Preset <select value={settings.launchPreset} onChange={e=>setSettings({...settings,launchPreset:e.target.value})}><option value="">Select preset</option>{presets.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>}
      <label><span>Start in tray</span><input type="checkbox" checked={settings.startHidden} onChange={e=>setSettings({...settings,startHidden:e.target.checked})}/></label>
    </section>}
    <main className="player-main">
      {sounds.length===0?<div className="player-empty"><Music2 size={32}/><span>No sounds added</span><button className="outline" onClick={importFiles}><Plus size={16}/> Add sounds</button></div>:
      <div className="player-grid">{sounds.map(s=><div className={'player-sound '+(s.active?'is-active':'')} key={s.id}>
        <button className="sound-switch" onClick={()=>updateSound(s.id,{active:!s.active})} aria-pressed={s.active} title={s.active?'Disable '+s.name:'Enable '+s.name}><Volume2 size={24}/></button>
        <div className="sound-name" title={s.name}>{s.name}</div>
        <div className="sound-volume"><input aria-label={s.name+' volume'} type="range" min="0" max="100" value={s.volume} onChange={e=>updateSound(s.id,{volume:Number(e.target.value)})}/><button className="icon-button" title={s.muted?'Unmute':'Mute'} onClick={()=>updateSound(s.id,{muted:!s.muted})}>{s.muted?<VolumeX size={15}/>:<Volume2 size={15}/>}</button></div>
        <button className="sound-delete" title={'Remove '+s.name} aria-label={'Remove '+s.name} onClick={()=>setSounds(old=>old.filter(x=>x.id!==s.id))}><Trash2 size={13}/></button>
      </div>)}</div>}
    </main>
    <footer className="player-footer">
      <div className="preset-controls"><select aria-label="Presets" defaultValue="" onChange={e=>{const p=presets.find(p=>p.id===e.target.value);if(p)applyPreset(p);}}><option value="">Presets</option>{presets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="icon-button" title="Save preset" onClick={savePreset}><Save size={17}/></button>{presets.length>0&&<button className="icon-button" title="Delete selected preset" onClick={()=>{const select=document.querySelector<HTMLSelectElement>('.preset-controls select');if(select?.value)setPresets(old=>old.filter(p=>p.id!==select.value));if(select)select.value='';}}><Trash2 size={15}/></button>}</div>
      <button className="player-play" onClick={()=>setPlaying(!playing)} title={playing?'Pause all':'Play all'} aria-label={playing?'Pause all':'Play all'}>{playing?<Pause size={21} fill="currentColor"/>:<Play size={21} fill="currentColor"/>}</button>
    </footer>
    {notice&&<div className="toast" role="status" onClick={()=>setNotice('')}>{notice} ×</div>}
  </div>;
}
