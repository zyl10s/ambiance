import { useEffect, useRef, useState } from 'react';
import { Clock3, Play, Pause, RotateCcw, Shield, Settings2 } from 'lucide-react';
import { invoke, isTauri } from '@tauri-apps/api/core';

type Phase='focus'|'short'|'long';
type Config={focus:number;short:number;long:number;every:number;autoNext:boolean;shieldWithTimer:boolean;screenIndex:number;hotkey:string;dndReminder:boolean};
const defaults:Config={focus:25,short:5,long:15,every:4,autoNext:false,shieldWithTimer:false,screenIndex:1,hotkey:'Ctrl+Shift+B',dndReminder:false};
const get=<T,>(key:string,fallback:T):T=>{try{return JSON.parse(localStorage.getItem(key)||'') as T}catch{return fallback}};
const seconds=(c:Config,p:Phase)=>c[p]*60;
const fmt=(s:number)=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
const keyString=(e:KeyboardEvent)=>[e.ctrlKey?'Ctrl':'',e.altKey?'Alt':'',e.shiftKey?'Shift':'',e.metaKey?'Meta':'',e.code].filter(Boolean).join('+');
export default function FocusTimer({settingsOpen}:{settingsOpen:boolean}){
 const [config,setConfig]=useState<Config>(()=>({...defaults,...get('ambiance.focus.config',defaults)}));
 const [enabled,setEnabled]=useState(false);
 const [phase,setPhase]=useState<Phase>('focus');
 const [running,setRunning]=useState(false);
 const [remaining,setRemaining]=useState(()=>seconds({...defaults,...get('ambiance.focus.config',defaults)},'focus'));
 const [completed,setCompleted]=useState(()=>get('ambiance.focus.completed',0));
 const [shieldOn,setShieldOn]=useState(false);
 const [monitors,setMonitors]=useState<string[]>([]);
 const [message,setMessage]=useState('');
 const deadline=useRef<number|null>(null);
 const configRef=useRef(config);configRef.current=config;
 const remainingRef=useRef(remaining);remainingRef.current=remaining;
 const phaseRef=useRef(phase);phaseRef.current=phase;
 const completedRef=useRef(completed);completedRef.current=completed;
 const finishRef=useRef<()=>void>(()=>{});
 const shieldRef=useRef(shieldOn);shieldRef.current=shieldOn;
 const native=isTauri();
 useEffect(()=>{localStorage.setItem('ambiance.focus.config',JSON.stringify(config))},[config]);
 useEffect(()=>{localStorage.setItem('ambiance.focus.completed',JSON.stringify(completed))},[completed]);
 useEffect(()=>{if(native)void invoke<string[]>('list_displays').then(setMonitors).catch(()=>{})},[native]);
 const setShield=async(on:boolean)=>{
   if(!native){setMessage('Screen shielding requires the Windows desktop app.');return;}
   try{await invoke(on?'open_focus_shield':'close_focus_shield',on?{index:configRef.current.screenIndex}:{});setShieldOn(on);}
   catch(e){setShieldOn(false);setMessage('Screen shield: '+String(e));}
 };
 const changePhase=(next:Phase,auto=false)=>{
   phaseRef.current=next;setPhase(next);setRunning(false);deadline.current=null;
   const s=seconds(configRef.current,next);remainingRef.current=s;setRemaining(s);
   if(shieldRef.current)void setShield(false);
   if(auto){deadline.current=Date.now()+s*1000;setRunning(true);if(next==='focus'&&configRef.current.shieldWithTimer)void setShield(true);}
 };
 finishRef.current=()=>{
   const current=phaseRef.current;
   if(current==='focus'){
     const count=completedRef.current+1;completedRef.current=count;setCompleted(count);
     changePhase(count%configRef.current.every===0?'long':'short',configRef.current.autoNext);
   }else changePhase('focus',configRef.current.autoNext);
   setMessage(current==='focus'?'Focus session finished. Take a break.':'Break finished.');
   if('Notification' in window&&Notification.permission==='granted')new Notification('Ambiance',{body:current==='focus'?'Time for a break.':'Ready to study?'});
 };
 useEffect(()=>{
   if(!running)return;
   const tick=()=>{
     const n=Math.max(0,Math.ceil(((deadline.current??Date.now())-Date.now())/1000));
     remainingRef.current=n;setRemaining(n);
     if(n===0)finishRef.current();
   };
   const id=window.setInterval(tick,250);tick();return()=>window.clearInterval(id);
 },[running]);
 const toggle=()=>{
   if(running){
     const n=Math.max(0,Math.ceil(((deadline.current??Date.now())-Date.now())/1000));
     remainingRef.current=n;setRemaining(n);deadline.current=null;setRunning(false);
     if(shieldRef.current)void setShield(false);
   }else{
     deadline.current=Date.now()+remainingRef.current*1000;setRunning(true);
     if(phase==='focus'&&config.shieldWithTimer)void setShield(true);
     if(phase==='focus'&&config.dndReminder)setMessage('Enable Windows Do not disturb in notification settings for this focus session.');
   }
 };
 const update=(patch:Partial<Config>)=>{
   const next={...config,...patch};setConfig(next);
   if(!running){const n=seconds(next,phase);remainingRef.current=n;setRemaining(n);}
 };
 useEffect(()=>{
   const handler=(e:KeyboardEvent)=>{
     if((e.target as HTMLElement)?.closest('input,textarea,select'))return;
     if(keyString(e)===configRef.current.hotkey){e.preventDefault();void setShield(!shieldRef.current);}
   };
   window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);
 },[]);
 const close=()=>{if(shieldRef.current)void setShield(false);setEnabled(false);changePhase('focus');};
 return <section className="inline-focus">
  {!enabled?<button className="primary" onClick={()=>setEnabled(true)}><Clock3 size={18}/> Start Pomodoro</button>:
   <div className="compact-timer"><div><span className="eyebrow">{phase==='focus'?'FOCUS SESSION':phase==='short'?'SHORT BREAK':'LONG BREAK'}</span><div className="compact-clock" role="timer">{fmt(remaining)}</div><span className="count">{completed} sessions completed</span></div><div className="timer-actions"><button className="primary" onClick={toggle}>{running?<Pause size={17}/>:<Play size={17}/>} {running?'Pause':'Start'}</button><button className="outline" onClick={()=>changePhase(phase)} title="Reset"><RotateCcw size={17}/></button><button className="ghost" onClick={close}>End</button></div></div>}
  {settingsOpen&&<div className="focus-settings"><h3><Settings2 size={19}/> Focus & distraction settings</h3>
   <div className="duration-grid">{([['focus','Focus minutes'],['short','Short break minutes'],['long','Long break minutes'],['every','Long break every N sessions']] as const).map(([key,label])=><label key={key}>{label}<input type="number" min="1" max={key==='every'?12:180} disabled={running} value={config[key]} onChange={e=>update({[key]:Math.max(1,Math.min(key==='every'?12:180,Number(e.target.value)||1))})}/></label>)}</div>
   <label className="check"><input type="checkbox" checked={config.autoNext} onChange={e=>update({autoNext:e.target.checked})}/> Automatically start next focus/break session</label>
   <label className="check"><input type="checkbox" checked={config.shieldWithTimer} onChange={e=>update({shieldWithTimer:e.target.checked})}/> Automatically shield the selected display while focus timer runs</label>
   <label className="check"><input type="checkbox" checked={config.dndReminder} onChange={e=>update({dndReminder:e.target.checked})}/> Remind me to enable Windows Do not disturb when focus starts</label>
   <p className="muted">Automatic Windows Do not disturb control is not implemented. Use the Windows settings shortcut below; manually restore notifications after studying.</p>
   <button className="outline" onClick={()=>native?void invoke('open_windows_notifications_settings').catch(e=>setMessage(String(e))):setMessage('Open Windows Settings → System → Notifications.') }><Shield size={16}/> Windows notification settings</button>
   <div className="focus-divider"/>
   <h3>Second-screen shield</h3>
   <label>Display <select value={config.screenIndex} onChange={e=>update({screenIndex:Number(e.target.value)})}>{monitors.map((m,i)=><option key={i} value={i}>{m}</option>)}{!monitors.length&&<option value={1}>Second display</option>}</select></label>
   <label>Toggle shortcut (while Ambiance is focused) <input value={config.hotkey} readOnly onKeyDown={e=>{e.preventDefault();const s=[e.ctrlKey?'Ctrl':'',e.altKey?'Alt':'',e.shiftKey?'Shift':'',e.metaKey?'Meta':'',e.code].filter(Boolean).join('+');if(!['ControlLeft','ControlRight','ShiftLeft','ShiftRight','AltLeft','AltRight','MetaLeft','MetaRight'].includes(e.code)&&s.includes('+'))update({hotkey:s});}} title="Click and press a modifier plus a key"/></label>
   <div className="timer-actions"><button className="outline" onClick={()=>void setShield(!shieldOn)}>{shieldOn?'Uncover display':'Cover display now'}</button></div>
   <p className="muted">The shortcut works when Ambiance has keyboard focus, even with the timer stopped. A system-wide hotkey is planned. The shield is always dismissible.</p>
   <button className="ghost" onClick={()=>{if('Notification' in window)void Notification.requestPermission().then(p=>setMessage('Notification permission: '+p));}}>Enable timer completion alerts</button>
  </div>}
  {message&&<div className="toast" role="status" onClick={()=>setMessage('')}>{message} ×</div>}
 </section>;
}
