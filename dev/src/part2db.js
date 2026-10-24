
/* ---------- data layer（Firebase Realtime Database） ----------
   ・予約は weeks/<週>/reqs/<id> に1件ずつ保存
   ・確定した予約は weeks/<週>/slots/<曜日>_<コマ> に「枠の札」を置く。
     札はすでにあると置けない（ルールで保証）ので、同時に押しても二重予約にならない
   ・運営は共有の運営アカウントにログイン（暗証番号＝そのパスワード）。権限はFirebase側で確認 */
let FBX={db:null,auth:null,adminAuth:null,adminDb:null,ref:null,refWs:''};
const ADMIN_EMAIL=(window.FB_ADMIN_EMAIL||'unei@kitami-keion.example');

function fbReady(){return !!FBX.db}
function fbInit(){
  if(!window.firebase||!window.FB_CONFIG||!window.FB_CONFIG.apiKey){S.fail='設定（firebase-config.js）が読み込めませんでした';return false}
  firebase.initializeApp(window.FB_CONFIG);
  FBX.db=firebase.database();FBX.auth=firebase.auth();
  const a2=firebase.initializeApp(window.FB_CONFIG,'admin');
  FBX.adminAuth=a2.auth();FBX.adminDb=a2.database();
  return true;
}
function DB(){return S.isAdmin?FBX.adminDb:FBX.db}
function wref(ws){return DB().ref('weeks/'+ws)}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function fbErr(e,ctx){
  const code=(e&&(e.code||e.message)||'')+'';
  const err=new Error(
    /PERMISSION_DENIED|permission/i.test(code)?(ctx==='slot'?'その時間にはすでに予約があります（タッチの差で先に取られたかも）':'保存できませんでした。募集期間外か、上限を超えているかもしれません')
    :/network|disconnected|offline|unavailable/i.test(code)?'通信がうまくいきませんでした。電波のいい所でもう一度押してください'
    :/wrong-password|invalid-credential|invalid-login|user-not-found|INVALID_LOGIN/i.test(code)?'暗証番号が違います'
    :/too-many-requests/i.test(code)?'何度も間違えたので、少し時間をおいてください'
    :(e&&e.message)||'保存できませんでした');
  err.code=code;return err;
}
function slotKeys(r){const a=[];for(let i=r.s;i<r.e;i++)a.push(r.day+'_'+i);return a}
function clean(r){
  const o={uid:r.uid||S.uid,band:r.band||'',rep:r.rep,kind:r.kind,day:r.day,s:r.s,e:r.e,dur:r.dur||(r.e-r.s),status:r.status,createdAt:r.createdAt||Date.now()};
  if(r.ws!=null)o.ws=r.ws;if(r.we!=null)o.we=r.we;if(r.ex&&r.status==='pending')o.ex=String(r.ex);
  return o;
}

/* 週のデータを受け取って画面用に整える */
function apply(val){
  val=val||{};
  const c=val.cfg||{};
  const ord=c.order?(Array.isArray(c.order)?c.order:[c.order[0],c.order[1],c.order[2]]):null;
  S.cfg=c.phase?{phase:c.phase,order:ord,maxSlots:c.maxSlots||4}:{};
  const rs=val.reqs||{};
  S.reqs=Object.keys(rs).map(id=>Object.assign({id:id},rs[id],{mine:!!S.uid&&rs[id].uid===S.uid}));
  S.slots=val.slots||{};
  computePlan();
}
/* 表示中の週をリアルタイムで受け取る（他の人の予約もすぐ反映） */
function load(quiet){
  if(!fbReady())return;
  if(FBX.ref&&FBX.refWs===S.ws){if(!quiet)render();return}
  if(FBX.ref)FBX.ref.off();
  const ws=S.ws;
  S.loading=true;S.armed=false;S.cfg={};S.reqs=[];S.slots={};S.plan={place:new Map(),bad:new Set()};render();
  FBX.refWs=ws;FBX.ref=FBX.db.ref('weeks/'+ws);
  FBX.ref.on('value',snap=>{
    if(ws!==S.ws)return;
    apply(snap.val());S.loading=false;S.fail='';render();
  },e=>{S.loading=false;S.fail=fbErr(e).message;render()});
}

/* 画面側からの呼び出し口（Apps Script版と同じ名前で使えるようにしている） */
async function api(fn){
  const a=Array.prototype.slice.call(arguments,1);
  switch(fn){
    case 'getAppUrl':return location.origin+location.pathname;
    case 'checkPin':return checkPin(a[0]);
    case 'addReq':return dbAdd(a[0]);
    case 'updateReq':return dbUpdate(a[0],a[1]);
    case 'deleteReq':return dbDelete(a[0]);
    case 'saveCfg':return dbSaveCfg(a[0],a[1]);
    case 'confirmAll':return dbConfirmAll(a[0]);
    case 'rebuildSheet':exportImage();return true;
    case 'archiveOld':return {moved:0};
    default:throw new Error('未対応の操作です：'+fn);
  }
}
async function mutate(fn,args,okMsg){
  try{const r=await api.apply(null,[fn].concat(args));if(okMsg)toast(okMsg);render();return r}
  catch(e){toast(e.message||'保存できませんでした');render();throw e}
}
async function optimistic(change,fn,args,okMsg){
  /* Realtime Database は書いた瞬間に画面へ反映され、失敗すると自動で元に戻る */
  try{const r=await api.apply(null,[fn].concat(args));if(okMsg)toast(okMsg);return r}
  catch(e){toast(e.message||'保存できませんでした');throw e}
}
async function saveCfg(patch){try{await mutate('saveCfg',[S.ws,patch])}catch(e){}}
async function addReq(o){return optimistic(null,'addReq',[Object.assign({week:S.ws},o)])}
async function updReq(id,patch){return optimistic(null,'updateReq',[id,patch])}
async function patchReq(id,patch){try{await updReq(id,patch)}catch(e){}}
async function delReq(id){try{await optimistic(null,'deleteReq',[id])}catch(e){}}

async function checkPin(pin){
  try{await FBX.adminAuth.signInWithEmailAndPassword(ADMIN_EMAIL,String(pin));return true}
  catch(e){const er=fbErr(e);if(er.message==='暗証番号が違います')return false;throw er}
}
async function adminLogout(){try{await FBX.adminAuth.signOut()}catch(e){}}

async function dbAdd(o){
  const ws=o.week||S.ws,free=phase()==='free';
  const status=(free||(o.fixed&&S.isAdmin))?'confirmed':'pending';
  const r={uid:S.uid,band:(o.band||'').trim(),rep:(o.rep||'').trim(),kind:o.kind,day:o.day,s:o.s,e:o.e,
    dur:status==='confirmed'?o.e-o.s:o.dur,status:status,createdAt:firebase.database.ServerValue.TIMESTAMP};
  if(status==='pending'&&o.ex)r.ex=String(o.ex);
  const id=wref(ws).child('reqs').push().key;
  const up={};up['reqs/'+id]=r;
  if(status==='confirmed'){
    const keys=slotKeys(r);
    if(ws===S.ws&&keys.some(k=>S.slots[k]))throw new Error('その時間にはすでに予約があります');
    keys.forEach(k=>{up['slots/'+k]=id});
  }
  try{await wref(ws).update(up)}catch(e){throw fbErr(e,status==='confirmed'?'slot':'')}
  return id;
}
async function dbUpdate(id,patch){
  const cur=S.reqs.find(x=>x.id===id);
  if(!cur)throw new Error('予約が見つかりません');
  const nx=Object.assign({},cur,patch);
  if(nx.status==='confirmed')nx.dur=nx.e-nx.s;
  const before=cur.status==='confirmed'?slotKeys(cur):[],after=nx.status==='confirmed'?slotKeys(nx):[];
  const up={};up['reqs/'+id]=clean(nx);
  before.filter(k=>!after.includes(k)).forEach(k=>{up['slots/'+k]=null});
  after.filter(k=>!before.includes(k)).forEach(k=>{up['slots/'+k]=id});
  try{await wref(S.ws).update(up)}catch(e){throw fbErr(e,after.length?'slot':'')}
  return true;
}
async function dbDelete(id){
  const cur=S.reqs.find(x=>x.id===id);
  if(!cur)return true;
  const up={};up['reqs/'+id]=null;
  if(cur.status==='confirmed')slotKeys(cur).forEach(k=>{up['slots/'+k]=null});
  try{await wref(S.ws).update(up)}catch(e){throw fbErr(e)}
  return true;
}
async function dbSaveCfg(ws,patch){
  const c={phase:patch.phase||phase(),order:patch.order||order(),maxSlots:patch.maxSlots||maxSlots()};
  try{await wref(ws).child('cfg').set(c)}catch(e){throw fbErr(e)}
  return true;
}
async function dbConfirmAll(ws){
  computePlan();
  const up={};let ok=0,ng=0;
  S.reqs.filter(r=>r.status==='pending').forEach(r=>{
    const t=S.plan.place.get(r.id);
    if(t==null){ng++;up['reqs/'+r.id+'/status']='rejected'}
    else{
      ok++;const d=durOf(r);
      const nx=Object.assign({},r,{status:'confirmed',ws:r.s,we:r.e,s:t,e:t+d,dur:d,ex:''});
      up['reqs/'+r.id]=clean(nx);
      slotKeys(nx).forEach(k=>{up['slots/'+k]=r.id});
    }
  });
  up['cfg/phase']='free';
  if(!S.cfg.phase){up['cfg']={phase:'free',order:order(),maxSlots:maxSlots()};delete up['cfg/phase']}
  try{await wref(ws).update(up)}catch(e){throw fbErr(e,'slot')}
  return {ok:ok,ng:ng};
}

/* ---------- 練習表を画像で保存（スプレッドシートの代わり） ---------- */
/* ---------- 練習表の画像（今までのスプレッドシートと同じ見た目） ---------- */
const IMG_COLORS=['#6d9eeb','#e06666','#93c47d','#ffd966'];
function drawSheet(){
  const cw=150,tw=86,rh=30,h1=40,h2=30,hh=h1+h2,W=tw*2+cw*7,Hh=hh+rh*SLOTS+16;
  const cv=document.createElement('canvas');cv.width=W*2;cv.height=Hh*2;
  const g=cv.getContext('2d');g.scale(2,2);
  const F='"Hiragino Kaku Gothic ProN","Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif';
  g.fillStyle='#fff';g.fillRect(0,0,W,Hh);
  g.textBaseline='middle';
  /* 見出し：曜日（明るい青）と日付（濃い青） */
  g.fillStyle='#6d9eeb';g.fillRect(tw,0,cw*7,h1);g.fillStyle='#4a86e8';g.fillRect(0,h1,W,h2);
  g.fillStyle='#000';g.font='900 26px '+F;g.textAlign='left';g.fillText('練習表',8,h1/2+1);
  for(let d=0;d<7;d++){
    const x=tw+d*cw;
    g.fillStyle='#000';g.font='15px '+F;g.textAlign='left';g.fillText(DAYS[d]+'曜日',x+6,h1/2);
    g.textAlign='right';g.fillText(d===0?addDays(S.ws,0).replace(/-/g,'/'):md(addDays(S.ws,d)),x+cw-6,h1+h2/2);
  }
  /* 時間の列（左右） */
  g.font='15px '+F;g.fillStyle='#000';
  for(let i=0;i<=SLOTS;i++){const y=hh+i*rh;g.textAlign='right';g.fillText(tm(i),tw-8,y+(i<SLOTS?rh/2:8));g.textAlign='left';g.fillText(tm(i),tw+cw*7+8,y+(i<SLOTS?rh/2:8))}
  /* マス目 */
  g.strokeStyle='#d0d0d0';g.lineWidth=1;
  for(let i=0;i<=SLOTS;i++){g.beginPath();g.moveTo(0,hh+i*rh+.5);g.lineTo(W,hh+i*rh+.5);g.stroke()}
  for(let d=0;d<=7;d++){g.beginPath();g.moveTo(tw+d*cw+.5,0);g.lineTo(tw+d*cw+.5,hh+rh*SLOTS);g.stroke()}
  /* 予約 */
  colorMap();
  S.reqs.filter(r=>r.status==='confirmed').forEach(r=>{
    const v=S.colors.get(r.id);const x=tw+r.day*cw,y=hh+r.s*rh,hgt=(Math.min(r.e,SLOTS)-r.s)*rh;
    g.fillStyle=isMeeting(r)||v==='m'?'#cccccc':IMG_COLORS[(v||0)%IMG_COLORS.length];g.fillRect(x+1,y+1,cw-1,hgt-1);
    g.strokeStyle='#888';g.strokeRect(x+.5,y+.5,cw,hgt);
    g.fillStyle='#000';g.textAlign='center';g.font='15px '+F;
    let t=nm(r);while(g.measureText(t).width>cw-10&&t.length>1)t=t.slice(0,-1);
    g.fillText(t,x+cw/2,y+hgt/2);
  });
  return cv;
}
function sheetFile(cv){
  const url=cv.toDataURL('image/png'),bin=atob(url.split(',')[1]),u=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
  return {url:url,file:new File([u],'練習表_'+md(S.ws).replace('/','-')+'〜.png',{type:'image/png'})};
}
/* 画像を見てから「送る」（スマホの共有メニュー → LINE など）か「保存」 */
function exportImage(){
  if(!S.reqs.some(r=>r.status==='confirmed')){toast('この週はまだ確定した予約がありません');return}
  const cv=drawSheet(),o=sheetFile(cv);
  const canShare=!!(navigator.share&&navigator.canShare&&navigator.canShare({files:[o.file]}));
  const save=()=>{const a=document.createElement('a');a.download=o.file.name;a.href=o.url;document.body.append(a);a.click();a.remove();toast('練習表の画像を保存しました')};
  const send=()=>{navigator.share({files:[o.file],text:'練習表（'+md(S.ws)+'〜'+md(addDays(S.ws,6))+'）'}).catch(e=>{if(e&&e.name!=='AbortError')save()})};
  layer(h('div',{class:'sheet wide',role:'dialog','aria-modal':'true'},[
    h('h3',{text:'練習表（'+md(S.ws)+'〜'+md(addDays(S.ws,6))+'）'}),
    h('img',{src:o.url,alt:'練習表',class:'sheetimg'}),
    h('p',{class:'rank',text:canShare?'「送る」を押すと共有メニューが開くので、LINE を選んでグループに送ってください。':'この端末では直接送れないので、「保存」してから LINE で送ってください。画像を長押しして保存もできます。'}),
    h('div',{class:'row',style:'justify-content:flex-end'},[h('button',{class:'btn',onclick:closeSheet,text:'閉じる'}),
      h('button',{class:canShare?'btn':'btn primary',onclick:save,text:'保存'}),
      canShare?h('button',{class:'btn primary',onclick:send,text:'送る（LINEなど）'}):null])
  ]));
}

/* ---------- カレンダー用ファイル（.ics）をその場で作る ---------- */
function icsEsc(v){return String(v||'').replace(/\\/g,'\\\\').replace(/[,;]/g,c=>'\\'+c).replace(/\r?\n/g,'\\n')}
function icsUtc(ws,day,slot){
  const p=ws.split('-').map(Number);
  const t=new Date(Date.UTC(p[0],p[1]-1,p[2]+day,0,0)+slot*30*60000);   // 9:00(JST)=0:00(UTC)
  return t.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
}
function icsHref(list){
  const now=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const ev=list.map(r=>{const name=nm(r);return ['BEGIN:VEVENT','UID:'+r.id+'@kitami-keion','DTSTAMP:'+now,
    'DTSTART:'+icsUtc(S.ws,r.day,r.s),'DTEND:'+icsUtc(S.ws,r.day,r.e),
    'SUMMARY:'+icsEsc(isMeeting(r)?'部会':'部室練習：'+name),'LOCATION:'+icsEsc('部室'),
    'DESCRIPTION:'+icsEsc((r.rep?'代表 '+r.rep+'\n':'')+'北見工大 軽音予約'),
    'BEGIN:VALARM','TRIGGER:-PT60M','ACTION:DISPLAY','DESCRIPTION:'+icsEsc('1時間後に部室練習：'+name),'END:VALARM','END:VEVENT'].join('\r\n')});
  const body=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//kitami-keion//bushitsu//JA','CALSCALE:GREGORIAN','METHOD:PUBLISH'].concat(ev,['END:VCALENDAR']).join('\r\n');
  return 'data:text/calendar;charset=utf-8,'+encodeURIComponent(body);
}
