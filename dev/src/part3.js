
/* ---------- 色：同じ日でとなり合う・重なる予約が別の色になるよう自動で割り当て ---------- */
function colorMap(){
  const m=new Map();
  const items=live().slice().sort((a,b)=>a.day-b.day||a.s-b.s||a.e-b.e||String(a.id).localeCompare(String(b.id)));
  let last=-1,lastDay=-1;
  items.forEach(r=>{
    if(isMeeting(r)){m.set(r.id,'m');return}
    if(r.day!==lastDay){last=-1;lastDay=r.day}
    const near=items.filter(o=>m.has(o.id)&&o.day===r.day&&o.s<=r.e&&r.s<=o.e).map(o=>m.get(o.id));
    let c=null;
    for(let k=1;k<=4;k++){const i=(last+k)%4;if(!near.includes(i)){c=i;break}}
    if(c==null)c=(last+1)%4;
    m.set(r.id,c);last=c;
  });
  S.colors=m;
}
function isMeeting(r){return r.band==='部会'}
function cc(r){const v=S.colors&&S.colors.get(r.id);return v==='m'?'cm':'c'+(v||0)}

/* ---------- layout of overlapping blocks ---------- */
function lanes(items){
  const sorted=items.slice().sort((a,b)=>a.s-b.s||a.e-b.e);
  const out=[];let cluster=[],end=-1,ends=[];
  const flush=()=>{cluster.forEach(c=>{c.n=ends.length});out.push.apply(out,cluster);cluster=[];ends=[];end=-1};
  sorted.forEach(r=>{
    if(cluster.length&&r.s>=end)flush();
    let l=ends.findIndex(e=>e<=r.s);
    if(l<0){l=ends.length;ends.push(0)}
    ends[l]=r.e;end=Math.max(end,r.e);
    cluster.push({r:r,lane:l,n:1});
  });
  flush();return out;
}

/* ---------- header, banner, tabs ---------- */
function renderHead(){
  $('weekLabel').textContent=md(S.ws)+'（月）〜 '+md(addDays(S.ws,6))+'（日）';
}
function renderBanner(){
  const b=$('banner'),p=phase();
  const ord=order().map(k=>KINDS[k]).join(' → ');
  const msg=h('div',{class:'msg'});
  if(S.fail){msg.append(h('b',{text:'読み込みエラー'}),' '+S.fail)}
  else if(p==='closed'){
    msg.append(h('span',{class:'phase',text:PHASES.closed}),'この週の募集はまだ始まっていません。土曜の部会で募集を開始します。');
  }else if(p==='request'){
    msg.append(h('span',{class:'phase request',text:PHASES.request}),'空いている枠をタップして希望を出します。部会で優先度順に確定します。');
    msg.append(h('div',{class:'rank',text:'優先度：'+ord+'（同じ優先度は先に出した順）　1回の上限：'+durLabel(maxSlots())}));
    if(!S.isAdmin)msg.append(h('div',{class:'rank',text:'みんなの希望が点線で見えます。時間帯が被っても、ずらして収まれば自動で調整。出す前に「入れそうか」が表示されます。'}));
  }else{
    msg.append(h('span',{class:'phase free',text:PHASES.free}),'空いている枠をタップすると、その場で予約が確定します（先着順）。1回の上限：'+durLabel(maxSlots())+'。');
  }
  b.replaceChildren(msg);
  /* 希望で週間表が埋まっていても出せるように、タップ以外の入口も置く */
  if(p==='request'&&!S.fail)b.append(h('button',{class:'btn primary',onclick:()=>openAdd(defaultAddDay(),0),text:'＋ 希望を出す'}));
  if(S.isAdmin&&p==='request'&&!S.fail)b.append(h('button',{class:'btn',onclick:openSuggest,text:'調整の提案を見る'}));
  if(S.isAdmin&&p==='closed'&&!S.loading)b.append(h('button',{class:'btn primary',onclick:()=>saveCfg({phase:'request'}),text:'募集を開始する'}));
}
function renderTabs(){
  const tabs=[['today','今日'],['grid','週間表'],['list',S.isAdmin?'希望一覧':'自分の予約']];
  if(S.isAdmin)tabs.push(['admin','管理']);
  if(!tabs.some(t=>t[0]===S.tab))S.tab='grid';
  $('tabs').replaceChildren.apply($('tabs'),tabs.map(t=>h('button',{role:'tab','aria-selected':String(S.tab===t[0]),onclick:()=>{const was=S.tab;S.tab=t[0];S.armed=false;if(t[0]==='today'||t[0]==='grid')lsSet('kitami-tab',t[0]);if(t[0]==='today'&&was!=='today')goDay(S.dayOff||0);else render()},text:t[1]})));
}

/* ---------- weekly grid ---------- */
function block(r,lane,n){
  const st='top:'+(r.s*H+1)+'px;height:'+((r.e-r.s)*H-2)+'px;left:calc('+(lane/n*100)+'% + 2px);width:calc('+(100/n)+'% - 4px)';
  const cls='blk '+cc(r)+' '+r.status+(mine(r)?' mine':'')+(conflicts(r)?' clash':'')+(r._tmp?' saving':'');
  const flex=r.status==='pending'&&durOf(r)<r.e-r.s;
  const t0=S.plan.place.get(r.id);
  let kids;
  if(flex&&t0!=null){
    /* 時間帯（点線の枠）の中に、仮の配置を帯で重ねる */
    const d=durOf(r);
    kids=[h('div',{class:'plan',style:'top:'+((t0-r.s)*H)+'px;height:'+(d*H-1)+'px'},[
      h('span',{class:'n',text:nm(r)}),
      d>=2?h('span',{class:'t',text:'仮 '+tm(t0)+'–'+tm(t0+d)}):null
    ])];
  }else{
    kids=[h('span',{class:'n',text:nm(r)})];
    if(r.e-r.s>=2)kids.push(h('span',{class:'t',text:(r.status==='pending'?'希望 ':'')+range(r)+(flex?'（'+durLabel(durOf(r))+'）':'')}));
    if(r.e-r.s>=3&&r.band&&r.rep)kids.push(h('span',{class:'t',text:r.rep}));
  }
  const tg=r.status==='pending'?(conflicts(r)?['bad','被り']:clashes(r).length?['ok','調整']:null):null;
  if(tg)kids.push(h('span',{class:'tag '+tg[0],text:tg[1]}));
  return h('button',{class:cls,style:st,'aria-label':nm(r)+' '+(r.rep||'')+' '+DAYS[r.day]+'曜 '+range(r),onclick:e=>{e.stopPropagation();openDetail(r.id)}},kids);
}
function gridView(){
  const today=isoOf(new Date());
  const head=h('div',{class:'gh'},[h('div',{class:'corner'})]);
  const body=h('div',{class:'gb'});
  const tcol=h('div',{class:'tcol'});
  for(let i=0;i<SLOTS;i++)tcol.append(h('div',{class:i%2?'':'hr',text:tm(i)}));
  body.append(tcol);
  const add=canAdd();
  for(let d=0;d<7;d++){
    const iso=addDays(S.ws,d),isT=iso===today;
    head.append(h('div',{class:'dh'+(isT?' today':'')+(d===5?' sat':'')},[h('b',{text:DAYS[d]+'曜日'}),h('span',{text:md(iso)})]));
    const col=h('div',{class:'day'+(isT?' today':'')+(add?'':' ro')});
    const dayItems=visible().filter(r=>r.day===d);
    lanes(dayItems).forEach(x=>col.append(block(x.r,x.lane,x.n)));
    const zn=zonesFor(d,dayItems);
    const zone=(z,ok)=>h('div',{class:'clashzone'+(ok?' ok':''),style:'top:'+(z[0]*H)+'px;height:'+((z[1]-z[0])*H)+'px','aria-hidden':'true'});
    zn.ok.forEach(z=>col.append(zone(z,true)));
    zn.bad.forEach(z=>col.append(zone(z,false)));
    if(add)col.addEventListener('click',e=>{
      const y=e.clientY-col.getBoundingClientRect().top;
      openAdd(d,Math.max(0,Math.min(SLOTS-1,Math.floor(y/H))));
    });
    body.append(col);
  }
  const legend=h('div',{class:'legend'},[h('span',null,['色は、となり合う予約が見分けやすいよう自動で付きます'])]);
  if(phase()==='request')legend.append(h('span',null,[h('i',{class:'pend'}),'点線＝希望の時間帯（確定前・枠は押さえません）']),h('span',null,[h('i',{style:'background:var(--muted)'}),'色の帯＝調整後の仮の配置']),h('span',null,[h('i',{style:'background:repeating-linear-gradient(135deg,var(--bad) 0 3px,transparent 3px 6px);border:1px solid var(--bad)'}),'赤の斜線＝被っていて入りきらない']),h('span',null,[h('i',{style:'background:repeating-linear-gradient(135deg,var(--drum) 0 3px,transparent 3px 6px);border:1px solid var(--drum)'}),'黄の斜線＝時間帯は被るが調整で収まる']));
  legend.append(h('span',null,['黒い枠＝自分の分']));
  const wrap=h('div',{class:'grid-wrap',id:'gridWrap'},[head,body]);
  let tog=null;
  if(phase()==='request'&&!S.isAdmin){
    const cb=h('input',{type:'checkbox',id:'showAll',checked:S.showAll||null,onchange:e=>{S.showAll=e.target.checked;lsSet('kitami-showall',S.showAll?'1':'0');render()}});
    tog=h('label',{class:'row',style:'gap:6px;font-weight:700;font-size:13.5px'},[cb,'みんなの希望も表示する']);
  }
  const out=h('div',{style:'display:flex;flex-direction:column;gap:10px'},[statusStrip(),tog,legend,wrap]);
  if(!S.loading&&!visible().length)out.append(h('div',{class:'empty-hint',text:add?'まだ予約はありません。空いている時間をタップして追加できます。':'まだ予約はありません。'}));
  return out;
}

/* ---------- list ---------- */
function actions(r,done){
  const a=[];
  const after=()=>{if(done)done()};
  if(S.isAdmin){
    if(r.status==='pending'){
      a.push(h('button',{class:'btn sm primary',onclick:async()=>{
        const d=durOf(r),t=S.plan.place.get(r.id),s=t!=null?t:r.s,e=s+d;
        if(S.reqs.some(o=>o.status==='confirmed'&&o.id!==r.id&&overlap(o,{day:r.day,s:s,e:e}))){toast('確定済みの予約と重なっています');return}
        await patchReq(r.id,{status:'confirmed',s:s,e:e,ws:r.s,we:r.e});after();
      },text:'確定'}));
      a.push(h('button',{class:'btn sm',onclick:async()=>{await patchReq(r.id,{status:'rejected'});after()},text:'見送り'}));
    }else{
      a.push(h('button',{class:'btn sm',onclick:async()=>{await patchReq(r.id,r.ws!=null?{status:'pending',s:r.ws,e:r.we}:{status:'pending'});after()},text:r.status==='confirmed'?'確定を取り消す':'希望に戻す'}));
    }
  }
  if(S.isAdmin||(mine(r)&&r.status==='pending')){
    a.push(h('button',{class:'btn sm',onclick:()=>{closeSheet();openAdd(r.day,r.s,r)},text:'内容を変更'}));
  }
  if(S.isAdmin||mine(r)){
    const armed=S.delArm===r.id;
    a.push(h('button',{class:'btn sm danger',onclick:async()=>{
      if(!armed){S.delArm=r.id;render();return}
      S.delArm=null;await delReq(r.id);after();
    },text:armed?'本当に削除':'削除'}));
  }
  return a;
}
function kindSelect(r){
  const s=h('select',{class:'sel-sm','aria-label':'優先度の種別'},KEYS.map(k=>h('option',{value:k,text:KINDS[k]})));
  s.value=r.kind;
  s.addEventListener('change',()=>patchReq(r.id,{kind:s.value}));
  return s;
}
const ST={pending:'希望',confirmed:'確定',rejected:'見送り'};
