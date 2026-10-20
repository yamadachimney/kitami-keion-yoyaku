/* 北見軽音ティア表
   データ（Realtime Database）
     tierTopics/<tid>        {name, by, uid, createdAt}          お題
     tierItems/<tid>/<iid>   {t, uid, createdAt}                 お題のアイテム（だれでも追加）
     tierLists/<tid>/<uid>   {who, uid, r:{<iid>:'S'..'D'}, createdAt, updatedAt}   1端末につき1つ
   ティア表を直す・消すのは作った端末だけ。お題とアイテムはだれでも消せる。運営アカウントは全部消せる */
const TIERS=['S','A','B','C','D'], PT={S:5,A:4,B:3,C:2,D:1};
const ADMIN_EMAIL=window.FB_ADMIN_EMAIL||'unei@kitami-keion.example';
const S={uid:null,isAdmin:false,ready:false,fail:'',topics:{},items:{},lists:{}};
let V={view:'home',tid:null,lid:null}, E=null, F={};
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const LS={get(k){try{return localStorage.getItem(k)||''}catch(_){return ''}},set(k,v){try{localStorage.setItem(k,v)}catch(_){}}};
function toast(m){const e=$('#toast');e.textContent=m;e.hidden=false;clearTimeout(toast.h);toast.h=setTimeout(()=>e.hidden=true,2200)}
function ago(ms){if(!ms)return '';const d=(Date.now()-ms)/1000;if(d<60)return 'たった今';if(d<3600)return Math.floor(d/60)+'分前';if(d<86400)return Math.floor(d/3600)+'時間前';if(d<86400*30)return Math.floor(d/86400)+'日前';const t=new Date(ms);return (t.getMonth()+1)+'/'+t.getDate()}
const DB=()=>S.isAdmin?F.adminDb:F.db;
const TS=()=>firebase.database.ServerValue.TIMESTAMP;

/* ---------- Firebase ---------- */
function fbInit(){
  if(!window.firebase||!window.FB_CONFIG||!window.FB_CONFIG.apiKey){S.fail='設定が読み込めませんでした';return false}
  firebase.initializeApp(window.FB_CONFIG);F.db=firebase.database();F.auth=firebase.auth();
  const a2=firebase.initializeApp(window.FB_CONFIG,'admin');F.adminAuth=a2.auth();F.adminDb=a2.database();
  return true;
}
function listen(){
  const n={tierTopics:'topics',tierItems:'items',tierLists:'lists'},got=new Set();
  Object.keys(n).forEach(p=>F.db.ref(p).on('value',sn=>{S[n[p]]=sn.val()||{};got.add(p);if(!S.ready&&got.size===3){S.ready=true;seedOnce()}render()},e=>{S.fail='読み込めませんでした（'+(e&&e.code||'')+'）';render()}));
}
async function boot(){
  if(!fbInit()){render();return}
  readURL();render();
  try{await F.auth.signInAnonymously();S.uid=F.auth.currentUser.uid}catch(e){S.fail='接続できませんでした。電波を確認して開き直してね';render();return}
  F.adminAuth.onAuthStateChanged(u=>{S.isAdmin=!!(u&&u.email===ADMIN_EMAIL);render()});
  listen();
  // 画面を閉じて60秒で接続を切る（同時接続数の節約）
  let h=null;document.addEventListener('visibilitychange',()=>{clearTimeout(h);if(document.hidden)h=setTimeout(()=>{F.db.goOffline();F.adminDb.goOffline()},60000);else{F.db.goOnline();F.adminDb.goOnline()}});
}
// 書けたらすぐ手元にも反映（読み込みの通知を待たずに次の画面へ進めるように）
function applyLocal(up){const n={tierTopics:'topics',tierItems:'items',tierLists:'lists'};
  Object.keys(up).forEach(p=>{const ss=p.split('/'),k=n[ss.shift()];if(!k)return;let o=S[k];
    for(let i=0;i<ss.length-1;i++)o=o[ss[i]]=o[ss[i]]||{};
    const v=up[p]==null?null:JSON.parse(JSON.stringify(up[p],(kk,vv)=>vv&&vv['.sv']?Date.now():vv));
    if(v==null)delete o[ss[ss.length-1]];else o[ss[ss.length-1]]=v})}
async function save(up,okMsg,db){
  try{await (db||DB()).ref().update(up);applyLocal(up);if(okMsg)toast(okMsg);return true}
  catch(e){toast(/PERMISSION|permission/.test(e&&(e.code||e.message)||'')?'保存できませんでした（権限がありません）':'保存できませんでした。電波を確認してね');return false}
}

/* ---------- 見本「学食情弱ティア表」（?seed=gakushoku で開いた端末が作る。もうあれば何もしない） ---------- */
async function seedOnce(){
  if(new URLSearchParams(location.search).get('seed')!=='gakushoku')return;
  const NAME='学食情弱ティア表',WHO='なおや';
  const old=Object.entries(S.topics).find(([,v])=>v.name===NAME);
  if(old){toast('もう入っています');return go({view:'topic',tid:old[0]})}
  const rank={S:['チキン竜田丼','麺類'],A:['ハンバーグ丼'],C:['丼もの'],D:['ロースカツ','おかず類']};
  const tid=F.db.ref('tierTopics').push().key,up={['tierTopics/'+tid]:{name:NAME,by:WHO,uid:S.uid,createdAt:TS()}},r={};
  Object.entries(rank).forEach(([k,ns])=>ns.forEach(t=>{const iid=F.db.ref('tierItems/'+tid).push().key;up['tierItems/'+tid+'/'+iid]={t,uid:S.uid,createdAt:TS()};r[iid]=k}));
  // お題 → アイテム → 表 の順に書く（アイテムと表はお題があることをルールで確認するため）
  const step=pre=>Object.fromEntries(Object.entries(up).filter(([p])=>p.startsWith(pre)));
  if(!await save(step('tierTopics/'),null,F.db)||!await save(step('tierItems/'),null,F.db))return;
  if(!await save({['tierLists/'+tid+'/'+S.uid]:{who:WHO,uid:S.uid,r,createdAt:TS(),updatedAt:TS()}},'見本を入れました',F.db))return;
  LS.set('tier_who',WHO);go({view:'topic',tid});
}

/* ---------- URL（?t=お題&l=だれの） ---------- */
function readURL(){const q=new URLSearchParams(location.search);const t=q.get('t'),l=q.get('l');
  if(t){V.tid=t;V.view=l==='avg'?'avg':l?'list':'topic';V.lid=l&&l!=='avg'?l:null}}
function writeURL(){const q=new URLSearchParams();if(V.tid&&V.view!=='home'){q.set('t',V.tid);if(V.view==='avg')q.set('l','avg');if(V.view==='list')q.set('l',V.lid)}
  const s=q.toString();try{history.replaceState(null,'',location.pathname+(s?'?'+s:''))}catch(_){}}
function shareURL(){const q=new URLSearchParams();q.set('t',V.tid);if(V.view==='avg')q.set('l','avg');if(V.view==='list')q.set('l',V.lid);q.set('openExternalBrowser','1');
  return location.origin+location.pathname+'?'+q.toString()}
function go(o){Object.assign(V,o);E=null;writeURL();render();window.scrollTo(0,0)}

/* ---------- 計算 ---------- */
const T=()=>S.topics[V.tid];
const itemsOf=tid=>Object.entries(S.items[tid]||{}).map(([id,v])=>({id,t:v.t,uid:v.uid,at:v.createdAt||0})).sort((a,b)=>a.at-b.at);
const listsOf=tid=>Object.entries(S.lists[tid]||{}).map(([id,v])=>({id,who:v.who,r:v.r||{},at:v.updatedAt||v.createdAt||0})).sort((a,b)=>b.at-a.at);
function avg(tid){
  const ls=listsOf(tid),r={},sc={};
  itemsOf(tid).forEach(it=>{const v=ls.map(l=>l.r[it.id]).filter(k=>PT[k]).map(k=>PT[k]);if(!v.length)return;
    const a=v.reduce((x,y)=>x+y,0)/v.length;sc[it.id]={a,n:v.length};r[it.id]=a>=4.5?'S':a>=3.5?'A':a>=2.5?'B':a>=1.5?'C':'D'});
  return{r,sc,n:ls.length};
}

/* ---------- 描画 ---------- */
function tierHTML(items,r,opt={}){
  return '<div class="card tier">'+TIERS.map(k=>{
    const its=items.filter(it=>r[it.id]===k);
    if(opt.sc)its.sort((a,b)=>opt.sc[b.id].a-opt.sc[a.id].a);
    return `<div class="row${opt.edit&&E.sel?' target':''}" data-tier="${k}"><div class="lab ${k}">${k}</div><div class="cells">`+
      its.map(it=>chip(it,opt)).join('')+'</div></div>'}).join('')+'</div>';
}
function chip(it,opt={}){
  const s=opt.sc&&opt.sc[it.id];
  if(opt.edit)return `<button class="it${E.sel===it.id?' sel':''}" draggable="true" data-id="${it.id}">${esc(it.t)}</button>`;
  return `<span class="it">${esc(it.t)}${s?`<span class="sc">${s.a.toFixed(1)}</span>`:''}</span>`;
}
const backBtn=to=>`<button class="btn back" data-go="${to}" aria-label="もどる">‹</button>`;
function render(){
  const a=$('#app');let h='';
  if(S.fail)h+=`<div class="mockbar">${esc(S.fail)}</div>`;
  if(V.view!=='home'&&S.ready&&!T()){V.view='home';writeURL()}
  if(V.view!=='home'&&!S.ready){a.innerHTML=h+'<div class="hint">読み込み中…</div>';return}
  if(V.view==='home'){
    const ts=Object.entries(S.topics).map(([id,v])=>({id,...v})).sort((x,y)=>(y.createdAt||0)-(x.createdAt||0));
    h+=`<div class="top"><div class="brand"><h1>ティア表<span>北見工大 軽音</span></h1></div></div>
    <div class="sec-h"><h3>お題</h3><span>${S.ready?ts.length+'件':'読み込み中…'}</span></div><div class="topics">`+
    (S.ready&&!ts.length?'<div class="card hint" style="padding:14px">まだお題がありません。下から最初のお題を作ってね</div>':'')+
    ts.map(t=>`<button class="card topic" data-topic="${t.id}">
      <div class="minis">${TIERS.map(k=>`<i style="background:var(--t${k})"></i>`).join('')}</div>
      <div class="tt"><b>${esc(t.name)}</b><small>${listsOf(t.id).length}人が作成・アイテム${itemsOf(t.id).length}個・作った人 ${esc(t.by)}</small></div><span class="muted">›</span></button>`).join('')+
    `</div><div class="sec-h"><h3>新しいお題を作る</h3></div>
    <div class="card newtopic"><input id="newtopic" placeholder="例：学食情弱ティア表" maxlength="30"><input id="topicby" class="by" placeholder="名前" maxlength="12" value="${esc(LS.get('tier_who'))}"><button class="btn primary" id="mk">作る</button></div>`+
    adminHTML();
  }
  else if(V.view==='topic'){
    const t=T()||{name:'読み込み中…'},A=avg(V.tid),ls=listsOf(V.tid),mine=S.lists[V.tid]&&S.lists[V.tid][S.uid];
    h+=`<div class="crumb">${backBtn('home')}<h2>${esc(t.name)}</h2></div>
    <button class="btn primary" id="new" style="align-self:flex-start">${mine?'自分のティア表を直す':'＋ 自分のティア表を作る'}</button>`+
    (ls.length?`<button class="card avgcard" data-avg="1"><div class="tt"><b>みんなの平均</b><small>${A.n}人ぶんをまとめた結果。S=5〜D=1点の平均</small></div><span class="badge">まとめ</span></button>`:'')+
    `<div class="sec-h"><h3>みんなのティア表</h3><span>${ls.length?'新しい順':''}</span></div>`+
    (ls.length?'<div class="lists">'+ls.map(l=>`<button class="card lcard" data-list="${l.id}">
      <div class="who"><b>${esc(l.who)}${l.id===S.uid?' <span class="badge">自分</span>':''}</b><small>${ago(l.at)}</small></div>
      <div class="sum">`+['S','A'].map(k=>{const n=itemsOf(V.tid).filter(it=>l.r[it.id]===k).map(it=>esc(it.t));return n.length?`<div><em>${k}</em>${n.join('・')}</div>`:''}).join('')+`</div></button>`).join('')+'</div>'
     :'<div class="hint">まだだれも作っていません。最初の1人になろう</div>')+
    `<div class="save" style="margin-top:18px"><button class="btn sm danger" data-del-topic="1">このお題を消す</button></div>`;
  }
  else if(V.view==='list'||V.view==='avg'){
    const t=T()||{name:''},items=itemsOf(V.tid);let r,title,sub,sc,own=false;
    if(V.view==='avg'){const A=avg(V.tid);r=A.r;sc=A.sc;title='みんなの平均';sub=A.n+'人ぶん。数字は平均点（S=5〜D=1）'}
    else{const l=(S.lists[V.tid]||{})[V.lid];if(!l){h+=`<div class="crumb">${backBtn('topic')}<h2>見つかりません</h2></div><div class="hint">消されたみたいです</div>`;a.innerHTML=h;return}
      r=l.r||{};title=l.who+' のティア表';sub=ago(l.updatedAt||l.createdAt);own=V.lid===S.uid}
    const un=items.filter(it=>!r[it.id]);
    h+=`<div class="crumb">${backBtn('topic')}<h2>${esc(title)}</h2></div>
    <div class="muted" style="margin-top:-8px">${esc(t.name)}・${esc(sub)}</div>`+tierHTML(items,r,{sc})+
    (un.length?`<div class="hint">${V.view==='avg'?'まだだれも置いていないもの':'置いていないもの'}：${un.map(it=>esc(it.t)).join('・')}</div>`:'')+
    `<div class="save"><button class="btn" id="img">画像で保存</button><button class="btn" id="copy">リンクをコピー</button>`+
    (own?`<button class="btn" id="new">直す</button>`:'')+((own||S.isAdmin)&&V.view==='list'?`<button class="btn danger" id="dellist">消す</button>`:'')+'</div>';
  }
  else if(V.view==='edit'){
    const t=T()||{name:''},items=itemsOf(V.tid),pool=items.filter(it=>!E.r[it.id]);
    h+=`<div class="crumb">${backBtn('topic')}<h2>${esc(t.name)}</h2></div>
    <div class="hint" style="margin-top:-6px">${E.sel?'入れたい段をタップ（下の箱をタップで戻す）':'アイテムをタップして選ぶ → 段をタップ。PCはドラッグでもOK'}</div>`+
    tierHTML(items,E.r,{edit:true})+
    `<div class="card pool${E.sel&&E.r[E.sel]?' target':''}" data-tier=""><div class="sec-h" style="margin:0"><h3>まだ置いてないもの</h3><span>${pool.length}個</span></div>
      <div class="cells">${pool.map(it=>chip(it,{edit:true})).join('')||'<span class="hint">'+(items.length?'全部置けました':'まだアイテムがありません。下から追加してね')+'</span>'}</div>
      <div class="additem"><input id="additem" placeholder="アイテムを追加（みんなのお題に増えます）" maxlength="20"><button class="btn sm" id="add">追加</button></div>`+
      (E.sel&&canDelItem(E.sel)?`<div class="save"><button class="btn sm danger" id="delitem">選んでいる「${esc((items.find(i=>i.id===E.sel)||{}).t)}」をお題から消す</button></div>`:'')+
    `</div><div class="save"><input id="who" placeholder="名前（例：なおや）" maxlength="12" value="${esc(E.who)}"><button class="btn primary" id="save">保存する</button></div>`;
  }
  a.innerHTML=h;
}
function canDelItem(id){return !!(S.items[V.tid]||{})[id]}
function adminHTML(){
  if(S.isAdmin)return `<div class="admin">運営としてログイン中（だれのティア表でも消せます）<button class="btn sm" id="logout">ログアウト</button></div>`;
  return `<details class="admin"><summary>運営</summary><div class="save" style="margin-top:8px"><input id="pin" type="password" placeholder="運営の暗証番号" autocomplete="current-password"><button class="btn sm" id="login">ログイン</button></div></details>`;
}

/* ---------- 画像 ---------- */
function drawImage(){
  const t=T(),items=itemsOf(V.tid);let r,title,sc=null;
  if(V.view==='avg'){const A=avg(V.tid);r=A.r;sc=A.sc;title='みんなの平均（'+A.n+'人）'}else{const l=S.lists[V.tid][V.lid];r=l.r||{};title=l.who}
  const W=1080,LW=130,P=22,G=12,CH=58,FS=30,FF="'Zen Kaku Gothic New','Hiragino Kaku Gothic ProN',sans-serif";
  const css=getComputedStyle(document.documentElement),col=k=>css.getPropertyValue('--t'+k).trim();
  const c=document.createElement('canvas'),x=c.getContext('2d');x.font=`700 ${FS}px ${FF}`;
  const rows=TIERS.map(k=>{let its=items.filter(it=>r[it.id]===k);if(sc)its.sort((a,b)=>sc[b.id].a-sc[a.id].a);
    const lines=[[]];let cx=LW+P;its.forEach(it=>{const w=Math.min(W-LW-2*P,x.measureText(it.t).width+36);if(cx+w>W-P&&lines[lines.length-1].length){lines.push([]);cx=LW+P}lines[lines.length-1].push({t:it.t,w});cx+=w+G});
    return{k,lines,h:Math.max(110,P*2+lines.length*CH+(lines.length-1)*G)}});
  const HEAD=150;c.width=W;c.height=HEAD+rows.reduce((s,o)=>s+o.h,0)+60;
  x.fillStyle='#ffffff';x.fillRect(0,0,W,c.height);
  x.fillStyle='#161a24';x.font=`900 46px ${FF}`;x.fillText(t.name,40,70);x.font=`500 30px ${FF}`;x.fillStyle='#5d6577';x.fillText(title,40,118);
  let y=HEAD;rows.forEach((o,i)=>{x.fillStyle=['#e0525a','#ef8a3c','#e8c43f','#5fb46a','#4f86d9'][i];x.fillRect(0,y,LW,o.h);
    x.fillStyle='#161a24';x.font=`500 54px 'DM Mono',monospace`;x.textAlign='center';x.fillText(o.k,LW/2,y+o.h/2+19);x.textAlign='left';
    x.fillStyle=i%2?'#f6f7fa':'#ffffff';x.fillRect(LW,y,W-LW,o.h);
    x.font=`700 ${FS}px ${FF}`;o.lines.forEach((ln,j)=>{let cx=LW+P;const cy=y+P+j*(CH+G);ln.forEach(ch=>{x.fillStyle='#eef1fb';rr(x,cx,cy,ch.w,CH,10);x.fill();x.strokeStyle='#d9dce5';x.lineWidth=2;x.stroke();
      x.fillStyle='#161a24';x.save();x.beginPath();x.rect(cx,cy,ch.w,CH);x.clip();x.fillText(ch.t,cx+18,cy+CH/2+11);x.restore();cx+=ch.w+G})});
    y+=o.h;x.fillStyle='#d9dce5';x.fillRect(0,y-1,W,2)});
  x.fillStyle='#9aa3b6';x.font=`500 24px ${FF}`;x.fillText('北見工大 軽音ティア表',40,c.height-22);
  return c;
}
function rr(x,a,b,w,h,r){x.beginPath();x.moveTo(a+r,b);x.arcTo(a+w,b,a+w,b+h,r);x.arcTo(a+w,b+h,a,b+h,r);x.arcTo(a,b+h,a,b,r);x.arcTo(a,b,a+w,b,r);x.closePath()}
async function saveImage(){
  const c=drawImage(),name=(T().name||'tier')+'.png';
  const blob=await new Promise(r=>c.toBlob(r,'image/png'));
  try{const f=new File([blob],name,{type:'image/png'});if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f]});return}}catch(e){if(e&&e.name==='AbortError')return}
  const u=URL.createObjectURL(blob),ov=$('#overlay');ov.innerHTML=`<div class="ovbox"><img src="${u}" alt="ティア表の画像"><div class="hint">画像を長押しで保存できます</div><div class="save"><a class="btn primary" href="${u}" download="${esc(name)}">ダウンロード</a><button class="btn" id="ovclose">閉じる</button></div></div>`;ov.hidden=false;
}

/* ---------- 操作 ---------- */
function syncWho(){const w=$('#who');if(w&&E)E.who=w.value}
document.addEventListener('click',async e=>{
  const el=e.target.closest('button,[data-tier]');if(!el)return;
  if(el.id==='ovclose'){$('#overlay').hidden=true;return}
  if(el.dataset.topic)return go({view:'topic',tid:el.dataset.topic});
  if(el.dataset.go)return go({view:el.dataset.go});
  if(el.dataset.list)return go({view:'list',lid:el.dataset.list});
  if(el.dataset.avg)return go({view:'avg'});
  if(el.id==='login'){const p=$('#pin').value;if(!p)return;try{await F.adminAuth.signInWithEmailAndPassword(ADMIN_EMAIL,p);toast('運営としてログインしました')}catch(_){toast('暗証番号がちがいます')}return}
  if(el.id==='logout'){await F.adminAuth.signOut();return toast('ログアウトしました')}
  if(el.id==='mk'){const v=$('#newtopic').value.trim();if(!v)return toast('お題の名前を入れてね');if(!S.uid)return toast('接続中です。少し待ってね');
    const by=$('#topicby').value.trim();if(!by)return toast('名前を入れてね');LS.set('tier_who',by);
    const id=DB().ref('tierTopics').push().key;
    if(await save({['tierTopics/'+id]:{name:v,by,uid:S.isAdmin?F.adminAuth.currentUser.uid:S.uid,createdAt:TS()}},'お題を作りました'))go({view:'topic',tid:id});return}
  if(el.id==='new'){const mine=(S.lists[V.tid]||{})[S.uid];V.view='edit';writeURL();E={r:mine?{...(mine.r||{})}:{},sel:null,who:mine?mine.who:LS.get('tier_who')};render();return window.scrollTo(0,0)}
  if(el.id==='copy'){const u=shareURL();try{await navigator.clipboard.writeText(u);toast('リンクをコピーしました')}catch(_){window.prompt('このリンクをコピーしてね',u)}return}
  if(el.id==='img'){saveImage();return}
  if(el.id==='dellist'){if(!confirm('このティア表を消しますか？'))return;if(await save({['tierLists/'+V.tid+'/'+V.lid]:null},'消しました'))go({view:'topic'});return}
  if(el.dataset.delTopic){if(!confirm('お題「'+T().name+'」と、その中のティア表を全部消しますか？'))return;
    if(await save({['tierTopics/'+V.tid]:null,['tierItems/'+V.tid]:null,['tierLists/'+V.tid]:null},'お題を消しました'))go({view:'home'});return}
  if(V.view!=='edit'||!E)return;
  syncWho();
  if(el.id==='add'){const v=$('#additem').value.trim();if(!v)return;
    if(itemsOf(V.tid).some(it=>it.t===v))return toast('「'+v+'」はもうあります');
    const id=DB().ref('tierItems/'+V.tid).push().key,me=S.isAdmin?F.adminAuth.currentUser.uid:S.uid;
    if(await save({['tierItems/'+V.tid+'/'+id]:{t:v,uid:me,createdAt:TS()}},'「'+v+'」を追加しました')){render();const i=$('#additem');if(i)i.focus()}return}
  if(el.id==='delitem'){const it=(S.items[V.tid]||{})[E.sel];if(!it||!confirm('「'+it.t+'」をお題から消しますか？（みんなの表からも消えます）'))return;
    const id=E.sel;if(await save({['tierItems/'+V.tid+'/'+id]:null},'消しました')){delete E.r[id];E.sel=null;render()}return}
  if(el.id==='save'){const w=E.who.trim();if(!w)return toast('名前を入れてね');if(!S.uid)return toast('接続中です。少し待ってね');
    const old=(S.lists[V.tid]||{})[S.uid],r={};Object.keys(E.r).forEach(k=>{if((S.items[V.tid]||{})[k])r[k]=E.r[k]});
    LS.set('tier_who',w);
    if(await save({['tierLists/'+V.tid+'/'+S.uid]:{who:w,uid:S.uid,r,createdAt:old&&old.createdAt||TS(),updatedAt:TS()}},'保存しました',F.db))go({view:'list',lid:S.uid});return}
  if(el.classList.contains('it')){E.sel=E.sel===el.dataset.id?null:el.dataset.id;e.stopPropagation();return render()}
  if(el.dataset.tier!==undefined&&E.sel){place(E.sel,el.dataset.tier);E.sel=null;render()}
});
function place(id,k){if(k)E.r[id]=k;else delete E.r[id]}
document.addEventListener('keydown',e=>{if(e.key!=='Enter'||e.isComposing)return;const id=e.target.id;
  if(id==='additem')$('#add').click();else if(id==='newtopic')$('#mk').click();else if(id==='pin')$('#login').click()});
let dragId=null;
document.addEventListener('dragstart',e=>{const it=e.target.closest('.it[data-id]');if(!it)return;dragId=it.dataset.id;it.classList.add('drag');try{e.dataTransfer.setData('text/plain',dragId)}catch(_){}});
document.addEventListener('dragend',()=>{dragId=null;document.querySelectorAll('.drag').forEach(x=>x.classList.remove('drag'))});
document.addEventListener('dragover',e=>{if(dragId&&e.target.closest('[data-tier]'))e.preventDefault()});
document.addEventListener('drop',e=>{const z=e.target.closest('[data-tier]');if(!z||!dragId||!E)return;e.preventDefault();syncWho();place(dragId,z.dataset.tier);E.sel=null;dragId=null;render()});
boot();
