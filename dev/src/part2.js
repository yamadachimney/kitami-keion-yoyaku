(function(){
'use strict';
const SLOTS=23, H=24;  /* 9:00〜20:30（30分×23コマ）。前に入った21:00までの予約はデータのまま残して表示だけ20:30で切る */
const DAYS=['月','火','水','木','金','土','日'];
const KINDS={band:'バンド練習',drum:'ドラム練習',other:'その他'};
const KEYS=['band','drum','other'];
const PHASES={closed:'準備中',request:'希望募集中',free:'自由予約'};
const S={ws:'',cfg:{},reqs:[],tab:'grid',uid:'',pin:'',isAdmin:false,plan:{place:new Map(),bad:new Set()},armed:false,loading:true,fail:'',seq:0,busy:false,showAll:true,pending:0};

/* ---------- helpers ---------- */
function h(tag,attrs,kids){
  const el=document.createElement(tag);
  if(attrs)for(const k in attrs){
    const v=attrs[k];
    if(v==null||v===false)continue;
    if(k==='class')el.className=v;
    else if(k==='text')el.textContent=v;
    else if(k.slice(0,2)==='on')el.addEventListener(k.slice(2),v);
    else if(k==='style')el.style.cssText=v;
    else if(v===true)el.setAttribute(k,'');
    else el.setAttribute(k,v);
  }
  (kids||[]).forEach(c=>{if(c==null||c===false)return;el.append(c.nodeType?c:document.createTextNode(c));});
  return el;
}
const $=id=>document.getElementById(id);
function pad(n){return String(n).padStart(2,'0')}
function isoOf(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function addDays(iso,n){const d=new Date(iso+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function mondayOf(d){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());const w=(x.getDay()+6)%7;x.setDate(x.getDate()-w);return isoOf(x)}
function md(iso){const p=iso.split('-');return (+p[1])+'/'+(+p[2])}
function tm(i){return (9+Math.floor(i/2))+':'+(i%2?'30':'00')}
function range(r){return tm(r.s)+'–'+tm(r.e)}
function defaultWeek(){const n=new Date();const m=mondayOf(n);return n.getDay()===6||n.getDay()===0?addDays(m,7):m}
function esc(s){return String(s==null?'':s)}
function toast(t){
  const b=$('toastBox');b.replaceChildren(h('div',{class:'toast',role:'status',text:t}));
  clearTimeout(toast.t);toast.t=setTimeout(()=>b.replaceChildren(),2600);
}
function lsGet(k){try{return localStorage.getItem(k)||''}catch(e){return ''}}
function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}

/* ---------- derived data ---------- */
function phase(){return S.cfg.phase||'closed'}
function order(){const o=S.cfg.order;return Array.isArray(o)&&o.length===3?o:KEYS.slice()}
function rankOf(k){const i=order().indexOf(k);return i<0?9:i}
function live(){return S.reqs.filter(r=>r.status!=='rejected')}
function overlap(a,b){return a.day===b.day&&a.s<b.e&&b.s<a.e}
function clashes(r){
  return live().filter(o=>o.id!==r.id&&overlap(r,o)).map(o=>({o:o,s:Math.max(r.s,o.s),e:Math.min(r.e,o.e)})).sort((a,b)=>a.s-b.s);
}
function maxSlots(){return S.cfg.maxSlots||4}
function durOf(r){return Math.max(1,Math.min(r.dur||(r.e-r.s),r.e-r.s))}
function durLabel(n){const h=Math.floor(n/2);return (h?h+'時間':'')+(n%2?'30分':'')}
/* 希望は「練習できる時間帯（s〜e）」＋「練習時間（dur）」。時間帯が被っていても、
   その中でずらして全員入るなら被りとは扱わず、優先度順に仮配置する */

/* 申し込む前のシミュレーション用（サーバーと同じ計算） */
function feasible(items,occ){
  const list=items.slice().sort((a,b)=>((a.e-a.s-a.dur)-(b.e-b.s-b.dur))||a.s-b.s);
  const used=occ.slice(),res=new Map();let nodes=0;
  function go(k){
    if(k===list.length)return true;
    if(++nodes>40000)return false;
    const r=list[k];
    for(let t=r.s;t+r.dur<=r.e;t++){
      let ok=true;
      for(let i=t;i<t+r.dur;i++)if(used[i]){ok=false;break}
      if(!ok)continue;
      for(let i=t;i<t+r.dur;i++)used[i]=true;
      res.set(r.id,t);
      if(go(k+1))return true;
      for(let i=t;i<t+r.dur;i++)used[i]=false;
    }
    return false;
  }
  return go(0)?res:null;
}
function simulate(items){
  const occ=new Array(SLOTS).fill(false);
  items.filter(r=>r.status==='confirmed').forEach(r=>{for(let i=r.s;i<r.e;i++)occ[i]=true});
  const pend=items.filter(r=>r.status==='pending').map(r=>Object.assign({},r,{dur:durOf(r)})).sort(byDecision);
  let acc=[],cur=new Map();const bad=new Set();
  pend.forEach(r=>{const t=acc.concat([r]),f=feasible(t,occ);if(f){acc=t;cur=f}else bad.add(r.id)});
  return {place:cur,bad:bad};
}
/* 表示用の仮配置（優先度順・先着順で、時間帯の中に並べる） */
function computePlan(){
  const place=new Map(),bad=new Set();
  for(let d=0;d<7;d++){
    const r=simulate(S.reqs.filter(x=>x.day===d&&x.status!=='rejected'));
    r.place.forEach((v,k)=>place.set(k,v));r.bad.forEach(k=>bad.add(k));
  }
  S.plan={place:place,bad:bad};
}
function conflicts(r){return r.status==='pending'&&S.plan.bad.has(r.id)}
function nm(r){return r.band||r.rep||'名無し'}
/* 希望募集中は、管理者以外の週間表には確定済みと自分の希望だけを出す */
function visible(){
  const all=live();
  if(S.isAdmin||phase()!=='request'||S.showAll)return all;
  return all.filter(r=>r.status==='confirmed'||mine(r));
}
function byDecision(a,b){return rankOf(a.kind)-rankOf(b.kind)||(a.createdAt||0)-(b.createdAt||0)}
function mine(r){return !!r.mine}
function canAdd(){return phase()!=='closed'}

