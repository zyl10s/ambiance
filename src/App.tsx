import FocusTimer from './FocusTimer';
import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Plus, Save, Trash2, Volume2, VolumeX, Settings2, Music2, Upload, Moon, PanelTopClose } from 'lucide-react';
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
  const active=sounds.filter(s=>s.active).length;
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><Moon size={23}/></div><div><strong>ambiance</strong><small>YOUR SPACE, YOUR SOUND</small></div></div>
      <div className="side-label">YOUR LIBRARY</div>
      <div className="nav selected"><Music2 size={18}/> Soundscape <span>{sounds.length}</span></div>
      <div className="side-label spaced">PRESETS <button title="Save current mix" onClick={savePreset}><Plus size={16}/></button></div>
      <div className="preset-list">{presets.map(p=><div className="preset" key={p.id}><button onClick={()=>applyPreset(p)} title="Load preset">{p.name}</button><button title="Delete preset" onClick={()=>setPresets(old=>old.filter(x=>x.id!==p.id))}><Trash2 size={14}/></button></div>)}</div>
      <div className="sidebar-foot">A LITTLE PEACE, ON DEMAND</div>
    </aside>
    <main className="main">
      <header className="top"><div><span className="eyebrow">YOUR STUDY SANCTUARY</span><h1>Make space to focus<span>.</span></h1><p>Study with intention. Build your atmosphere, then settle into focus.</p></div><button className="ghost corner-gear" aria-label="Settings" title="Settings" onClick={()=>setShowSettings(!showSettings)}><Settings2 size={20}/></button></header>
      {showSettings?<section className="panel preferences"><div className="section-heading"><h2>Preferences</h2><button className="ghost" onClick={()=>setShowSettings(false)}>Close</button></div>
        <label>Appearance<select value={settings.theme} onChange={e=>setSettings({...settings,theme:e.target.value as Theme})}>{themes.map(t=><option value={t.id} key={t.id}>{t.label}</option>)}</select></label>
        <label>On launch<select value={settings.autoplay} onChange={e=>setSettings({...settings,autoplay:e.target.value as Settings['autoplay']})}><option value="off">Do not auto-play</option><option value="last">Play last selected mix</option><option value="preset">Play launch preset</option></select></label>
        {settings.autoplay==='preset'&&<label>Launch preset<select value={settings.launchPreset} onChange={e=>setSettings({...settings,launchPreset:e.target.value})}><option value="">Choose preset</option>{presets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        <label className="check"><input type="checkbox" checked={settings.startHidden} onChange={e=>setSettings({...settings,startHidden:e.target.checked})}/> Start hidden in system tray (desktop only)</label>
      </section>:null}
      <FocusTimer settingsOpen={showSettings}/><div className="section-heading"><div><span className="eyebrow">YOUR MIX</span><h2>Soundscape <span className="count">{active} active</span></h2></div><button className="outline" onClick={importFiles}><Upload size={16}/> Import sounds</button></div>
      {sounds.length===0?<div className="empty"><div className="empty-art">♫</div><h3>A blank canvas for your calm.</h3><p>Import rain, crackling fireplaces, distant cafés, or any audio you love. Then layer, balance and save your mix.</p><button className="primary" onClick={importFiles}><Plus size={17}/> Add your first sound</button></div>:
      <div className="sound-grid">{sounds.map(s=><article className={'sound-card '+(s.active?'on':'')} key={s.id}>
        <div className="card-top"><div className="sound-icon"><Volume2 size={21}/></div><button className={'toggle '+(s.active?'enabled':'')} aria-label={s.active?'Disable '+s.name:'Enable '+s.name} onClick={()=>updateSound(s.id,{active:!s.active})}><span/></button></div>
        <h3>{s.name}</h3><p>{s.active?'In your soundscape':'Not playing'}</p>
        <div className="volume"><button title={s.muted?'Unmute':'Mute'} onClick={()=>updateSound(s.id,{muted:!s.muted})}>{s.muted?<VolumeX size={17}/>:<Volume2 size={17}/>}</button><input aria-label={s.name+' volume'} type="range" min="0" max="100" value={s.volume} onChange={e=>updateSound(s.id,{volume:Number(e.target.value)})}/><span>{s.volume}%</span></div>
        <button className="remove" onClick={()=>setSounds(old=>old.filter(x=>x.id!==s.id))} title="Remove sound"><Trash2 size={15}/></button>
      </article>)}</div>}
      <div className="bottom"><div><span className="eyebrow">CURRENT SESSION</span><strong>{active?active+' layered sound'+(active===1?'':'s'):'Nothing playing yet'}</strong></div><div className="controls"><button className="outline" onClick={savePreset}><Save size={17}/> Save preset</button><button className="primary play" onClick={()=>setPlaying(!playing)}>{playing?<Pause size={18} fill="currentColor"/>:<Play size={18} fill="currentColor"/>}{playing?'Pause all':'Play all'}</button></div></div>
      {notice&&<div role="status" className="toast" onClick={()=>setNotice('')}>{notice} ×</div>}
    </main>
  </div>;
}
