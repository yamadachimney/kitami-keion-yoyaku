
/* =====================================================================
   メニュー：部室予約／ライブ／備品リクエスト
   ===================================================================== */
const L={idx:{},live:null,liveId:'',tpls:{},sup:{},sub:'',refs:{},arm:'',showDone:false,ckMode:'out'};
const MODES=[
  ['yoyaku','部室予約','練習の予約・今日だれが使ってるか'],
  ['live','ライブ','セトリ提出・タイムテーブル・当日の進行・持ち出し機材'],
  ['supply','備品リクエスト','足りないもの・壊れたものを運営に伝える']
];
const PARTS=['Vo.','Cho.','MC','EGt.','Ba.','Dr.','Key.','その他'];
const GEARK={club:'部のもの',own:'私物',venue:'会場のもの'};
const PRI={high:'優先度（高）',mid:'優先度（中）',low:'優先度（小）'};
const SUPST={new:'新着',seen:'確認した',ordered:'注文済み',done:'届いた'};
const SUPNEXT={new:'seen',seen:'ordered',ordered:'done'};

function modeName(m){const x=MODES.find(a=>a[0]===m);return x?x[1]:''}
function openMenu(){
  layer(h('div',{class:'sheet',role:'dialog','aria-modal':'true','aria-label':'メニュー'},[
    h('h3',{text:'メニュー'}),
    h('div',{class:'menu'},MODES.map(m=>h('button',{class:'mitem'+(S.mode===m[0]?' on':''),onclick:()=>setMode(m[0])},[
      h('b',{text:m[1]}),h('span',{text:m[2]})]))),
    h('div',{class:'row',style:'justify-content:flex-end'},[h('button',{class:'btn',onclick:closeSheet,text:'閉じる'})])
  ]));
}
function setMode(m){
  S.mode=m;lsSet('kitami-mode',m);closeSheet();
  if(m!=='live'){L.liveId='';}
  subscribeMode();render();window.scrollTo(0,0);
}
function sub(path,cb){
  if(L.refs[path]||!FBX.db)return;
  const r=FBX.db.ref(path);L.refs[path]=r;
  r.on('value',s=>{cb(s.val());render()},()=>{toast('読み込めませんでした。開き直してください')});
}
function unsub(path){const r=L.refs[path];if(r){r.off();delete L.refs[path]}}
function subscribeMode(){
  if(!FBX.db||!S.uid)return;
  const want=new Set();
  if(S.mode==='live'){want.add('liveIdx');want.add('tpls');if(L.liveId)want.add('lives/'+L.liveId)}
  if(S.mode==='supply')want.add('supplies');
  Object.keys(L.refs).forEach(p=>{if(!want.has(p))unsub(p)});
  if(want.has('liveIdx'))sub('liveIdx',v=>{L.idx=v||{}});
  if(want.has('tpls'))sub('tpls',v=>{L.tpls=v||{};if($('layer').querySelector('[data-s=tpllist]'))openTplList()});
  if(L.liveId&&want.has('lives/'+L.liveId)){const id=L.liveId;sub('lives/'+id,v=>{if(L.liveId===id)L.live=v})}
  if(want.has('supplies'))sub('supplies',v=>{L.sup=v||{}});
}
async function put(up,msg){
  try{await DB().ref().update(up);if(msg)toast(msg);return true}
  catch(e){toast(String(e&&e.code||e).indexOf('PERMISSION')>=0?'保存できませんでした（権限がないか、受付が締め切られています）':'保存できませんでした。電波を確認してください');return false}
}
function newKey(path){return FBX.db.ref(path).push().key}

/* ---------- 時間の小道具 ---------- */
function hm(m){if(m==null||isNaN(m))return '--:--';m=Math.round(m);const d=((m%1440)+1440)%1440;return Math.floor(d/60)+':'+pad(d%60)}
function parseHM(s){const m=/^(\d{1,2}):(\d{2})$/.exec(String(s||'').trim());return m?(+m[1])*60+(+m[2]):null}
function secOf(s){
  s=String(s||'').trim().replace('：',':');if(!s)return 0;
  let m=/^(\d{1,3}):(\d{1,2})$/.exec(s);if(m)return (+m[1])*60+(+m[2]);
  m=/^(\d{1,3})$/.exec(s);if(m)return (+m[1])*60;
  return 0;
}
function fmtSec(t){t=Math.max(0,Math.round(t||0));return Math.floor(t/60)+':'+pad(t%60)}
function minLabel(n){n=Math.round(n);const h=Math.floor(n/60),m=n%60;return (h?h+'時間':'')+(m||!h?m+'分':'')}
function dateLabel(iso){if(!iso)return '';const d=new Date(iso+'T00:00:00');return (d.getMonth()+1)+'/'+d.getDate()+'（'+'日月火水木金土'[d.getDay()]+'）'}
function midnightMs(iso){return new Date(iso+'T00:00:00').getTime()}
function todayIso(){return isoOf(new Date())}
function nowMinOn(iso){return (Date.now()-midnightMs(iso))/60000}

/* ---------- ライブの計算 ---------- */
function cfgOf(lv){return (lv&&lv.cfg)||{}}
function entriesOf(lv){const e=(lv&&lv.entries)||{};return Object.keys(e).map(id=>Object.assign({id:id},e[id]))}
function songsOf(e){return Array.isArray(e.songs)?e.songs.filter(Boolean):Object.values(e.songs||{})}
function membersOf(e){return Array.isArray(e.members)?e.members.filter(Boolean):Object.values(e.members||{})}
function gearOf(e){return Array.isArray(e.gear)?e.gear.filter(Boolean):Object.values(e.gear||{})}
function setSec(e){return songsOf(e).reduce((a,s)=>a+(+s.sec||0),0)}
/* 本番の日（複数日OK）。古い形（cfg.date/open）も読めるようにしておく */
function daysOf(lv){
  const c=cfgOf(lv);let d=c.days;
  if(d&&!Array.isArray(d))d=Object.keys(d).sort((a,b)=>a-b).map(k=>d[k]);
  if(d&&d.filter(Boolean).length)return d.filter(Boolean);
  return [{date:c.date||todayIso(),anchor:'open',open:c.open!=null?+c.open:1080,gap:0}];
}
function dayOfEntry(lv,e){const n=daysOf(lv).length,d=+e.day||0;return d<0?0:d>=n?n-1:d}
function dayName(lv,d){const ds=daysOf(lv);return ds.length>1?(d+1)+'日目 '+dateLabel(ds[d].date):dateLabel(ds[d].date)}
function showOrder(lv,d){
  const es=entriesOf(lv),ids=new Set(es.map(x=>x.id));
  const ord=(cfgOf(lv).order||[]).filter((id,i,a)=>ids.has(id)&&a.indexOf(id)===i);
  const rest=es.filter(x=>ord.indexOf(x.id)<0).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)).map(x=>x.id);
  const all=ord.concat(rest).map(id=>es.find(x=>x.id===id));
  return d==null?all:all.filter(e=>dayOfEntry(lv,e)===d);
}
function rehList(lv,d){
  const so=showOrder(lv,d),c=cfgOf(lv),m=c.rehMode||'reverse';
  if(m==='same')return so;
  if(m==='custom'){
    const ids=new Set(so.map(x=>x.id));
    const ord=(c.rehOrder||[]).filter((id,i,a)=>ids.has(id)&&a.indexOf(id)===i);
    const rest=so.slice().reverse().filter(x=>ord.indexOf(x.id)<0).map(x=>x.id);
    return ord.concat(rest).map(id=>so.find(x=>x.id===id));
  }
  return so.slice().reverse();
}
function slotMin(lv,e){const c=cfgOf(lv);return c.slotMode==='fixed'?(+c.fixedMin||0):Math.ceil(setSec(e)/60)}
function isOver(lv,e){const c=cfgOf(lv);return c.slotMode==='fixed'&&setSec(e)>(+c.fixedMin||0)*60}
/* 1バンドの持ち時間の目安（何バンド入るかの計算用） */
function avgMin(lv,d){
  const c=cfgOf(lv);if(c.slotMode==='fixed')return +c.fixedMin||0;
  let es=showOrder(lv,d).filter(e=>setSec(e)>0);if(!es.length)es=showOrder(lv).filter(e=>setSec(e)>0);
  if(!es.length)return +c.estMin||20;
  return Math.ceil(es.reduce((a,e)=>a+setSec(e),0)/es.length/60);
}
/* その日の開演・リハ開始。どちらか一方を決めると、もう一方はバンド数から自動で決まる */
function dayTimes(lv,d){
  const c=cfgOf(lv),dy=daysOf(lv)[d]||{},n=showOrder(lv,d).length,rm=+c.rehMin||0,gap=+dy.gap||0;
  let open,reh;
  if(dy.anchor==='reh'&&dy.rehStart!=null){reh=+dy.rehStart;open=reh+(rm?n*rm:0)+gap}
  else{open=dy.open!=null?+dy.open:1080;reh=open-gap-n*rm}
  if(!rm)reh=null;
  return {open:open,reh:reh,date:dy.date||todayIso(),start:dy.start!=null&&dy.start!==''?+dy.start:null,end:dy.end!=null&&dy.end!==''?+dy.end:null,gap:gap,n:n,anchor:dy.anchor==='reh'?'reh':'open'};
}
/* 使える時間の中に何バンド入るか */
function capacity(lv,d){
  const t=dayTimes(lv,d);if(t.start==null||t.end==null||t.end<=t.start)return null;
  const c=cfgOf(lv),rm=+c.rehMin||0,ch=+c.changeMin||0,avg=avgMin(lv,d);
  const W=t.end-t.start,per=rm+avg+ch;
  const N=per>0?Math.max(0,Math.floor((W-t.gap+ch)/per)):0;
  return {W:W,avg:avg,N:N,n:t.n,rm:rm,ch:ch,gap:t.gap};
}
function runEnd(lv,d){const r=(lv&&lv.run)||{};if(r.end==null)return null;if(typeof r.end==='number')return d===0?r.end:null;return (Array.isArray(r.end)?r.end[d]:r.end[d])||null}
/* 予定（ps,pe）と、実際の開始を反映した見込み（s,en） */
function schedule(lv,d){
  const c=cfgOf(lv),run=(lv&&lv.run)||{},t=dayTimes(lv,d),mid=midnightMs(t.date);
  const act=ms=>ms==null?null:(ms-mid)/60000;
  const rehMin=+c.rehMin||0,chg=+c.changeMin||0;
  const reh=[],show=[];
  let p=t.reh,q=p;
  if(p!=null)rehList(lv,d).forEach(e=>{
    const a=act((run.reh||{})[e.id]);const s=a!=null?a:q;
    reh.push({e:e,ps:p,pe:p+rehMin,s:s,en:s+rehMin,a:a!=null});
    p+=rehMin;q=s+rehMin;
  });
  p=t.open;q=p;
  showOrder(lv,d).forEach(e=>{
    const dd=slotMin(lv,e),a=act((run.show||{})[e.id]);const s=a!=null?a:q;
    show.push({e:e,ps:p,pe:p+dd,s:s,en:s+dd,d:dd,a:a!=null});
    p+=dd+chg;q=s+dd+chg;
  });
  const endPlan=show.length?show[show.length-1].pe:null,endProj=show.length?show[show.length-1].en:null;
  return {t:t,reh:reh,show:show,endPlan:endPlan,endProj:endProj,ended:runEnd(lv,d)};
}
/* いまの状態：最後に「開始」が押されたもの */
function liveState(lv,d){
  const sc=schedule(lv,d),seq=sc.reh.map(x=>Object.assign({ph:'reh'},x)).concat(sc.show.map(x=>Object.assign({ph:'show'},x)));
  let last=-1;seq.forEach((x,i)=>{if(x.a)last=i});
  const cur=last>=0?seq[last]:null,next=seq[last+1]||null;
  const delay=cur?Math.round(cur.s-cur.ps):0;
  return {sc:sc,seq:seq,cur:cur,next:next,delay:delay,idx:last};
}

/* =====================================================================
   画面
   ===================================================================== */
function modeView(){
  if(S.mode==='supply')return supplyView();
  if(S.mode==='live')return L.liveId?liveView():liveListView();
  return h('div');
}

/* ---------- ライブ一覧 ---------- */
function idxDates(x){return String(x.dates||x.date||'').split(',').filter(Boolean).sort()}
function liveListView(){
  const t=todayIso();
  const arr=Object.keys(L.idx||{}).map(id=>Object.assign({id:id},L.idx[id]));
  const last=x=>{const d=idxDates(x);return d[d.length-1]||''},first=x=>idxDates(x)[0]||'';
  const up=arr.filter(x=>last(x)>=t).sort((a,b)=>first(a).localeCompare(first(b)));
  const past=arr.filter(x=>last(x)<t).sort((a,b)=>last(b).localeCompare(last(a)));
  const kids=[h('div',{class:'mhead'},[h('h2',{text:'ライブ'}),S.isAdmin?h('button',{class:'btn primary',onclick:()=>openLiveCfg(null),text:'＋ ライブを作る'}):null])];
  const item=x=>{const ds=idxDates(x),isT=ds.indexOf(t)>=0;
    return h('button',{class:'lvitem'+(isT?' today':''),onclick:()=>openLive(x.id)},[
    h('div',{class:'lvdate'},[dateLabel(ds[0]),ds.length>1?h('small',{text:'ほか'+(ds.length-1)+'日'}):null]),
    h('div',{class:'lvbody'},[h('b',{text:x.name||'（名前なし）'}),h('span',{text:[x.venue,ds.length>1?ds.map(dateLabel).join('・'):'',isT?'今日':''].filter(Boolean).join('　')})]),
    h('span',{class:'lvgo',text:'›'})])};
  if(!up.length&&!past.length)kids.push(h('div',{class:'card'},[h('p',{text:S.isAdmin?'まだライブがありません。「＋ ライブを作る」から作ってください。':'まだライブがありません。運営がライブを作ると、ここに出てきます。'})]));
  if(up.length)kids.push(h('div',{class:'lvlist'},up.map(item)));
  if(past.length)kids.push(h('details',{class:'past'},[h('summary',{text:'終わったライブ（'+past.length+'）'}),h('div',{class:'lvlist'},past.map(item))]));
  if(S.isAdmin)kids.push(h('div',{class:'card'},[h('h2',{text:'持ち出し機材のテンプレート'}),
    h('p',{text:'会場ごとの持ち出しリストです。ライブを作るときに選ぶと、そのライブのチェックリストになります。'}),
    h('div',{class:'row'},[h('button',{class:'btn',onclick:openTplList,text:'テンプレートを見る・編集'})])]));
  return h('div',{class:'mview'},kids);
}
function openLive(id){
  L.liveId=id;L.live=null;
  const ds=idxDates(L.idx[id]||{}),ti=ds.indexOf(todayIso());
  L.day=ti>=0?ti:0;
  L.sub=ti>=0?'day':'set';
  subscribeMode();render();window.scrollTo(0,0);
}
function curDay(lv){const n=daysOf(lv).length;if(!(L.day>=0&&L.day<n))L.day=0;return L.day}
function daySeg(lv){
  const ds=daysOf(lv);if(ds.length<2)return null;const d=curDay(lv);
  return h('div',{class:'seg dayseg'},ds.map((x,i)=>h('button',{'aria-pressed':String(d===i),onclick:()=>{L.day=i;render()},text:(i+1)+'日目 '+dateLabel(x.date)})));
}

/* ---------- ライブの中 ---------- */
function liveView(){
  const lv=L.live,ix=L.idx[L.liveId]||{};
  const back=h('button',{class:'btn sm',onclick:()=>{L.liveId='';L.live=null;subscribeMode();render()},text:'‹ ライブ一覧'});
  if(!lv||!lv.cfg)return h('div',{class:'mview'},[back,h('div',{class:'empty-hint',text:'読み込み中…'})]);
  const c=lv.cfg,ds=daysOf(lv);
  const tabs=[['day','当日'],['tt','タイムテーブル'],['set','セトリ'],['eq','機材']];
  if(!tabs.some(t=>t[0]===L.sub))L.sub='set';
  const head=h('div',{class:'lvhead'},[back,
    h('div',{class:'lvtitle'},[h('h2',{text:c.name||ix.name||''}),h('span',{text:[ds.map(x=>dateLabel(x.date)).join('・'),c.venue].filter(Boolean).join('　')})]),
    S.isAdmin?h('button',{class:'btn sm',onclick:()=>openLiveCfg(L.liveId),text:'ライブの設定'}):null]);
  const nav=h('nav',{class:'tabs'},tabs.map(t=>h('button',{role:'tab','aria-selected':String(L.sub===t[0]),onclick:()=>{L.sub=t[0];render()},text:t[1]})));
  const body=L.sub==='day'?dayView(lv):L.sub==='tt'?ttView(lv):L.sub==='eq'?eqView(lv):setView(lv);
  return h('div',{class:'mview'},[head,nav,body]);
}

/* ---------- 当日 ---------- */
function dayView(lv){
  const d=curDay(lv),st=liveState(lv,d),ended=runEnd(lv,d);
  const kids=[daySeg(lv)];
  let big,subl,cls='nowcard';
  if(ended){big='終演しました';subl='おつかれさまでした';}
  else if(st.cur){
    big=(st.cur.ph==='reh'?'リハ中':'本番中')+'：'+(st.cur.e.band||'');
    subl=hm(st.cur.s)+'〜'+hm(st.cur.en)+(st.next?'　→ つぎ '+(st.next.ph==='reh'?'リハ ':'')+(st.next.e.band||'')+'（'+hm(st.next.s)+'〜）':'');
    cls+=' busy livebusy';
  }else{
    big=st.next?'まだ始まっていません':'バンドがまだいません';
    subl=st.next?'最初：'+(st.next.ph==='reh'?'リハ ':'本番 ')+(st.next.e.band||'')+'（'+hm(st.next.s)+'〜）':'セトリが出されると、ここに進行が出ます';
  }
  const dl=st.cur&&!ended?st.delay:0;
  kids.push(h('div',{class:cls},[h('div',{class:'nowbig',text:big}),h('div',{class:'nowsub',text:subl}),
    st.cur&&!ended?h('div',{class:'delay'+(dl>0?' late':dl<0?' early':''),text:dl>0?dl+'分押し':dl<0?(-dl)+'分巻き':'予定どおり'}):null]));
  if(S.isAdmin)kids.push(runControls(lv,st,d));
  const sec=(title,list,ph)=>{
    if(!list.length)return null;
    return h('div',{class:'card tight'},[h('h2',{text:title}),h('div',{class:'ttl2'},list.map((x,i)=>{
      const isCur=st.cur&&st.cur.ph===ph&&st.cur.e.id===x.e.id&&!ended;
      const done=x.a&&!isCur;
      return h(S.isAdmin?'button':'div',{class:'tr2'+(isCur?' cur':'')+(done?' done':''),onclick:S.isAdmin?()=>openStartAt(lv,ph,x,st.sc.t.date):null},[
        h('span',{class:'no',text:String(i+1)}),
        h('span',{class:'tm',text:hm(x.s)+'–'+hm(x.en)}),
        h('span',{class:'bn',text:x.e.band||''}),
        h('span',{class:'st',text:isCur?(ph==='reh'?'リハ中':'本番中'):done?'済':(Math.round(x.s-x.ps)>0?'+'+Math.round(x.s-x.ps)+'分':'')})]);
    }))]);
  };
  kids.push(sec('リハ',st.sc.reh,'reh'));
  kids.push(sec('本番（開演 '+hm(st.sc.t.open)+'）',st.sc.show,'show'));
  if(st.sc.endProj!=null)kids.push(h('p',{class:'rank',style:'text-align:center',text:'終演見込み '+hm(st.sc.endProj)+'（予定 '+hm(st.sc.endPlan)+'）'}));
  if(S.isAdmin)kids.push(h('p',{class:'rank',text:'時間がずれたら、行をタップして実際に始まった時間を入れると、そこから後ろが全部ずれます。'}));
  return h('div',{class:'col'},kids);
}
function runControls(lv,st,d){
  const ended=runEnd(lv,d),kids=[],base='lives/'+L.liveId+'/run/';
  const at=(ph,id,ms)=>{const up={};up[base+ph+'/'+id]=ms;return up};
  const endUp=v=>{const up={},r=(lv.run||{}).end;if(typeof r==='number'){const o={};if(v!=null)o[d]=v;up[base+'end']=v==null?null:o}else up[base+'end/'+d]=v;return up};
  if(!ended&&st.next){
    kids.push(h('button',{class:'btn primary bigbtn',onclick:()=>put(at(st.next.ph,st.next.e.id,Date.now()),(st.next.e.band||'')+' を開始しました'),
      text:'▶ '+(st.next.ph==='reh'?'リハ ':'本番 ')+(st.next.e.band||'')+' を開始'}));
  }
  if(!ended&&!st.next&&st.cur&&st.cur.ph==='show')kids.push(h('button',{class:'btn primary bigbtn',onclick:()=>put(endUp(Date.now()),'終演にしました'),text:'■ 終演'}));
  const row=[];
  if(ended)row.push(h('button',{class:'btn sm',onclick:()=>put(endUp(null),'終演を取り消しました'),text:'終演を取り消す'}));
  else if(st.cur)row.push(h('button',{class:'btn sm',onclick:()=>put(at(st.cur.ph,st.cur.e.id,null),'1つ戻しました'),text:'↩ 1つ戻す'}));
  const armed=L.arm==='reset';
  if(st.cur||ended)row.push(h('button',{class:'btn sm danger',onclick:()=>{if(!armed){L.arm='reset';render();return}L.arm='';
    const up={};st.seq.forEach(x=>{up[base+x.ph+'/'+x.e.id]=null});Object.assign(up,endUp(null));put(up,'この日の進行をリセットしました')},text:armed?'もう一度押すとリセット':'進行をリセット'}));
  if(row.length)kids.push(h('div',{class:'row'},row));
  return h('div',{class:'card tight'},[h('h2',{text:'進行（運営）'})].concat(kids));
}
function openStartAt(lv,ph,x,date){
  const cur=(((lv.run||{})[ph])||{})[x.e.id],mid=midnightMs(date);
  const inp=h('input',{type:'time',value:hm(cur!=null?(cur-mid)/60000:x.s).padStart(5,'0')});
  const save=v=>{const up={};up['lives/'+L.liveId+'/run/'+ph+'/'+x.e.id]=v;put(up,v==null?'取り消しました':'時間を入れました');closeSheet()};
  layer(h('div',{class:'sheet',role:'dialog','aria-modal':'true'},[
    h('h3',{text:(ph==='reh'?'リハ：':'本番：')+(x.e.band||'')}),
    h('div',{class:'rank',text:'予定 '+hm(x.ps)+'〜'+hm(x.pe)}),
    h('div',{class:'field'},[h('span',{class:'lb',text:'実際に始まった時間'}),inp]),
    h('div',{class:'row'},[
      h('button',{class:'btn primary',onclick:()=>{const m=parseHM(inp.value);if(m==null){toast('時間を入れてください');return}save(mid+m*60000)},text:'この時間にする'}),
      h('button',{class:'btn',onclick:()=>save(Date.now()),text:'いま始まった'}),
      cur!=null?h('button',{class:'btn danger',onclick:()=>save(null),text:'取り消す'}):null,
      h('button',{class:'btn sm',onclick:closeSheet,text:'閉じる'})])
  ]));
}

/* ---------- タイムテーブル ---------- */
function capCard(lv,d){
  const cp=capacity(lv,d),t=dayTimes(lv,d),c=cfgOf(lv);
  if(!cp)return S.isAdmin?h('p',{class:'rank',text:'「ライブの設定」でこの日の「使える時間（開始〜終わり）」を入れると、何バンドまで入るか計算します。'}):null;
  const left=cp.N-cp.n;
  const basis='1バンド '+(c.slotMode==='fixed'?'持ち時間 ':'平均 ')+cp.avg+'分'+(cp.rm?'＋リハ '+cp.rm+'分':'')+'＋転換 '+cp.ch+'分'+(cp.gap?'、リハ後の休憩 '+cp.gap+'分':'')+'で計算';
  return h('div',{class:'card tight capcard'},[
    h('h2',{text:'この日に入るバンド数'}),
    h('div',{class:'capbig'},[h('b',{text:'最大 '+cp.N+' バンド'}),h('span',{class:left<0?'err':left===0?'rank':'okline',text:left<0?'いま '+cp.n+'バンドで '+(-left)+' バンドはみ出しています':'いま '+cp.n+'バンド → あと '+left+' バンド入ります'})]),
    h('div',{class:'rank',text:'使える時間 '+hm(t.start)+'〜'+hm(t.end)+'（'+minLabel(cp.W)+'）。'+basis+(c.slotMode!=='fixed'&&!showOrder(lv).some(e=>setSec(e)>0)?'（セトリが出る前なので目安の時間）':'')})]);
}
function ttView(lv){
  const c=cfgOf(lv),d=curDay(lv),sc=schedule(lv,d),t=sc.t,kids=[daySeg(lv)];
  const so=sc.show;
  const info=[t.reh!=null?'リハ開始 '+hm(t.reh)+(t.anchor==='open'?'（自動）':''):null,'開演 '+hm(t.open)+(t.anchor==='reh'?'（自動）':''),'転換 '+(+c.changeMin||0)+'分',c.slotMode==='fixed'?'持ち時間 '+(+c.fixedMin||0)+'分（固定）':'持ち時間 セトリの合計'];
  kids.push(h('div',{class:'rank',text:info.filter(Boolean).join('　')}));
  kids.push(capCard(lv,d));
  if(!so.length){kids.push(h('div',{class:'card'},[h('p',{text:showOrder(lv).length?'この日のバンドはまだいません。別の日のバンドを、タイムテーブルの「日」でこの日に移せます。':'まだセトリが出ていません。「セトリ」タブから出されると、自動でタイムテーブルができます。'})]));
    kids.push(otherDays(lv,d));return h('div',{class:'col'},kids)}
  /* 並べ替えは、全体の並びの中で入れ替える（日をまたいでも崩れない） */
  const mvShow=(a,b)=>{const ids=showOrder(lv).map(x=>x.id),i=ids.indexOf(a),j=ids.indexOf(b);[ids[i],ids[j]]=[ids[j],ids[i]];const up={};up['lives/'+L.liveId+'/cfg/order']=ids;put(up)};
  const mvReh=(a,b)=>{const all=[];daysOf(lv).forEach((_,k)=>rehList(lv,k).forEach(x=>all.push(x.id)));const i=all.indexOf(a),j=all.indexOf(b);[all[i],all[j]]=[all[j],all[i]];const up={};up['lives/'+L.liveId+'/cfg/rehOrder']=all;up['lives/'+L.liveId+'/cfg/rehMode']='custom';put(up)};
  const nD=daysOf(lv).length;
  const table=(title,list,isShow,extra)=>h('div',{class:'card tight'},[h('div',{class:'mhead'},[h('h2',{text:title}),extra||null]),
    h('div',{class:'ttl2'},list.map((x,i)=>{
      const mv=isShow?mvShow:mvReh;
      const dsel=S.isAdmin&&isShow&&nD>1?h('select',{class:'sel-sm','aria-label':'出る日',onchange:ev=>{const up={};up['lives/'+L.liveId+'/entries/'+x.e.id+'/day']=+ev.target.value;put(up,'日を移しました')}},daysOf(lv).map((y,k)=>{const o=h('option',{value:String(k),text:(k+1)+'日目'});if(k===d)o.selected=true;return o})):null;
      return h('div',{class:'tr2'+(isShow&&isOver(lv,x.e)?' over':'')},[
      h('span',{class:'no',text:String(i+1)}),
      h('span',{class:'tm',text:hm(x.ps)+'–'+hm(x.pe)}),
      h('span',{class:'bn'},[x.e.band||'',isShow?h('small',{text:' '+minLabel(x.d)+(isOver(lv,x.e)?'（セトリ '+fmtSec(setSec(x.e))+' で超過）':'')}):null]),
      S.isAdmin?h('span',{class:'mv'},[dsel,h('button',{class:'btn sm',disabled:i===0,'aria-label':'上へ',onclick:()=>mv(x.e.id,list[i-1].e.id),text:'↑'}),h('button',{class:'btn sm',disabled:i===list.length-1,'aria-label':'下へ',onclick:()=>mv(x.e.id,list[i+1].e.id),text:'↓'})]):h('span')]);
    }))]);
  if(sc.reh.length){
    const rm=c.rehMode||'reverse';
    const seg=S.isAdmin?h('div',{class:'seg'},[['reverse','逆リハ'],['same','本番順'],['custom','手動']].map(o=>h('button',{'aria-pressed':String(rm===o[0]),onclick:()=>{const up={};up['lives/'+L.liveId+'/cfg/rehMode']=o[0];if(o[0]==='custom'){const all=[];daysOf(lv).forEach((_,k)=>rehList(lv,k).forEach(x=>all.push(x.id)));up['lives/'+L.liveId+'/cfg/rehOrder']=all}put(up)},text:o[1]}))):h('span',{class:'rank',text:rm==='reverse'?'逆リハ':rm==='same'?'本番順':''});
    kids.push(table('リハ（'+(+c.rehMin||0)+'分ずつ）',sc.reh,false,seg));
    if(t.gap)kids.push(h('div',{class:'rank',style:'text-align:center',text:'リハ後の休憩 '+t.gap+'分'}));
  }else if(S.isAdmin)kids.push(h('p',{class:'rank',text:'「ライブの設定」でリハの時間（1バンド何分）を入れると、リハの時間割もできます。'}));
  kids.push(table('本番（開演 '+hm(t.open)+'）',sc.show,true));
  const tot=sc.endPlan!=null?sc.endPlan-t.open:null;
  const sumKids=[h('div',{text:'終演予定 '+hm(sc.endPlan)+(tot!=null?'（本番 '+minLabel(tot)+'）':'')})];
  if(t.end!=null&&sc.endPlan!=null){const ok=sc.endPlan<=t.end;sumKids.push(h('div',{class:ok?'okline':'err',text:ok?'終わり（'+hm(t.end)+'）まで あと '+minLabel(t.end-sc.endPlan):'終わり（'+hm(t.end)+'）を '+minLabel(sc.endPlan-t.end)+' こえています'}))}
  if(t.start!=null&&t.reh!=null&&t.reh<t.start)sumKids.push(h('div',{class:'err',text:'リハ開始 '+hm(t.reh)+' が、使える時間の開始（'+hm(t.start)+'）より前になっています'}));
  kids.push(h('div',{class:'card tight'},sumKids));
  kids.push(h('div',{class:'row'},[h('button',{class:'btn',onclick:()=>copyTT(lv),text:'LINE用にコピー'})]));
  return h('div',{class:'col'},kids);
}
function otherDays(lv,d){return null}
function copyTT(lv){
  const c=cfgOf(lv);
  let t='【'+(c.name||'')+'】'+(c.venue?' '+c.venue:'')+'\n';
  daysOf(lv).forEach((_,d)=>{
    const sc=schedule(lv,d);if(!sc.show.length)return;
    t+='\n■ '+dayName(lv,d)+'\n';
    if(sc.reh.length)t+='▼リハ\n'+sc.reh.map(x=>hm(x.ps)+'〜 '+(x.e.band||'')).join('\n')+'\n';
    t+='▼本番（開演 '+hm(sc.t.open)+'）\n'+sc.show.map(x=>hm(x.ps)+'〜'+hm(x.pe)+' '+(x.e.band||'')).join('\n')+'\n終演予定 '+hm(sc.endPlan)+'\n';
  });
  const done=()=>toast('コピーしました。LINEに貼り付けできます');
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(done,()=>showText(t));else showText(t);
}
function showText(t){layer(h('div',{class:'sheet'},[h('h3',{text:'コピーしてね'}),h('textarea',{class:'ta',rows:'12',text:t}),h('button',{class:'btn',onclick:closeSheet,text:'閉じる'})]))}

/* ---------- セトリ ---------- */
function setView(lv){
  const c=cfgOf(lv),so=showOrder(lv),kids=[],nD=daysOf(lv).length;
  const locked=!!c.locked;
  kids.push(h('div',{class:'card tight'},[
    h('div',{class:locked?'err':'rank',text:locked?'セトリの受付は締め切られました。直したいときは運営へ。':'バンドごとに1つ出してください。出したあとも、同じスマホから直せます。'}),
    (!locked||S.isAdmin)?h('div',{class:'row'},[h('button',{class:'btn primary',onclick:()=>openSetForm(null),text:'＋ セトリを出す'})]):null]));
  if(!so.length)kids.push(h('div',{class:'empty-hint',text:'まだ誰も出していません'}));
  else kids.push(h('div',{class:'list'},so.map((e,i)=>{
    const mine=e.uid===S.uid;
    return h('button',{class:'li lvent'+(mine?' mine':''),onclick:()=>openEntry(e.id)},[
      h('span',{class:'no2',text:String(i+1)}),
      h('div',{style:'min-width:0'},[h('div',{class:'nm'},[e.band||'',nD>1?h('span',{class:'chip',style:'margin-left:6px',text:(dayOfEntry(lv,e)+1)+'日目'}):null,mine?h('span',{class:'chip confirmed',style:'margin-left:6px',text:'自分'}):null]),
        h('div',{class:'meta',text:'合計 '+fmtSec(setSec(e))+'　'+songsOf(e).length+'行　'+membersOf(e).length+'人'+(isOver(lv,e)?'　持ち時間こえ':'')})]),
      h('span',{class:'lvgo',text:'›'})]);
  })));
  return h('div',{class:'col'},kids);
}
function openEntry(id){
  const lv=L.live,e=entriesOf(lv).find(x=>x.id===id);if(!e)return;
  const c=cfgOf(lv),can=S.isAdmin||(e.uid===S.uid&&!c.locked);
  const mem=membersOf(e),songs=songsOf(e),gear=gearOf(e);
  const armed=L.arm==='del'+id;
  layer(h('div',{class:'sheet wide',role:'dialog','aria-modal':'true'},[
    h('h3',{text:e.band||''}),
    mem.length?h('div',{class:'field'},[h('span',{class:'lb',text:'メンバー'}),h('div',{class:'memv'},mem.map(m=>h('div',null,[h('b',{text:m.name||''}),h('span',{text:' '+(m.parts||[]).join(' ')+(m.other?'（'+m.other+'）':'')})])))]):null,
    h('div',{class:'field'},[h('span',{class:'lb',text:'セットリスト　合計 '+fmtSec(setSec(e))}),h('table',{class:'sltab'},[h('tbody',null,songs.map((s,i)=>h('tr',null,[h('td',{class:'n',text:String(i+1)}),h('td',{text:s.t||''}),h('td',{class:'tm',text:fmtSec(s.sec)}),h('td',{class:'rq',text:s.req||''})])))])]),
    gear.length?h('div',{class:'field'},[h('span',{class:'lb',text:'使うドラム・機材'}),h('div',{class:'memv'},gear.map(g=>h('div',null,[h('span',{class:'chip',text:GEARK[g.k]||''}),' '+(g.t||'')])))]):null,
    e.note?h('div',{class:'field'},[h('span',{class:'lb',text:'備考'}),h('div',{style:'white-space:pre-wrap',text:e.note})]):null,
    h('div',{class:'row'},[
      can?h('button',{class:'btn primary',onclick:()=>openSetForm(id),text:'直す'}):null,
      can?h('button',{class:'btn danger',onclick:async()=>{if(!armed){L.arm='del'+id;openEntry(id);return}L.arm='';const up={};up['lives/'+L.liveId+'/entries/'+id]=null;if(await put(up,'取り下げました'))closeSheet()},text:armed?'もう一度押すと取り下げ':'取り下げる'}):null,
      h('button',{class:'btn sm',onclick:()=>{L.arm='';closeSheet()},text:'閉じる'})])
  ]));
}
function openSetForm(id){
  const lv=L.live,ex=id?entriesOf(lv).find(x=>x.id===id):null;
  const band=h('input',{type:'text',maxlength:'40',value:ex?ex.band||'':'',placeholder:'例：MY Pick is Big'});
  /* メンバー */
  const memBox=h('div',{class:'rows'});
  const addMem=m=>{
    m=m||{};const parts=new Set(m.parts||[]);
    const nm=h('input',{type:'text',maxlength:'30',value:m.name||'',placeholder:'名前'});
    const oth=h('input',{type:'text',maxlength:'20',value:m.other||'',placeholder:'その他のパート',class:'oth'});oth.hidden=!parts.has('その他');
    const chips=h('div',{class:'pchips'},PARTS.map(p=>{const b=h('button',{type:'button',class:'pc','aria-pressed':String(parts.has(p)),text:p,onclick:()=>{if(parts.has(p))parts.delete(p);else parts.add(p);b.setAttribute('aria-pressed',String(parts.has(p)));if(p==='その他')oth.hidden=!parts.has(p)}});return b}));
    const row=h('div',{class:'mrow'},[h('div',{class:'row',style:'flex-wrap:nowrap'},[nm,h('button',{type:'button',class:'btn sm','aria-label':'この行を消す',onclick:()=>row.remove(),text:'×'})]),chips,oth]);
    row._get=()=>({name:nm.value.trim(),parts:PARTS.filter(p=>parts.has(p)),other:parts.has('その他')?oth.value.trim():''});
    memBox.append(row);
  };
  const mem0=ex?membersOf(ex):[];(mem0.length?mem0:[{},{},{},{}]).forEach(addMem);
  /* セトリ */
  const total=h('b',{text:'0:00'});
  const songBox=h('div',{class:'rows'});
  const recalc=()=>{let t=0;songBox.querySelectorAll('.srow').forEach(r=>{t+=secOf(r._tm.value)});total.textContent=fmtSec(t)};
  const addSong=s=>{
    s=s||{};
    const t=h('input',{type:'text',maxlength:'60',value:s.t||'',placeholder:'曲名・MC・SE'});
    const tm=h('input',{type:'text',inputmode:'numeric',maxlength:'6',value:s.sec!=null&&s.sec!==''?fmtSec(s.sec):'',placeholder:'3:21',class:'tmin',oninput:recalc});
    const rq=h('input',{type:'text',maxlength:'80',value:s.req||'',placeholder:'要望（例：イントロ中にMC）',class:'req'});
    const row=h('div',{class:'srow'},[h('div',{class:'row',style:'flex-wrap:nowrap'},[t,tm,h('button',{type:'button',class:'btn sm','aria-label':'この行を消す',onclick:()=>{row.remove();recalc()},text:'×'})]),rq]);
    row._tm=tm;row._get=()=>({t:t.value.trim(),sec:secOf(tm.value),req:rq.value.trim()});
    songBox.append(row);recalc();
  };
  const s0=ex?songsOf(ex):[];(s0.length?s0:[{},{},{},{},{},{}]).forEach(addSong);
  /* 機材 */
  const gearBox=h('div',{class:'rows'});
  const addGear=g=>{
    g=g||{};
    const k=h('select',{class:'gk'},Object.keys(GEARK).map(x=>h('option',{value:x,text:GEARK[x]})));k.value=g.k||'club';
    const t=h('input',{type:'text',maxlength:'60',value:g.t||'',placeholder:'例：スネア、ツインペダル、キーボード'});
    const row=h('div',{class:'row',style:'flex-wrap:nowrap'},[k,t,h('button',{type:'button',class:'btn sm','aria-label':'この行を消す',onclick:()=>row.remove(),text:'×'})]);
    row._get=()=>({k:k.value,t:t.value.trim()});gearBox.append(row);
  };
  gearOf(ex||{}).forEach(addGear);
  const note=h('textarea',{class:'ta',rows:'3',maxlength:'400',text:ex?ex.note||'':''});
  const err=h('div',{class:'err',role:'alert'});
  const send=h('button',{class:'btn primary',text:ex?'この内容で直す':'セトリを出す',onclick:async()=>{
    err.textContent='';
    const b=band.value.trim();if(!b){err.textContent='バンド名を入れてください';band.focus();return}
    const songs=[...songBox.children].map(r=>r._get()).filter(s=>s.t||s.sec);
    if(!songs.length){err.textContent='セットリストを1行以上入れてください';return}
    const members=[...memBox.children].map(r=>r._get()).filter(m=>m.name);
    const gear=[...gearBox.children].map(r=>r._get()).filter(g=>g.t);
    const eid=id||newKey('lives/'+L.liveId+'/entries');
    const o={uid:ex?ex.uid:S.uid,band:b,members:members,songs:songs,gear:gear,note:note.value.trim(),createdAt:ex?ex.createdAt:firebase.database.ServerValue.TIMESTAMP,updatedAt:firebase.database.ServerValue.TIMESTAMP};
    send.disabled=true;
    const up={};up['lives/'+L.liveId+'/entries/'+eid]=o;
    if(await put(up,ex?'直しました':'セトリを出しました'))closeSheet();else send.disabled=false;
  }});
  layer(h('div',{class:'sheet wide',role:'dialog','aria-modal':'true'},[
    h('h3',{text:ex?'セトリを直す':'セトリを出す'}),
    h('div',{class:'field'},[h('label',{text:'バンド名'}),band]),
    h('div',{class:'field'},[h('span',{class:'lb',text:'メンバー構成（当てはまるパートを押す）'}),memBox,
      h('div',{class:'row'},[h('button',{type:'button',class:'btn sm',onclick:()=>addMem(),text:'＋ メンバー'})]),
      h('div',{class:'rank',text:'MCはVo.・Cho.はやらないけどMCはやる人だけ押してください'})]),
    h('div',{class:'field'},[h('span',{class:'lb'},['セットリスト　合計 ',total]),songBox,
      h('div',{class:'row'},[h('button',{type:'button',class:'btn sm',onclick:()=>addSong(),text:'＋ 曲'}),h('button',{type:'button',class:'btn sm',onclick:()=>addSong({t:'MC',sec:60}),text:'＋ MC（1:00）'}),h('button',{type:'button',class:'btn sm',onclick:()=>addSong({t:'SE',sec:90}),text:'＋ SE'})]),
      h('div',{class:'rank',text:'時間は「3:21」のように入れてください（3 だけなら3分）'})]),
    h('div',{class:'field'},[h('span',{class:'lb',text:'使うドラム・機材'}),gearBox,
      h('div',{class:'row'},[h('button',{type:'button',class:'btn sm',onclick:()=>addGear(),text:'＋ 機材'})]),
      h('div',{class:'rank',text:'ふだん使うもの（部のドラムセット・アンプなど）は書かなくてOK。スネアの持ち込みやキーボードなど、いつもと違うものだけ。'})]),
    h('div',{class:'field'},[h('label',{text:'備考'}),note]),
    err,
    h('div',{class:'row',style:'justify-content:flex-end'},[h('button',{class:'btn',onclick:closeSheet,text:'キャンセル'}),send])
  ]));
  band.focus();
}

/* ---------- 機材チェック ---------- */
function itemsOf(o){const it=(o&&o.items)||{};return Object.keys(it).map(k=>Object.assign({k:k},it[k])).sort((a,b)=>(a.ord||0)-(b.ord||0))}
function eqView(lv){
  const items=itemsOf(lv),ck=lv.checks||{},m=L.ckMode,kids=[];
  const done=items.filter(it=>(ck[it.k]||{})[m]).length;
  kids.push(h('div',{class:'mhead'},[
    h('div',{class:'seg'},[['out','行き（搬出）'],['back','帰り（搬入）']].map(o=>h('button',{'aria-pressed':String(m===o[0]),onclick:()=>{L.ckMode=o[0];render()},text:o[1]}))),
    h('b',{class:done===items.length&&items.length?'okline':'',text:done+' / '+items.length})]));
  if(m==='back')kids.push(h('p',{class:'rank',text:'行きで持っていったのに、まだ帰りのチェックがないものが上に出ます。'}));
  if(!items.length)kids.push(h('div',{class:'card'},[h('p',{text:S.isAdmin?'リストが空です。下の「リストを編集」から入れてください。':'まだ持ち出しリストがありません。'})]));
  ['high','mid','low'].forEach(p=>{
    let list=items.filter(it=>(it.pri||'mid')===p);if(!list.length)return;
    if(m==='back')list=list.slice().sort((a,b)=>{const f=x=>((ck[x.k]||{}).out&&!(ck[x.k]||{}).back)?0:1;return f(a)-f(b)});
    kids.push(h('div',{class:'card tight'},[h('h2',{text:PRI[p]}),h('div',{class:'cklist'},list.map(it=>{
      const c=ck[it.k]||{},on=!!c[m],miss=m==='back'&&c.out&&!c.back;
      return h('button',{class:'ck'+(on?' on':'')+(miss?' miss':''),'aria-pressed':String(on),onclick:()=>{const up={};up['lives/'+L.liveId+'/checks/'+it.k+'/'+m]=!on;put(up)}},[
        h('span',{class:'box',text:on?'✓':''}),
        h('span',{class:'ckb'},[h('b',{text:it.name||''}),it.qty?h('small',{text:it.qty}):null]),
        it.opt?h('span',{class:'chip',text:'必要なら'}):null,
        m==='back'&&!c.out?h('span',{class:'chip',text:'行き未'}):null]);
    }))]));
  });
  /* バンドの申告 */
  const decl=[];
  showOrder(lv).forEach(e=>gearOf(e).forEach(g=>decl.push({b:e.band,g:g})));
  if(decl.length)kids.push(h('div',{class:'card tight'},[h('h2',{text:'バンドが申告した機材'}),h('div',{class:'memv'},decl.map(d=>h('div',null,[h('span',{class:'chip'+(d.g.k==='club'?' pending':''),text:GEARK[d.g.k]||''}),' ',h('b',{text:d.g.t||''}),h('span',{class:'rank',text:'　'+(d.b||'')})])))]));
  if(S.isAdmin)kids.push(h('div',{class:'row'},[
    h('button',{class:'btn',onclick:()=>openItemsEditor('lives/'+L.liveId+'/items',items,'このライブの持ち出しリスト'),text:'リストを編集'}),
    h('button',{class:'btn sm',onclick:()=>openTplApply(),text:'テンプレートから入れ直す'}),
    h('button',{class:'btn sm danger',onclick:()=>{if(L.arm!=='ckclr'){L.arm='ckclr';render();return}L.arm='';const up={};up['lives/'+L.liveId+'/checks']=null;put(up,'チェックを全部外しました')},text:L.arm==='ckclr'?'もう一度押すと全部外す':'チェックを全部外す'})]));
  return h('div',{class:'col'},kids);
}
function openTplApply(){
  const ids=Object.keys(L.tpls||{});
  if(!ids.length){toast('テンプレートがありません');return}
  layer(h('div',{class:'sheet'},[h('h3',{text:'テンプレートから入れ直す'}),h('p',{class:'rank',text:'今のリストとチェックは消えて、選んだテンプレートの中身になります。'}),
    h('div',{class:'menu'},ids.map(t=>h('button',{class:'mitem',onclick:async()=>{
      const up={};up['lives/'+L.liveId+'/items']=(L.tpls[t]||{}).items||null;up['lives/'+L.liveId+'/checks']=null;up['lives/'+L.liveId+'/cfg/tpl']=t;
      if(await put(up,'入れ直しました'))closeSheet();
    }},[h('b',{text:L.tpls[t].name||''}),h('span',{text:itemsOf(L.tpls[t]).length+'項目'})]))),
    h('button',{class:'btn',onclick:closeSheet,text:'閉じる'})]));
}
/* 機材リストの編集（テンプレートでも、ライブごとのリストでも同じ画面） */
function openItemsEditor(path,items,title,extraTop){
  const box=h('div',{class:'rows'});
  const addRow=it=>{
    it=it||{};
    const nm=h('input',{type:'text',maxlength:'40',value:it.name||'',placeholder:'機材名'});
    const qty=h('input',{type:'text',maxlength:'40',value:it.qty||'',placeholder:'数・メモ（例：4つ）',class:'req'});
    const pri=h('select',{class:'gk'},Object.keys(PRI).map(p=>h('option',{value:p,text:PRI[p].replace('優先度','')})));pri.value=it.pri||'mid';
    const opt=h('input',{type:'checkbox'});opt.checked=!!it.opt;
    const row=h('div',{class:'srow'},[h('div',{class:'row',style:'flex-wrap:nowrap'},[nm,pri,h('button',{type:'button',class:'btn sm','aria-label':'この行を消す',onclick:()=>row.remove(),text:'×'})]),
      h('div',{class:'row',style:'flex-wrap:nowrap'},[qty,h('label',{class:'optl'},[opt,' 必要なら'])])]);
    row._k=it.k;row._get=()=>({name:nm.value.trim(),qty:qty.value.trim(),pri:pri.value,opt:opt.checked});
    box.append(row);
  };
  items.forEach(addRow);
  const save=h('button',{class:'btn primary',text:'保存',onclick:async()=>{
    const obj={};let i=0;
    [...box.children].forEach(r=>{const v=r._get();if(!v.name)return;const k=r._k||newKey(path);obj[k]=Object.assign(v,{ord:i++})});
    const up={};up[path]=Object.keys(obj).length?obj:null;
    if(extraTop)Object.assign(up,extraTop());
    save.disabled=true;if(await put(up,'保存しました'))closeSheet();else save.disabled=false;
  }});
  layer(h('div',{class:'sheet wide',role:'dialog','aria-modal':'true'},[h('h3',{text:title}),
    h('p',{class:'rank',text:'「必要なら」は、場合によって持っていくもの（紙で（ ）がついていたもの）です。'}),
    box,h('div',{class:'row'},[h('button',{type:'button',class:'btn sm',onclick:()=>addRow(),text:'＋ 機材を追加'})]),
    h('div',{class:'row',style:'justify-content:flex-end'},[h('button',{class:'btn',onclick:closeSheet,text:'キャンセル'}),save])]));
}

/* ---------- テンプレート（運営） ---------- */
function openTplList(){
  const ids=Object.keys(L.tpls||{});
  const kids=[h('h3',{text:'持ち出し機材のテンプレート'})];
  if(!ids.length)kids.push(h('p',{class:'rank',text:'まだありません。紙の「搬出チェックリスト」と同じ中身を一発で入れられます。'}),
    h('button',{class:'btn primary',onclick:async()=>{await put(seedTpls(),'外ステージ用・講堂用を入れました')},text:'外ステージ用・講堂用を入れる'}));
  kids.push(h('div',{class:'menu'},ids.map(t=>h('button',{class:'mitem',onclick:()=>openTplEdit(t)},[h('b',{text:L.tpls[t].name||''}),h('span',{text:itemsOf(L.tpls[t]).length+'項目　タップで編集'})]))));
  kids.push(h('div',{class:'row'},[h('button',{class:'btn',onclick:()=>openTplEdit(null),text:'＋ 新しいテンプレート'}),h('button',{class:'btn sm',onclick:closeSheet,text:'閉じる'})]));
  layer(h('div',{class:'sheet','data-s':'tpllist'},kids));
}
function openTplEdit(t){
  const id=t||newKey('tpls');const cur=t?L.tpls[t]:{name:'',items:{}};
  const name=h('input',{type:'text',maxlength:'30',value:cur.name||'',placeholder:'例：〇〇ホール用'});
  openItemsEditor('tpls/'+id+'/items',itemsOf(cur),t?'テンプレートを編集':'新しいテンプレート',()=>{const o={};o['tpls/'+id+'/name']=name.value.trim()||'名前なし';return o});
  const sh=$('layer').querySelector('.sheet');
  sh.insertBefore(h('div',{class:'field'},[h('label',{text:'テンプレート名'}),name]),sh.children[1]);
  if(t){
    const del=h('button',{class:'btn sm danger',text:'このテンプレートを消す',onclick:async()=>{if(del.dataset.a!=='1'){del.dataset.a='1';del.textContent='もう一度押すと消す';return}const up={};up['tpls/'+t]=null;if(await put(up,'消しました'))closeSheet()}});
    sh.append(h('div',{class:'row'},[del]));
  }
}
function seedTpls(){
  const mk=(list)=>{const o={};list.forEach((x,i)=>{o['i'+pad(i)]={name:x[0],qty:x[1]||'',pri:x[2],opt:!!x[3],ord:i}});return o};
  const outdoor=[
    ['マルチケーブル','','high'],['ミキサー（外）','','high'],['ケーブル 青い箱','','high'],['ドラムカーペット','','high'],
    ['ドラムセット','スネアは2つ','mid'],['外音スピーカー（外）','4つ','mid'],['ギターアンプ マーシャル','','mid'],['ギターアンプ JC','','mid'],['ギターアンプ Fender（ヒビタン）','','mid'],['ベースアンプ','','mid'],['電ドラ','','mid'],['返しスピーカー','ステージ前2つ・ドラム用1つ','mid'],
    ['マイクスタンド','ドラム5つ・ボーカル4つ・ギター2つ','low'],['扇風機','','low',1],['工具箱','','low'],['ドラム工具箱','','low']];
  const hall=[
    ['パワーアンプ','','high'],['机','','high'],['ミキサー（中）','','high'],['スタンド','','high'],['マルチケーブル','','high',1],['ケーブル 青い箱','','high',1],['ドラムカーペット','','high',1],['レンガ','全部','high'],
    ['ドラムセット','','mid'],['外音スピーカー（中）','4つ','mid'],['ギターアンプ マーシャル','','mid',1],['ギターアンプ JC','','mid',1],['ギターアンプ Fender（ヒビタン）','','mid',1],['ベースアンプ','','mid',1],['キーボードアンプ','','mid'],['返しスピーカー','ステージ前2つ・ドラム用1つ・ボーカル用','mid'],['電ドラ','','mid',1],
    ['マイクスタンド','ドラム5つ・ボーカル4つ・ギター2つ','low',1],['楽器スタンド','ギター2つ・ベース1つ・予備1つ','low'],['キーボードスタンド','','low'],['椅子','キーボードアンプ用・キーボード用','low'],['扇風機','2つ（パワーアンプ用 ニックン）','low'],['工具箱','','low',1],['ドラム工具箱','','low',1],['看板','','low'],['カメラスタンド','','low'],['カメラ','','low']];
  return {'tpls/outdoor':{name:'外ステージ用',items:mk(outdoor)},'tpls/hall':{name:'講堂用',items:mk(hall)}};
}

/* ---------- ライブを作る・設定（運営） ---------- */
function openLiveCfg(id){
  const lv=id&&L.live&&L.liveId===id?L.live:null,c=lv?cfgOf(lv):{};
  const isNew=!id;
  const f=(lb,el,note)=>h('div',{class:'field'},[h('label',{text:lb}),el,note?h('div',{class:'rank',text:note}):null]);
  const name=h('input',{type:'text',maxlength:'40',value:c.name||'',placeholder:'例：11月定期ライブ'});
  const venue=h('input',{type:'text',maxlength:'30',value:c.venue||'',placeholder:'例：講堂'});
  const tmI=v=>h('input',{type:'time',value:v!=null&&v!==''?hm(+v).padStart(5,'0'):''});
  const num=(v,def,ph)=>h('input',{type:'number',min:'0',max:'600',inputmode:'numeric',value:v!=null&&v!==''?String(v):(def!=null?String(def):''),placeholder:ph||'',class:'num'});
  const rehMin=num(c.rehMin,15),chg=num(c.changeMin,10),fixed=num(c.fixedMin,20),est=num(c.estMin,20);
  let mode=c.slotMode||'setlist';
  const fixedBox=h('div',{class:'row'},[fixed,'分']);fixedBox.hidden=mode!=='fixed';
  const estBox=f('セトリが出る前の目安（1バンド何分）',h('div',{class:'row'},[est,'分']),'何バンド入るかの計算に使います。セトリが出てきたら、その平均に切り替わります');estBox.hidden=mode==='fixed';
  const seg=h('div',{class:'seg'},[['setlist','セトリの合計'],['fixed','〇分で固定']].map(o=>{const b=h('button',{type:'button','aria-pressed':String(mode===o[0]),text:o[1],onclick:()=>{mode=o[0];seg.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));fixedBox.hidden=mode!=='fixed';estBox.hidden=mode==='fixed';prevAll()}});return b}));
  /* 本番の日（複数OK） */
  const dayBox=h('div',{class:'rows'});
  const counts=d=>lv?showOrder(lv,d).length:0;
  const prevAll=()=>[...dayBox.children].forEach(r=>r._prev&&r._prev());
  const addDay=(dy,orig)=>{
    dy=dy||{};
    const date=h('input',{type:'date',value:dy.date||(dayBox.lastElementChild?addDays(dayBox.lastElementChild._get().date||todayIso(),1):todayIso())});
    const st=tmI(dy.start),en=tmI(dy.end);
    let anc=dy.anchor==='reh'?'reh':'open';
    const at=tmI(anc==='reh'?dy.rehStart:(dy.open!=null?dy.open:1080));
    const gap=num(dy.gap,0);
    const albl=h('label',{text:anc==='reh'?'リハ開始':'開演'});
    const prev=h('div',{class:'rank'});
    const aseg=h('div',{class:'seg'},[['open','開演から決める'],['reh','リハ開始から決める']].map(o=>{const b=h('button',{type:'button','aria-pressed':String(anc===o[0]),text:o[1],onclick:()=>{anc=o[0];aseg.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));albl.textContent=anc==='reh'?'リハ開始':'開演';row._prev()}});return b}));
    const row=h('div',{class:'srow dayrow'},[
      h('div',{class:'row',style:'justify-content:space-between'},[h('b',{class:'dno'}),h('button',{type:'button',class:'btn sm',onclick:()=>{if(dayBox.children.length<2){toast('1日は必要です');return}row.remove();renum()},text:'この日を消す'})]),
      h('div',{class:'two'},[f('日付',date),h('div',{class:'field'},[h('label',{text:'使える時間（任意）'}),h('div',{class:'row',style:'flex-wrap:nowrap'},[st,'〜',en])])]),
      h('div',{class:'field'},[h('span',{class:'lb',text:'時間の決め方'}),aseg]),
      h('div',{class:'two'},[h('div',{class:'field'},[albl,at]),f('リハ後の休憩（分）',gap)]),
      prev]);
    row._orig=orig;
    row._get=()=>{const o={date:date.value,anchor:anc,gap:+gap.value||0};const v=parseHM(at.value);if(anc==='reh')o.rehStart=v;else o.open=v;const s=parseHM(st.value),e=parseHM(en.value);if(s!=null)o.start=s;if(e!=null)o.end=e;return o};
    row._prev=()=>{
      const o=row._get(),n=orig!=null?counts(orig):0,rm=+rehMin.value||0,v=anc==='reh'?o.rehStart:o.open;
      if(v==null){prev.textContent='';return}
      const other=anc==='reh'?v+n*rm+o.gap:v-o.gap-n*rm;
      prev.textContent=rm?(anc==='reh'?'→ 開演は自動で '+hm(other):'→ リハ開始は自動で '+hm(other))+'（いま'+n+'バンド・リハ'+rm+'分ずつ'+(o.gap?'・休憩'+o.gap+'分':'')+'。バンドが増減すると自動でずれます）':'リハの時間が0分なので、リハの時間割はなし';
    };
    [date,st,en,at,gap].forEach(x=>x.addEventListener('input',row._prev));
    dayBox.append(row);row._prev();renum();
  };
  const renum=()=>[...dayBox.children].forEach((r,i)=>{r.querySelector('.dno').textContent=(i+1)+'日目'});
  (lv?daysOf(lv):[{}]).forEach((dy,i)=>addDay(dy,lv?i:null));
  rehMin.addEventListener('input',prevAll);
  const tids=Object.keys(L.tpls||{});
  const tpl=h('select',null,[h('option',{value:'',text:'なし（あとで入れる）'})].concat(tids.map(t=>h('option',{value:t,text:L.tpls[t].name||t}))));
  if(isNew&&tids.length)tpl.value=tids[0];
  const locked=h('input',{type:'checkbox'});locked.checked=!!c.locked;
  const err=h('div',{class:'err',role:'alert'});
  const save=h('button',{class:'btn primary',text:isNew?'ライブを作る':'保存',onclick:async()=>{
    err.textContent='';
    const nm=name.value.trim();if(!nm){err.textContent='ライブ名を入れてください';return}
    const rows=[...dayBox.children],days=rows.map(r=>r._get());
    for(let i=0;i<days.length;i++){
      if(!days[i].date){err.textContent=(i+1)+'日目の日付を入れてください';return}
      if((days[i].anchor==='reh'?days[i].rehStart:days[i].open)==null){err.textContent=(i+1)+'日目の'+(days[i].anchor==='reh'?'リハ開始':'開演')+'時間を入れてください';return}
    }
    const lid=id||newKey('lives');
    const cfg={name:nm,venue:venue.value.trim(),days:days,date:days[0].date,open:days[0].open!=null?days[0].open:days[0].rehStart,
      rehMin:+rehMin.value||0,changeMin:+chg.value||0,slotMode:mode,fixedMin:+fixed.value||0,estMin:+est.value||20,locked:locked.checked,
      rehMode:c.rehMode||'reverse',order:c.order||null,rehOrder:c.rehOrder||null,tpl:isNew?tpl.value:(c.tpl||'')};
    const up={};up['lives/'+lid+'/cfg']=cfg;
    up['liveIdx/'+lid]={name:cfg.name,date:days.map(x=>x.date).sort()[0],dates:days.map(x=>x.date).sort().join(','),venue:cfg.venue};
    if(isNew&&tpl.value&&L.tpls[tpl.value])up['lives/'+lid+'/items']=L.tpls[tpl.value].items||null;
    /* 日を消したり並びが変わったら、バンドの「出る日」もそれに合わせる */
    if(lv){const map={};rows.forEach((r,i)=>{if(r._orig!=null)map[r._orig]=i});
      entriesOf(lv).forEach(e=>{const o=dayOfEntry(lv,e),n=map[o]!=null?map[o]:0;if(n!==(+e.day||0))up['lives/'+lid+'/entries/'+e.id+'/day']=n})}
    save.disabled=true;
    if(await put(up,isNew?'ライブを作りました':'保存しました')){closeSheet();if(isNew)openLive(lid)}else save.disabled=false;
  }});
  const kids=[h('h3',{text:isNew?'ライブを作る':'ライブの設定'}),
    h('div',{class:'two'},[f('ライブ名',name),f('会場',venue)]),
    h('div',{class:'two'},[f('リハ 1バンド（分）',rehMin,'0ならリハなし'),f('転換（分）',chg)]),
    h('div',{class:'field'},[h('span',{class:'lb',text:'1バンドの持ち時間'}),seg,fixedBox]),estBox,
    h('div',{class:'field'},[h('span',{class:'lb',text:'本番の日'}),dayBox,h('div',{class:'row'},[h('button',{type:'button',class:'btn sm',onclick:()=>addDay({},null),text:'＋ 日を追加'})]),
      h('div',{class:'rank',text:'開演かリハ開始のどちらかを決めると、もう一方はバンド数から自動で計算します。「使える時間」を入れると、何バンドまで入るかも出ます。'})]),
    isNew?f('持ち出し機材のテンプレート',tpl):null,
    h('label',{class:'optl'},[locked,' セトリの受付を締め切る（運営以外は出せない・直せない）']),
    err,h('div',{class:'row',style:'justify-content:flex-end'},[h('button',{class:'btn',onclick:closeSheet,text:'キャンセル'}),save])];
  if(!isNew){
    const del=h('button',{class:'btn sm danger',text:'このライブを消す',onclick:async()=>{if(del.dataset.a!=='1'){del.dataset.a='1';del.textContent='もう一度押すと、セトリも全部消えます';return}
      const up={};up['lives/'+id]=null;up['liveIdx/'+id]=null;if(await put(up,'消しました')){closeSheet();L.liveId='';L.live=null;subscribeMode();render()}}});
    kids.push(h('div',{class:'row'},[del]));
  }
  layer(h('div',{class:'sheet wide',role:'dialog','aria-modal':'true'},kids));
}

/* ---------- 備品リクエスト ---------- */
function supplyView(){
  const arr=Object.keys(L.sup||{}).map(id=>Object.assign({id:id},L.sup[id]));
  const ordS={new:0,seen:1,ordered:2,done:3};
  const vis=arr.filter(x=>L.showDone||x.status!=='done').sort((a,b)=>(ordS[a.status]-ordS[b.status])||((b.createdAt||0)-(a.createdAt||0)));
  const nDone=arr.filter(x=>x.status==='done').length;
  const kids=[h('div',{class:'mhead'},[h('h2',{text:'備品リクエスト'}),h('button',{class:'btn primary',onclick:openSupForm,text:'＋ リクエストする'})]),
    h('p',{class:'rank',text:'足りないもの・壊れたものを書いておくと、運営が確認して注文します。同じものがもう出ていないか先に見てね。'})];
  if(!vis.length)kids.push(h('div',{class:'empty-hint',text:'いまはリクエストがありません'}));
  else kids.push(h('div',{class:'list'},vis.map(x=>{
    const mine=x.uid===S.uid,acts=[];
    if(S.isAdmin&&SUPNEXT[x.status])acts.push(h('button',{class:'btn sm primary',onclick:()=>{const up={};up['supplies/'+x.id+'/status']=SUPNEXT[x.status];put(up)},text:'→ '+SUPST[SUPNEXT[x.status]]}));
    if(S.isAdmin&&x.status!=='new')acts.push(h('button',{class:'btn sm',onclick:()=>{const back={seen:'new',ordered:'seen',done:'ordered'}[x.status];const up={};up['supplies/'+x.id+'/status']=back;put(up)},text:'↩'}));
    if(S.isAdmin||(mine&&x.status==='new')){const a=L.arm==='sup'+x.id;acts.push(h('button',{class:'btn sm danger',onclick:()=>{if(!a){L.arm='sup'+x.id;render();return}L.arm='';const up={};up['supplies/'+x.id]=null;put(up,'消しました')},text:a?'消す？':'消す'}))}
    return h('div',{class:'li sup '+x.status},[h('span',{class:'chip sup-'+x.status,text:SUPST[x.status]||''}),
      h('div',{style:'min-width:0'},[h('div',{class:'nm',text:x.item||''}),x.note?h('div',{style:'font-size:13px;overflow-wrap:anywhere',text:x.note}):null,
        h('div',{class:'meta',text:[x.who,x.createdAt?new Date(x.createdAt).toLocaleDateString('ja-JP',{month:'numeric',day:'numeric'}):''].filter(Boolean).join('　')+(mine?'　（自分）':'')})]),
      h('div',{class:'acts'},acts)]);
  })));
  if(nDone)kids.push(h('div',{class:'row'},[h('button',{class:'btn sm',onclick:()=>{L.showDone=!L.showDone;render()},text:L.showDone?'届いたものを隠す':'届いたものも見る（'+nDone+'）'}),
    S.isAdmin?h('button',{class:'btn sm danger',onclick:()=>{if(L.arm!=='supclr'){L.arm='supclr';render();return}L.arm='';const up={};arr.filter(x=>x.status==='done').forEach(x=>{up['supplies/'+x.id]=null});put(up,'片付けました')},text:L.arm==='supclr'?'もう一度押すと消す':'届いたものを片付ける'}):null]));
  return h('div',{class:'mview'},kids);
}
function openSupForm(){
  const item=h('input',{type:'text',maxlength:'60',placeholder:'例：エリクサー 10-46'});
  const note=h('textarea',{class:'ta',rows:'3',maxlength:'300',placeholder:'理由・詳しく（例：ストックがあと1セット）'});
  const who=h('input',{type:'text',maxlength:'20',value:lsGet('kitami-supwho'),placeholder:'名前（任意）'});
  const err=h('div',{class:'err',role:'alert'});
  const go=h('button',{class:'btn primary',text:'リクエストする',onclick:async()=>{
    if(!item.value.trim()){err.textContent='何がほしいか書いてください';item.focus();return}
    lsSet('kitami-supwho',who.value.trim());
    const id=newKey('supplies'),up={};
    up['supplies/'+id]={uid:S.uid,item:item.value.trim(),note:note.value.trim(),who:who.value.trim(),status:'new',createdAt:firebase.database.ServerValue.TIMESTAMP};
    go.disabled=true;if(await put(up,'リクエストしました'))closeSheet();else go.disabled=false;
  }});
  layer(h('div',{class:'sheet',role:'dialog','aria-modal':'true'},[h('h3',{text:'備品リクエスト'}),
    h('div',{class:'field'},[h('label',{text:'ほしいもの・壊れたもの'}),item]),
    h('div',{class:'field'},[h('label',{text:'詳しく'}),note]),
    h('div',{class:'field'},[h('label',{text:'名前'}),who]),err,
    h('div',{class:'row',style:'justify-content:flex-end'},[h('button',{class:'btn',onclick:closeSheet,text:'キャンセル'}),go])]));
  item.focus();
}
