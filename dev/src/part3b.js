
/* ---------- overlaps ---------- */
function mergeIv(iv){
  iv.sort((x,y)=>x[0]-y[0]);
  const out=[];
  iv.forEach(z=>{
    const l=out[out.length-1];
    if(l&&z[0]<=l[1])l[1]=Math.max(l[1],z[1]);else out.push(z.slice());
  });
  return out;
}
/* 赤い斜線：管理者は全体の被り、それ以外は「自分の希望」が他と被っている部分だけ */
function zonesFor(d,items){
  const okIv=[];
  items.filter(r=>r.status==='pending'&&!conflicts(r)).forEach(r=>clashes(r).forEach(c=>okIv.push([c.s,c.e])));
  return {bad:mergeIv(items.filter(conflicts).map(r=>[r.s,r.e])),ok:mergeIv(okIv)};
}
function whoText(r){return r.band&&r.rep?r.band+'　'+r.rep:nm(r)}

/* 申請の状況まとめ：被って入りきらない希望を、押せる一覧で上に出す */
function statusStrip(){
  if(phase()!=='request')return null;
  const pend=(S.isAdmin?live():live().filter(mine)).filter(r=>r.status==='pending');
  if(!pend.length)return null;
  const bad=pend.filter(conflicts),ok=pend.filter(r=>!conflicts(r)&&clashes(r).length);
  const strip=h('div',{class:'strip'},[h('div',{class:'sum'},[
    h('span',{text:(S.isAdmin?'出ている希望 ':'あなたの希望 ')+pend.length+'件'}),
    h('span',{class:'n-ok',text:'時間帯は被るが調整で収まる '+ok.length+'件'}),
    h('span',{class:'n-bad',text:'被っていて入りきらない '+bad.length+'件'})
  ])]);
  bad.forEach(r=>strip.append(h('button',{class:'btn jump',onclick:()=>openDetail(r.id)},[
    h('span',{class:'tag bad',style:'position:static',text:'被り'}),
    h('span',{text:whoText(r)+'　'+DAYS[r.day]+'曜 '+range(r)+'（'+durLabel(durOf(r))+'）'})
  ])));
  if(bad.length)strip.append(h('div',{class:'rank',text:S.isAdmin?'押すと、被っている相手と時間が見られます。':'押すと、被っている相手と時間が見られます。相手と相談して、時間帯を広げるか取り下げてください。'}));
  return strip;
}

/* 自分の時間帯と相手の時間帯を、同じ横軸に並べて見せる */
function timeline(r,cs,bad){
  const pct=v=>(Math.min(v,SLOTS)/SLOTS*100)+'%';
  const wrap=h('div',{class:'tl'});
  const ax=h('div',{class:'ax'});
  [0,6,12,18,SLOTS].forEach(i=>ax.append(h('span',{style:'left:'+pct(i),text:tm(i).replace(':00','時')})));
  wrap.append(ax);
  const ov=c=>h('div',{class:'ov'+(bad?'':' ok'),style:'left:'+pct(c.s)+';width:'+pct(c.e-c.s)});
  const mineRow=h('div',{class:'tr'},[h('div',{class:'bar '+cc(r),style:'left:'+pct(r.s)+';width:'+pct(r.e-r.s)})]);
  const t0=S.plan.place.get(r.id);
  if(t0!=null)mineRow.append(h('div',{class:'pl '+cc(r),style:'left:'+pct(t0)+';width:'+pct(durOf(r))}));
  cs.forEach(c=>mineRow.append(ov(c)));
  wrap.append(h('div',{class:'lbl',text:'この希望の時間帯 '+range(r)+(t0!=null?'（色の帯＝仮の配置）':'')}),mineRow);
  cs.forEach(c=>{
    const o=c.o,same=o.uid&&o.uid===r.uid;
    wrap.append(h('div',{class:'lbl',text:(same?'同じ人の別の希望：':'')+whoText(o)+'　'+range(o)}),
      h('div',{class:'tr'},[h('div',{class:'bar '+cc(o)+(o.status==='confirmed'?' solid':''),style:'left:'+pct(o.s)+';width:'+pct(o.e-o.s)}),ov(c)]));
  });
  return wrap;
}
function clashBox(r){
  if(r.status!=='pending')return null;
  const cs=clashes(r);
  if(!cs.length)return null;
  const bad=conflicts(r),t0=S.plan.place.get(r.id);
  const box=h('div',{class:'clashbox'+(bad?'':' okbox')},[h('div',{class:'ttl',text:bad?'時間帯が被っていて、このままだと入りきりません（'+cs.length+'件）':'時間帯は被っていますが、調整すれば収まります（'+cs.length+'件）'})]);
  if(!bad&&t0!=null)box.append(h('div',{class:'sub',text:'仮の配置：'+tm(t0)+'–'+tm(t0+durOf(r))+'（部会で確定します）'}));
  box.append(timeline(r,cs,bad));
  cs.forEach(c=>box.append(h('div',{class:'cl '+cc(c.o)},[
    h('div',{class:'dot'}),
    h('div',{style:'min-width:0'},[
      h('div',{class:'who',text:(c.o.uid&&c.o.uid===r.uid?'【同じ人の別の希望】 ':'')+whoText(c.o)}),
      h('div',{class:'sub',text:DAYS[c.o.day]+'曜 '+(c.o.status==='pending'?'希望の時間帯 ':'')+range(c.o)+(c.o.status==='pending'?'（'+durLabel(durOf(c.o))+'）':'')+'・'+KINDS[c.o.kind]+'・'+ST[c.o.status]}),
      h('div',{class:'sub',style:bad?'color:var(--bad)':'',text:tm(c.s)+'–'+tm(c.e)+' が重なっています'})
    ])
  ])));
  box.append(h('div',{class:'hint',text:!bad?'このまま部会で確定できます。時間帯を広げるとさらに調整しやすくなります。':S.isAdmin?'自動確定では、優先度の高い方が先に入り、入りきらない希望は見送りになります。':'本人同士で相談して、時間帯を広げるか、練習時間を短くするか、取り下げてください。'}));
  return box;
}

/* ---------- list ---------- */
function listView(){
  const only=S.isAdmin?!!S.onlyMine:true;
  const items=S.reqs.filter(r=>!only||mine(r));
  /* 曜日ごとにまとめて、その日の中は時間順（見送りは最後） */
  const rows=items.slice().sort((a,b)=>a.day-b.day||(Number(a.status==='rejected')-Number(b.status==='rejected'))||a.s-b.s||a.e-b.e||byDecision(a,b));
  const bar=h('div',{class:'row'});
  if(S.isAdmin){
    bar.append(h('label',{class:'row',style:'gap:6px'},[h('input',{type:'checkbox',id:'onlyMine',checked:S.onlyMine||null,onchange:e=>{S.onlyMine=e.target.checked;render()}}),'自分の分だけ表示']));
    bar.append(h('span',{class:'rank',text:'曜日ごと・時間順に並んでいます。確定は '+order().map(k=>KINDS[k]).join('→')+' の順'}));
  }else{
    bar.append(h('span',{class:'rank',text:'あなたが出した希望と予約です。'}));
  }
  const list=h('div',{class:'list'});
  if(!rows.length)list.append(h('div',{class:'empty-hint',text:only&&S.isAdmin?'あなたの予約・希望はまだありません。':S.isAdmin?'この週の予約・希望はまだありません。':'まだ予約・希望はありません。週間表の空いている時間をタップして追加できます。'}));
  let lastDay=-1;
  rows.forEach(r=>{
    if(r.day!==lastDay){lastDay=r.day;const n=rows.filter(x=>x.day===r.day).length,nb=rows.filter(x=>x.day===r.day&&x.status==='pending'&&conflicts(x)).length;
      list.append(h('div',{class:'dayhd'+(r.day===5?' sat':r.day===6?' sun':'')},[h('b',{text:DAYS[r.day]+'曜 '+md(addDays(S.ws,r.day))}),h('span',{text:n+'件'+(nb?'　被り '+nb+'件':'')})]))}
    const acts=actions(r);
    if(S.isAdmin)acts.unshift(kindSelect(r));
    const cb=r.status==='rejected'?null:clashBox(r);
    list.append(h('div',{class:'li '+cc(r)+' '+r.status},[
      h('div',{class:'dot'}),
      h('div',{style:'min-width:0'},[
        h('div',{class:'nm',text:nm(r)}),
        h('div',{class:'meta',text:(r.rep&&r.band?'代表 '+r.rep+'　':'')+DAYS[r.day]+'曜 '+md(addDays(S.ws,r.day))+'　'+(r.status==='pending'?'時間帯 '+range(r)+'（'+durLabel(durOf(r))+'）':range(r))+'　'+KINDS[r.kind]+(r.status==='pending'&&exText(r)?'　'+exText(r):'')+(r.status==='pending'&&S.plan.place.has(r.id)?'　仮 '+tm(S.plan.place.get(r.id))+'–'+tm(S.plan.place.get(r.id)+durOf(r)):'')})
      ]),
      h('div',{class:'acts'},[h('span',{class:'chip '+r.status,text:ST[r.status]}),
        r.status==='pending'&&conflicts(r)?h('span',{class:'chip rejected',text:'被り'}):(r.status==='pending'&&clashes(r).length?h('span',{class:'chip pending',text:'調整OK'}):null)]),
      r.status==='rejected'&&mine(r)?h('div',{class:'rank',style:'grid-column:1/-1',text:'他の希望と重なったため見送りになりました。空いている時間であらためて申し込めます。'}):null,
      cb?h('div',{style:'grid-column:1/-1;display:flex;flex-direction:column'},[cb]):null,
      r.status==='confirmed'&&(S.isAdmin?mine(r):true)?h('div',{style:'grid-column:1/-1'},[calButtons(r)]):null,
      acts.length?h('div',{style:'grid-column:1/-1',class:'acts'},acts):null
    ]));
  });
  return h('div',{style:'display:flex;flex-direction:column;gap:10px'},[bar,calBulk(),list]);
}
