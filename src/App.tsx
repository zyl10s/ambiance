import { useEffect, useRef, useState } from 'react';
import { Plus, Save, Trash2, Volume2, VolumeX, Settings2, Music2, CloudRain, CloudDrizzle, Wind, Waves, Flame, TreePine, Bird, Coffee, TrainFront, Moon, GripVertical, Grip, Radio, Droplets, Fan, BookOpen, CloudLightning, Timer, RotateCcw } from 'lucide-react';
import { isTauri } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { mkdir, readDir, readFile, writeFile } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';

type Theme = 'dark-academia' | 'light-academia' | 'romantic-academia' | 'modern' | 'gothic' | 'cyberpunk';
type Sound = { id: string; name: string; file: string; volume: number; muted: boolean; active: boolean; icon?: string };
type Preset = { id: string; name: string; mix: Pick<Sound,'id'|'volume'|'muted'|'active'>[] };
type Settings = { theme: Theme; autoplay: 'off'|'last'|'preset'; launchPreset: string; startHidden: boolean; pomodoroMinutes?: number; chimeEnabled?: boolean };
const themes: { id: Theme; label: string }[] = [
  {id:'dark-academia',label:'Dark Academia'}, {id:'light-academia',label:'Light Academia'}, {id:'romantic-academia',label:'Romantic Academia'},
  {id:'modern',label:'Modern'}, {id:'gothic',label:'Gothic'}, {id:'cyberpunk',label:'Cyberpunk'}
];
const builtins=[['rain','Rain','rain'],['storm','Thunderstorm','storm'],['wind','Wind','wind'],['waves','Ocean','waves'],['fire','Fireplace','fire'],['forest','Forest','forest'],['birds','Birds','birds'],['cafe','Café','cafe'],['train','Train','train'],['night','Night','night'],['stream','Stream','stream'],['fan','Fan','fan'],['library','Library','library'],['drizzle','Light rain','drizzle']] as const;
// CC0/public-domain field recordings hosted by Wikimedia Commons.
// These stream while online; they are not yet bundled for offline use.
const remoteBuiltins:Record<string,string>={
  rain:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Rain_(1).ogg',
  cafe:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Cafe_ambiance.ogg'
};
const icons:Record<string,typeof Volume2>={rain:CloudRain,storm:CloudLightning,wind:Wind,waves:Waves,fire:Flame,forest:TreePine,birds:Bird,cafe:Coffee,train:TrainFront,night:Moon,stream:Droplets,fan:Fan,library:BookOpen,drizzle:CloudDrizzle,music:Music2,radio:Radio};
const defaultSettings: Settings = {theme:'dark-academia',autoplay:'off',launchPreset:'',startHidden:false,pomodoroMinutes:25,chimeEnabled:true};
const stored = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || '') as T; } catch { return fallback; } };
const persist = (key:string,value:unknown) => localStorage.setItem(key,JSON.stringify(value));
const uid = () => crypto.randomUUID();
const safeFilename = (name:string) => name.replace(/[^a-zA-Z0-9._-]/g,'_');

export default function App() {
  const [settings,setSettings] = useState<Settings>(()=>stored('ambiance.settings',defaultSettings));
  const [sounds,setSounds] = useState<Sound[]>(()=>{const saved=stored<Sound[]>('ambiance.sounds',[]);const known=new Set(saved.map(s=>s.id));return [...saved,...builtins.filter(b=>!known.has(b[0])).map(([id,name,icon])=>({id,name,icon,file:'',volume:60,muted:false,active:false}))]});
  const [presets,setPresets] = useState<Preset[]>(()=>stored('ambiance.presets',[]));
  const [showSettings,setShowSettings] = useState(false);
  const [notice,setNotice] = useState('');
  const [reordering,setReordering]=useState(false);
  const [dragging,setDragging]=useState<string|null>(null);
  const [customIcon,setCustomIcon]=useState('music');
  const [adding,setAdding]=useState(false);
  const [timerStarted,setTimerStarted]=useState(false);
  const [timerRunning,setTimerRunning]=useState(false);
  const [timerSeconds,setTimerSeconds]=useState(25*60);
  const [tickVolume,setTickVolume]=useState(()=>stored('ambiance.pomodoroTickVolume',0));
  const lastTickSecond=useRef<number|null>(null);
  const timerDeadline=useRef<number|null>(null);
  const timerRemaining=useRef(25*60);
  const timerRunningRef=useRef(false);
  const chimeContext=useRef<AudioContext|null>(null);
  const chime=()=>{
    try{
      const ctx=chimeContext.current??new AudioContext();chimeContext.current=ctx;
      void ctx.resume();
      [0,0.23,0.46].forEach((delay,i)=>{
        const osc=ctx.createOscillator(),gain=ctx.createGain();
        osc.type='sine';osc.frequency.value=[784,988,1175][i];
        gain.gain.setValueAtTime(0.0001,ctx.currentTime+delay);
        gain.gain.exponentialRampToValueAtTime(0.14,ctx.currentTime+delay+0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+delay+0.55);
        osc.connect(gain);gain.connect(ctx.destination);
        osc.start(ctx.currentTime+delay);osc.stop(ctx.currentTime+delay+0.57);
      });
    }catch{setNotice('Chime could not play on this device.');}
  };
  // A clock escapement has two alternating impacts: a sharp tooth strike
  // followed by a quieter, lower resonant click. Use filtered noise rather
  // than a sustained square wave so it sounds more like metal and wood.
  const tickParity=useRef(0);
  const mechanicalTick=(volume:number)=>{
    if(volume<=0)return;
    try{
      const ctx=chimeContext.current??new AudioContext();chimeContext.current=ctx;
      if(ctx.state!=='running')return;
      const parity=tickParity.current++%2;
      const t=ctx.currentTime;
      const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*0.085),ctx.sampleRate);
      const data=buffer.getChannelData(0);
      let previous=0;
      for(let i=0;i<data.length;i++){
        const time=i/ctx.sampleRate;
        const burst=Math.exp(-time*(parity?100:145));
        const noise=(Math.random()*2-1);
        previous=previous*0.68+noise*0.32;
        data[i]=(noise-previous)*burst;
      }
      const source=ctx.createBufferSource();source.buffer=buffer;
      const filter=ctx.createBiquadFilter();filter.type='bandpass';
      filter.frequency.value=parity?850:1450;filter.Q.value=0.85;
      const gain=ctx.createGain();
      gain.gain.setValueAtTime(0.0001,t);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001,volume/100*(parity?0.22:0.29)),t+0.001);
      gain.gain.exponentialRampToValueAtTime(0.0001,t+0.078);
      source.connect(filter);filter.connect(gain);gain.connect(ctx.destination);
      source.start(t);source.stop(t+0.083);
    }catch{}
  };
  const startClick=()=>{
    try{
      const ctx=chimeContext.current??new AudioContext();chimeContext.current=ctx;void ctx.resume();
      const osc=ctx.createOscillator(),gain=ctx.createGain(),t=ctx.currentTime;
      osc.type='triangle';osc.frequency.setValueAtTime(950,t);osc.frequency.exponentialRampToValueAtTime(480,t+0.045);
      gain.gain.setValueAtTime(0.0001,t);gain.gain.exponentialRampToValueAtTime(0.09,t+0.004);gain.gain.exponentialRampToValueAtTime(0.0001,t+0.065);
      osc.connect(gain);gain.connect(ctx.destination);osc.start(t);osc.stop(t+0.07);
    }catch{}
  };
  const toggleTimer=()=>{
    if(!timerStarted){try{const ctx=chimeContext.current??new AudioContext();chimeContext.current=ctx;void ctx.resume();}catch{}startClick();const n=(settings.pomodoroMinutes??25)*60;timerRemaining.current=n;setTimerSeconds(n);setTimerStarted(true);timerDeadline.current=Date.now()+n*1000;timerRunningRef.current=true;setTimerRunning(true);}
    else if(timerRunningRef.current){const n=Math.max(0,Math.ceil(((timerDeadline.current??Date.now())-Date.now())/1000));timerRemaining.current=n;setTimerSeconds(n);timerRunningRef.current=false;setTimerRunning(false);timerDeadline.current=null;}
    else{if(timerRemaining.current<=0){resetTimer();return;}startClick();timerDeadline.current=Date.now()+timerRemaining.current*1000;timerRunningRef.current=true;setTimerRunning(true);}
  };
  const resetTimer=()=>{timerRunningRef.current=false;setTimerRunning(false);setTimerStarted(false);timerDeadline.current=null;const n=(settings.pomodoroMinutes??25)*60;timerRemaining.current=n;setTimerSeconds(n);};
  useEffect(()=>{
    if(!timerRunning)return;
    const tick=()=>{
      const n=Math.max(0,Math.ceil(((timerDeadline.current??Date.now())-Date.now())/1000));
      timerRemaining.current=n;setTimerSeconds(n);
      const elapsedSecond=Math.floor((timerDeadline.current??Date.now())/1000)-n;
      if(n>0&&tickVolume>0&&lastTickSecond.current!==elapsedSecond){lastTickSecond.current=elapsedSecond;mechanicalTick(tickVolume);}
      if(n===0){timerRunningRef.current=false;setTimerRunning(false);setTimerStarted(false);timerDeadline.current=null;if(settings.chimeEnabled!==false)chime();setNotice('Pomodoro finished.');}
    };
    tick();const interval=window.setInterval(tick,250);return()=>window.clearInterval(interval);
  },[timerRunning,settings.chimeEnabled,tickVolume]);

  const audio = useRef<Map<string,HTMLAudioElement>>(new Map());
  const urls = useRef<Map<string,string>>(new Map());
  const initialized = useRef(false);
  const [ready,setReady] = useState(false);

  useEffect(()=>{persist('ambiance.settings',settings);document.documentElement.dataset.theme=settings.theme},[settings]);
  useEffect(()=>()=>{if(chimeContext.current)void chimeContext.current.close();},[]);
  useEffect(()=>persist('ambiance.sounds',sounds),[sounds]);
  useEffect(()=>persist('ambiance.presets',presets),[presets]);
  useEffect(()=>persist('ambiance.pomodoroTickVolume',tickVolume),[tickVolume]);

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

    if(settings.autoplay==='preset'){
      const preset=presets.find(p=>p.id===settings.launchPreset);
      if(preset){applyPreset(preset);}
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
      const src=urls.current.get(s.file)||remoteBuiltins[s.id];
      if(!src)continue;
      if(!element){element=new Audio(src);element.loop=true;audio.current.set(s.id,element);}
      element.volume=s.muted?0:s.volume/100;
      if(s.active){if(element.paused)void element.play().catch(()=>setNotice('Could not play '+s.name+'. Check your internet connection or try again.'));}
      else element.pause();
    }
  },[sounds,ready]);

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
          added.push({id:uid(),name:name.replace(/\.[^.]+$/,''),file,volume:60,muted:false,active:true,icon:customIcon});
        }
        setSounds(old=>[...old,...added]);
      } else {
        const picker=document.createElement('input');picker.type='file';picker.multiple=true;picker.accept='audio/*';
        picker.onchange=()=>{
          const files=Array.from(picker.files||[]);
          const added=files.map(file=>{
            const key=uid()+'-'+file.name;urls.current.set(key,URL.createObjectURL(file));
            return {id:uid(),name:file.name.replace(/\.[^.]+$/,''),file:key,volume:60,muted:false,active:true,icon:customIcon};
          });
          setSounds(old=>[...old,...added]);
          setNotice('Browser imports are temporary. Use the desktop app for persistent audio.');
        };
        picker.click();
      }
    }catch(e){setNotice('Import failed: '+String(e));}
  };
  const move=(from:string,to:string)=>{if(from===to)return;setSounds(old=>{const list=[...old];const i=list.findIndex(s=>s.id===from),j=list.findIndex(s=>s.id===to);if(i<0||j<0)return old;const [item]=list.splice(i,1);list.splice(j,0,item);return list;});};
  return <div className="player">
    <header className="player-header"><strong>Ambiance</strong><div className="player-tools">
      <button className={'icon-button '+(reordering?'tool-selected':'')} title="Arrange sounds" aria-label="Arrange sounds" aria-pressed={reordering} onClick={()=>setReordering(!reordering)}><Grip size={18}/></button>
      <button className="icon-button" title="Settings" aria-label="Settings" onClick={()=>setShowSettings(!showSettings)}><Settings2 size={19}/></button>
    </div></header>
    {showSettings&&<section className="player-settings">
      <label>Theme <select value={settings.theme} onChange={e=>setSettings({...settings,theme:e.target.value as Theme})}>{themes.map(t=><option value={t.id} key={t.id}>{t.label}</option>)}</select></label>
      <label>On launch <select value={settings.autoplay} onChange={e=>setSettings({...settings,autoplay:e.target.value as Settings['autoplay']})}><option value="off">Do not play</option><option value="last">Last sounds</option><option value="preset">Preset</option></select></label>
      {settings.autoplay==='preset'&&<label>Preset <select value={settings.launchPreset} onChange={e=>setSettings({...settings,launchPreset:e.target.value})}><option value="">Select preset</option>{presets.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>}
      <label>Pomodoro (minutes) <input type="number" min="1" max="180" value={settings.pomodoroMinutes??25} onChange={e=>{const minutes=Math.max(1,Math.min(180,Number(e.target.value)||25));setSettings({...settings,pomodoroMinutes:minutes});if(!timerStarted){timerRemaining.current=minutes*60;setTimerSeconds(minutes*60);}}}/></label>
      <label><span>Completion chime</span><input type="checkbox" checked={settings.chimeEnabled!==false} onChange={e=>setSettings({...settings,chimeEnabled:e.target.checked})}/></label>
      <label><span>Start in tray</span><input type="checkbox" checked={settings.startHidden} onChange={e=>setSettings({...settings,startHidden:e.target.checked})}/></label>
    </section>}
    <main className="player-main"><div className="player-grid">
      <div className={'player-sound pomodoro-tile '+(timerStarted?'is-active':'')}>
        <button className="sound-switch" onClick={toggleTimer} title={!timerStarted?'Start Pomodoro':timerRunning?'Pause Pomodoro':'Resume Pomodoro'} aria-label={!timerStarted?'Start Pomodoro':timerRunning?'Pause Pomodoro':'Resume Pomodoro'}><Timer size={24}/></button>
        <button className="pomodoro-label" onClick={toggleTimer} title={!timerStarted?'Start Pomodoro':timerRunning?'Pause Pomodoro':'Resume Pomodoro'}>{timerStarted?String(Math.floor(timerSeconds/60)).padStart(2,'0')+':'+String(timerSeconds%60).padStart(2,'0'):'Pomodoro'}</button>
        {timerStarted&&<div className="pomodoro-tick"><input type="range" min="0" max="100" value={tickVolume} aria-label="Mechanical clock tick volume" title={'Clock tick volume: '+tickVolume+'%'} onChange={e=>setTickVolume(Number(e.target.value))}/><span title="Clock tick volume">{tickVolume===0?'Off':tickVolume+'%'}</span></div>}
        <div className="pomodoro-bottom">{timerStarted?<><span>{timerRunning?'Running':'Paused'}</span><button className="icon-button" title="Reset Pomodoro" aria-label="Reset Pomodoro" onClick={resetTimer}><RotateCcw size={15}/></button></>:<span> </span>}</div>
      </div>
      {sounds.map(s=>{const Icon=icons[s.icon||'music']||Music2;return <div className={'player-sound '+(s.active?'is-active ':'')+(reordering?'reordering':'')} key={s.id}
      onDragOver={e=>{if(reordering){e.preventDefault();e.dataTransfer.dropEffect='move';}}}
      onDrop={e=>{e.preventDefault();if(dragging)move(dragging,s.id);setDragging(null);}}
      onDragEnd={()=>setDragging(null)}>
      {reordering?<div className="drag-handle" draggable onDragStart={e=>{setDragging(s.id);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',s.id);}} title={'Drag to move '+s.name}><GripVertical size={24}/><span>{s.name}</span></div>:<>
        <button className="sound-switch" onClick={()=>{if(!s.file&&!remoteBuiltins[s.id]){setNotice(s.name+' audio has not been bundled yet.');return;}updateSound(s.id,{active:!s.active});}} aria-pressed={s.active} title={s.active?'Disable '+s.name:'Enable '+s.name}><Icon size={24}/></button>
        <div className="sound-name" title={s.file||remoteBuiltins[s.id]?s.name:s.name+' — audio pending'}>{s.name}{!s.file&&!remoteBuiltins[s.id]&&<span className="audio-pending" title="Audio not yet included"> ·</span>}</div>
        <div className="sound-volume"><input aria-label={s.name+' volume'} type="range" min="0" max="100" value={s.volume} onChange={e=>updateSound(s.id,{volume:Number(e.target.value)})}/><button className="icon-button" title={s.muted?'Unmute':'Mute'} onClick={()=>updateSound(s.id,{muted:!s.muted})}>{s.muted?<VolumeX size={15}/>:<Volume2 size={15}/>}</button></div>
        {s.file&&<button className="sound-delete" title={'Remove '+s.name} aria-label={'Remove '+s.name} onClick={()=>setSounds(old=>old.filter(x=>x.id!==s.id))}><Trash2 size={13}/></button>}
      </>}
    </div>})}</div></main>
    <footer className="player-footer">
      <div className="preset-controls"><select aria-label="Presets" defaultValue="" onChange={e=>{const p=presets.find(p=>p.id===e.target.value);if(p)applyPreset(p);}}><option value="">Presets</option>{presets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="icon-button" title="Save preset" onClick={savePreset}><Save size={17}/></button>{presets.length>0&&<button className="icon-button" title="Delete selected preset" onClick={()=>{const select=document.querySelector<HTMLSelectElement>('.preset-controls select');if(select?.value)setPresets(old=>old.filter(p=>p.id!==select.value));if(select)select.value='';}}><Trash2 size={15}/></button>}</div>
      <div className="footer-right"><button className="icon-button add-track" title="Add your own track" aria-label="Add your own track" onClick={()=>setAdding(!adding)}><Plus size={18}/></button></div>
    </footer>
    {adding&&<div className="add-track-panel"><label>Track icon <select value={customIcon} onChange={e=>setCustomIcon(e.target.value)}>{Object.keys(icons).map(icon=><option key={icon} value={icon}>{icon}</option>)}</select></label><button className="outline" onClick={()=>{setAdding(false);void importFiles();}}>Choose audio file</button><button className="icon-button" onClick={()=>setAdding(false)} aria-label="Cancel">×</button></div>}
    {notice&&<div className="toast" role="status" onClick={()=>setNotice('')}>{notice} ×</div>}
  </div>;
}
