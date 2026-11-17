import {entries,key,add,bounds} from './core.js';
export const DEFAULT_REMINDERS=[1440,60];
export const MAX_REMINDER_MINUTES=525600;
export function validOffsets(value){return Array.isArray(value)&&value.length<=5&&value.every(n=>Number.isInteger(n)&&n>=0&&n<=MAX_REMINDER_MINUTES)&&new Set(value).size===value.length}
export function normalizeOffsets(value){if(!validOffsets(value))throw Error('En fazla beş geçerli hatırlatma seç.');return [...value].sort((a,b)=>b-a)}
export function reminderOffsets(item,prefs={}){return normalizeOffsets(item.reminders===undefined||item.reminders===null?(prefs.reminderDefaults??DEFAULT_REMINDERS):item.reminders)}
export function offsetLabel(n){return n===0?'Başlarken':n%1440===0?`${n/1440} gün önce`:n%60===0?`${n/60} saat önce`:`${n} dk. önce`}
export function reminderSummary(offsets){return offsets.length?offsets.map(offsetLabel).join(' · '):'Kapalı'}
export function reminderQueue(state,now=Date.now(),horizonDays=370,lateness=120000){
  const allOffsets=new Set(state.prefs.reminderDefaults??DEFAULT_REMINDERS);for(const i of state.items){for(const n of i.reminders??[])allOffsets.add(n);for(const e of Object.values(i.exceptions??{}))for(const n of e.reminders??[])allOffsets.add(n);}
  const lead=Math.min(horizonDays,Math.ceil(Math.max(0,...allOffsets)/1440)+1),start=add(key(new Date(now)),-1),end=add(key(new Date(now)),lead),queue=[];
  for(const item of entries(state,start,end)){
    if(item.status!=='pending'||!item.time)continue;const b=bounds(item);if(!b||lateness>120000&&b.start<now-120000)continue;
    for(const minutes of reminderOffsets(item,state.prefs)){const due=b.start-minutes*60000;if(due>=now-lateness&&due<=now+24*3600000)queue.push({id:`${item.occurrenceKey}:${b.start}:${minutes}`,due,start:b.start,minutes,title:item.title,date:item.date,origin:item.origin,itemId:item.id});}
  }
  return queue.sort((a,b)=>a.due-b.due);
}
export function dueReminders(queue,now=Date.now(),lateness=120000){return queue.filter(n=>n.due<=now&&n.due>=now-lateness)}
const escapeIcs=s=>String(s??'').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
const utc=n=>new Date(n).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
export function foldIcsLine(line){const enc=new TextEncoder();let out='',part='';for(const c of line){if(enc.encode(part+c).length>75){out+=part+'\r\n';part=' '+c}else part+=c;}return out+part;}
export function calendarExport(state,{now=Date.now(),start=key(new Date(now)),days=90}={}){
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Gun Payi//Personal Planner//TR','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Gün Payı'];let count=0;
  for(const item of entries(state,start,add(start,days-1))){if(item.status!=='pending'||!item.time)continue;const b=bounds(item);if(!b||b.end<now)continue;count++;
    lines.push('BEGIN:VEVENT',`UID:${item.id}-${item.origin}@gun-payi`,`DTSTAMP:${utc(now)}`,`DTSTART:${utc(b.start)}`,`DTEND:${utc(b.end)}`,`SUMMARY:${escapeIcs(item.title)}`);
    if(item.detail)lines.push(`DESCRIPTION:${escapeIcs(item.detail)}`);
    for(const offset of reminderOffsets(item,state.prefs))lines.push('BEGIN:VALARM',offset?`TRIGGER:-PT${offset}M`:'TRIGGER:PT0S','ACTION:DISPLAY',`DESCRIPTION:${escapeIcs(item.title)}`,'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');return {count,text:lines.map(foldIcsLine).join('\r\n')+'\r\n'};
}
