import { useEffect, useRef, useState } from 'react';
import { Clock3, Play, Pause, RotateCcw, Shield, Monitor, Coffee } from 'lucide-react';
import { invoke, isTauri } from '@tauri-apps/api/core';

type Mode = 'focus'|'short'|'long';
type Config = { focus: number; short: number; long: number; longEvery: number; autoNext: boolean; blockScreen: boolean; screenIndex: number; notificationReminder: boolean };
const defaults: Config = {focus:25,short:5,long:15,longEvery:4,autoNext:false,blockScreen:false,screenIndex:1,notificationReminder:false};
const load = <T,>(key:string,fallback:T):T=>{try{return JSON.parse(localStorage.getItem(key)||'') as T}catch{return fallback}};
const durations=(c:Config,m:Mode)=>60*(m==='focus'?c.focus:m==='short'?c.short:c.long);
const format=(n:number)=>`${Math.floor(n/60).toString().padStart(2,'0')}:${Math.floor(n%60).toString().padStart(2,'0')}`;
export default function FocusTimer(){
  const [config,setConfig]=useState<Config>(()=>({...defaults,...load('ambiance.focus.config',defaults)}));
  const [mode,setMode]=useState<Mode>('focus');
  const [remaining,setRemaining]=useState(()=>durations({...defaults,...load('ambiance.focus.config',defaults)},'focus'));
  const [running,setRunning]=useState(false);
  const [completed,setCompleted]=useState(()=>load('ambiance.focus.completed',0));
  const [notice,setNotice]=useState('');
  const [monitors,setMonitors]=useState<string[]>([]);
  const deadline=useRef<number|null>(null);
  const remainingRef=useRef(remaining);remainingRef.current=remaining;
  const configRef=useRef(config);configRef.current=config;
  const modeRef=useRef(mode);modeRef.current=mode;
  const completedRef=useRef(completed);completedRef.current=completed;
  const finishRef=useRef<()=>void>(()=>{});
  const native=isTauri();
  useEffect(()=>{localStorage.setItem('ambiance.focus.config',JSON.stringify(config))},[config]);
  useEffect(()=>{localStorage.setItem('ambiance.focus.completed',JSON.stringify(completed))},[completed]);
  useEffect(()=>{if(native)void invoke<string[]>('list_displays').then(setMonitors).catch(()=>setMonitors([]))},[native]);
  const closeShield=()=>{if(native)void invoke('close_focus_shield').catch(()=>{});};
  const shield=async()=>{
    if(!native||!configRef.current.blockScreen)return;
    try{await invoke('open_focus_shield',{index:configRef.current.screenIndex});}
    catch(e){setNotice('Screen shield unavailable: '+String(e));}
  };
  const changeMode=(next:Mode,auto=false)=>{
    modeRef.current=next;setMode(next);
    deadline.current=null;setRunning(false);
    const secs=durations(configRef.current,next);
    remainingRef.current=secs;setRemaining(secs);
    closeShield();
    if(auto){deadline.current=Date.now()+secs*1000;setRunning(true);if(next==='focus')void shield();}
  };
  finishRef.current=()=>{
    const current=modeRef.current;
    if(current==='focus'){
      const count=completedRef.current+1;completedRef.current=count;setCompleted(count);
      changeMode(count%configRef.current.longEvery===0?'long':'short',configRef.current.autoNext);
    }else changeMode('focus',configRef.current.autoNext);
    setNotice(current==='focus'?'Focus complete. Time for a break.':'Break complete. Ready to focus?');
    if('Notification' in window&&Notification.permission==='granted')new Notification('Ambiance',{body:current==='focus'?'Focus session complete. Take a break.':'Break finished. Ready for another session?'});
  };
  useEffect(()=>{
    if(!running)return;
    const tick=()=>{
      const secs=Math.max(0,Math.ceil(((deadline.current??Date.now())-Date.now())/1000));
      remainingRef.current=secs;setRemaining(secs);
      if(secs===0)finishRef.current();
    };
    tick();
    const timer=window.setInterval(tick,250);
    return()=>window.clearInterval(timer);
  },[running]);
  const toggle=()=>{
    if(running){remainingRef.current=Math.max(0,Math.ceil(((deadline.current??Date.now())-Date.now())/1000));setRemaining(remainingRef.current);deadline.current=null;setRunning(false);closeShield();}
    else {deadline.current=Date.now()+remainingRef.current*1000;setRunning(true);if(mode==='focus')void shield();}
  };
  const reset=()=>changeMode(mode);
  const update=(patch:Partial<Config>)=>{
    const next={...config,...patch};setConfig(next);
    if(!running){const secs=durations(next,mode);remainingRef.current=secs;setRemaining(secs);}
  };
  const askNotification=async()=>{
    if(!('Notification' in window)){setNotice('System notifications are unavailable here.');return;}
    const permission=await Notification.requestPermission();
    setNotice(permission==='granted'?'Timer completion alerts enabled.':'Notifications were not enabled.');
  };
  return <section className="focus-page">
    <div className="section-heading"><div><span className="eyebrow">STUDY WITH INTENTION</span><h2>Focus timer</h2></div><span className="count">{completed} focus sessions completed</span></div>
    <div className="timer-panel">
      <div className="timer-modes"><button className={mode==='focus'?'chosen':''} onClick={()=>changeMode('focus')}><Clock3 size={16}/> Focus</button><button className={mode==='short'?'chosen':''} onClick={()=>changeMode('short')}><Coffee size={16}/> Short break</button><button className={mode==='long'?'chosen':''} onClick={()=>changeMode('long')}><Coffee size={16}/> Long break</button></div>
      <div className="timer-clock" role="timer" aria-label={mode+' time remaining'}>{format(remaining)}</div>
      <p className="timer-subtitle">{running?'One thing at a time. You have this.':mode==='focus'?'Settle in and make some progress.':'Take a moment to recharge.'}</p>
      <div className="timer-actions"><button className="primary" onClick={toggle}>{running?<Pause size={18}/>:<Play size={18}/>} {running?'Pause':'Start'} {mode==='focus'?'focus':'break'}</button><button className="outline" onClick={reset}><RotateCcw size={17}/> Reset</button></div>
    </div>
    <div className="focus-settings"><h3>Session preferences</h3><div className="duration-grid">{([['focus','Focus (min)'],['short','Short break (min)'],['long','Long break (min)'],['longEvery','Long break every N sessions']] as const).map(([key,label])=><label key={key}>{label}<input type="number" min="1" max={key==='longEvery'?12:180} value={config[key]} disabled={running} onChange={e=>update({[key]:Math.max(1,Math.min(key==='longEvery'?12:180,Number(e.target.value)||1))})}/></label>)}</div>
      <label className="check"><input type="checkbox" checked={config.autoNext} onChange={e=>update({autoNext:e.target.checked})}/> Automatically start the next session or break</label>
      <div className="focus-divider"/>
      <h3><Shield size={19}/> Distraction controls</h3>
      <p className="muted">Windows Focus / Do not disturb is controlled by Windows. Ambiance does not silently change your system notification settings.</p>
      <button className="outline" onClick={()=>{if(native)void invoke('open_windows_notifications_settings').catch(e=>setNotice(String(e)));else setNotice('Open Windows Settings → System → Notifications → Do not disturb.')}}><Shield size={16}/> Open Windows notification settings</button>
      <p className="muted">Turn on Do not disturb in Windows before a study session. Windows may still allow priority notifications.</p>
      <label className="check"><input type="checkbox" checked={config.blockScreen} onChange={e=>update({blockScreen:e.target.checked})}/> Cover another display while focusing (Windows desktop)</label>
      {config.blockScreen&&<div className="shield-controls"><label>Display to cover <select value={config.screenIndex} onChange={e=>update({screenIndex:Number(e.target.value)})}>{monitors.map((name,index)=><option key={index} value={index}>{index+1}: {name}</option>)}{!monitors.length&&<option value={1}>Second display (desktop only)</option>}</select></label><p className="muted">The shield is a removable always-on-top window, not a security lock. Use its Close button or pause the timer to dismiss it. Your main app stays accessible on the other display.</p></div>}
      <button className="ghost" onClick={askNotification}>Enable session-complete notifications</button>
    </div>
    {notice&&<div className="toast" role="status" onClick={()=>setNotice('')}>{notice} ×</div>}
  </section>;
}
