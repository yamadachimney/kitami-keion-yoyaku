
/* ---------- 調整の提案（運営） ----------
   入りきらない日について、だれの練習時間を30分ずつ削れば全員入るかを探す。
   削るのは1時間まで（それより短くはしない）。削る量が少ない案 → 削る人が少ない案の順。
   同じなら、優先度が低い・後から出した希望から削る案を先に出す */
const MIN_SLOTS=2;
/* 1週間のバンドごとの練習量（確定＋希望の練習時間）。均等になるよう、多いバンドから削る・取り消す */
function bandKey(r){return (r.band||r.rep||'').replace(/\s+/g,'').toLowerCase()}
function weekLoad(){
  const m=new Map();
  live().forEach(r=>{if(r.kind!=='band'||isMeeting(r))return;const k=bandKey(r);if(!k)return;const o=m.get(k)||{name:nm(r),n:0,sl:0};o.n++;o.sl+=r.status==='confirmed'?r.e-r.s:durOf(r);m.set(k,o)});
  return m;
}
function loadOf(r,W){const o=(W||weekLoad()).get(bandKey(r));return o?o.sl:0}
function loadLabel(r,W){const o=(W||weekLoad()).get(bandKey(r));return o&&r.kind==='band'?'今週 '+o.n+'回・計'+durLabel(o.sl):''}
function defaultAddDay(){const t=mondayOf(new Date());if(t!==S.ws)return 0;return (new Date().getDay()+6)%7}
function dayOcc(items){const occ=new Array(SLOTS).fill(false);items.filter(r=>r.status==='confirmed').forEach(r=>{for(let i=r.s;i<r.e;i++)occ[i]=true});return occ}
function suggestDay(d,onlyBand){
  const items=live().filter(r=>r.day===d&&(r.status==='confirmed'||!onlyBand||r.kind==='band')),occ=dayOcc(items);
  const pend=items.filter(r=>r.status==='pending').map(r=>Object.assign({},r,{dur:durOf(r)}));
  if(!pend.length||feasible(pend,occ))return null;
  const W=weekLoad();
  const cand=pend.filter(r=>r.dur>MIN_SLOTS).sort((a,b)=>rankOf(b.kind)-rankOf(a.kind)||loadOf(b,W)-loadOf(a,W)||(b.createdAt||0)-(a.createdAt||0));
  const maxCut=cand.reduce((a,r)=>a+r.dur-MIN_SLOTS,0);
  const sols=[];let calls=0;const LIMIT=1500;
  const cut=new Array(cand.length).fill(0);
  function go(i,left){
    if(sols.length>=12||calls>=LIMIT)return;
    if(i===cand.length){
      if(left)return;calls++;
      const test=pend.map(r=>{const j=cand.indexOf(r);return j>=0&&cut[j]?Object.assign({},r,{dur:r.dur-cut[j]}):r});
      const f=feasible(test,occ);
      if(f)sols.push({cuts:cand.map((r,j)=>cut[j]?{r:r,from:r.dur,to:r.dur-cut[j]}:null).filter(Boolean),place:f,test:test});
      return;
    }
    const rest=cand.slice(i+1).reduce((a,r)=>a+r.dur-MIN_SLOTS,0);
    for(let c=Math.min(left,cand[i].dur-MIN_SLOTS);c>=0;c--){if(left-c>rest)break;cut[i]=c;go(i+1,left-c)}
    cut[i]=0;
  }
  for(let k=1;k<=maxCut&&!sols.length&&calls<LIMIT;k++)go(0,k);
  const fair=s=>s.cuts.reduce((a,c)=>a+loadOf(c.r,W),0)/s.cuts.length;
  sols.sort((a,b)=>a.cuts.length-b.cuts.length||fair(b)-fair(a));
  if(sols.length)return {day:d,sols:sols.slice(0,3),n:pend.length};
  /* 全員1時間にしても入らないとき：それでも入らない希望を出す */
  const min=pend.map(r=>Object.assign({},r,{dur:Math.min(r.dur,MIN_SLOTS)})).sort(byDecision);
  let acc=[];const out=[];min.forEach(r=>{const t=acc.concat([r]);if(feasible(t,occ))acc=t;else out.push(r)});
  return {day:d,none:true,out:out,n:pend.length};
}
function openSuggest(){
  const res=[0,1,2,3,4,5,6].map(suggestDay).filter(Boolean);
  const kids=[h('h3',{text:'調整の提案'}),
    h('p',{class:'rank',text:'入りきらない日だけ出ます。練習時間を30分ずつ削って全員入る案です（1時間より短くはしません）。削る量が少ない案から並んでいます。'})];
  if(!res.length)kids.push(h('div',{class:'clashbox okbox'},[h('div',{class:'ttl',text:'今の希望なら、削らなくても全員入ります'})]));
  res.forEach(x=>{
    const dl=DAYS[x.day]+'曜 '+md(addDays(S.ws,x.day));
    if(x.none){
      kids.push(h('div',{class:'clashbox'},[h('div',{class:'ttl',text:dl+'：全員1時間にしても入りきりません'}),
        h('div',{class:'hint',text:'優先度順に入れていくと、次の希望が残ります。時間帯を広げてもらうか、別の日に移すか、取り下げの相談が必要です。'}),
        h('div',{class:'memv'},x.out.map(r=>h('div',null,[h('b',{text:nm(r)}),' '+range(r)+'（'+KINDS[r.kind]+'）'])))]));
      return;
    }
    const box=h('div',{class:'card tight sugg'},[h('h2',{text:dl+'（希望 '+x.n+'件）'})]);
    x.sols.forEach((sol,i)=>{
      const total=sol.cuts.reduce((a,c)=>a+c.from-c.to,0);
      const times=sol.test.slice().sort((a,b)=>sol.place.get(a.id)-sol.place.get(b.id)).map(r=>{const t=sol.place.get(r.id);const c=sol.cuts.find(z=>z.r.id===r.id);return h('div',{class:'stime'+(c?' cut':'')},[h('span',{class:'tm',text:tm(t)+'–'+tm(t+r.dur)}),h('span',{text:nm(r)+(c?'（'+durLabel(c.from)+'→'+durLabel(c.to)+'）':'')})])});
      const apply=h('button',{class:'btn primary sm',text:'この案にする',onclick:async()=>{
        if(apply.dataset.a!=='1'){apply.dataset.a='1';apply.textContent='もう一度押すと練習時間を変更します';return}
        apply.disabled=true;
        try{for(const c of sol.cuts)await updReq(c.r.id,{dur:c.to});toast('練習時間を変更しました。本人にも伝えてください');closeSheet()}catch(e){apply.disabled=false}
      }});
      box.append(h('div',{class:'sopt'},[
        h('div',{class:'shead'},[h('b',{text:'案'+(i+1)}),h('span',{class:'rank',text:'合計 '+durLabel(total)+' 削る・'+sol.cuts.length+'人'})]),
        h('div',{class:'memv'},sol.cuts.map(c=>h('div',null,[h('b',{text:nm(c.r)}),' を '+durLabel(c.from)+' → ',h('b',{class:'cutto',text:durLabel(c.to)})]))),
        h('details',null,[h('summary',{text:'この案での仮の時間'}),h('div',{class:'stimes'},times)]),
        h('div',{class:'row'},[apply])]));
    });
    kids.push(box);
  });
  kids.push(h('div',{class:'row',style:'justify-content:flex-end'},[h('button',{class:'btn',onclick:closeSheet,text:'閉じる'})]));
  layer(h('div',{class:'sheet wide',role:'dialog','aria-modal':'true'},kids));
}

/* ---------- 被りの整理 ----------
   入りきらない希望がある日ごとに、どこで被っているかを1枚の図で見せて、
   「だれを取り消せば（見送りにすれば）残りが全員入るか」を出す。バンド練習だけで見ることもできる */
function conflictDay(d,onlyBand){
  const items=live().filter(r=>r.day===d&&(r.status==='confirmed'||(r.status==='pending'&&(!onlyBand||r.kind==='band'))));
  const occ=dayOcc(items),sim=simulate(items);
  const pend=items.filter(r=>r.status==='pending').map(r=>Object.assign({},r,{dur:durOf(r)}));
  const bad=pend.filter(r=>sim.bad.has(r.id));
  if(!bad.length)return null;
  /* 入らない希望と時間帯でつながっている希望をまとめる */
  const grp=new Set(bad.map(r=>r.id));let grew=true;
  while(grew){grew=false;pend.forEach(r=>{if(grp.has(r.id))return;if(pend.some(o=>grp.has(o.id)&&effOverlap(r,o))){grp.add(r.id);grew=true}})}
  const group=pend.filter(r=>grp.has(r.id)).sort((a,b)=>a.s-b.s||byDecision(a,b));
  /* 取り消し案：少ない人数で、優先度が低い・後から出した希望から */
  const W=weekLoad();
  const cand=group.slice().sort((a,b)=>rankOf(b.kind)-rankOf(a.kind)||loadOf(b,W)-loadOf(a,W)||(b.createdAt||0)-(a.createdAt||0));
  const sols=[];let calls=0;
  const tryK=(k,start,picked)=>{
    if(sols.length>=8||calls>600)return;
    if(picked.length===k){calls++;const rest=pend.filter(r=>picked.indexOf(r)<0);const f=feasible(rest,occ);if(f)sols.push({rm:picked.slice(),place:f,rest:rest});return}
    for(let i=start;i<cand.length;i++){picked.push(cand[i]);tryK(k,i+1,picked);picked.pop()}
  };
  for(let k=1;k<=Math.min(3,cand.length)&&!sols.length;k++)tryK(k,0,[]);
  sols.sort((a,b)=>b.rm.reduce((t,r)=>t+loadOf(r,W),0)/b.rm.length-a.rm.reduce((t,r)=>t+loadOf(r,W),0)/a.rm.length);sols.splice(3);
  const lo=Math.min.apply(null,group.map(r=>r.s)),hi=Math.max.apply(null,group.map(r=>r.e));
  const conf=items.filter(r=>r.status==='confirmed'&&r.s<hi&&lo<r.e);
  return {day:d,group:group,bad:new Set(bad.map(r=>r.id)),place:sim.place,sols:sols,conf:conf,lo:lo,hi:hi};
}
function dayChart(x){
  const span=x.hi-x.lo,pct=v=>((v-x.lo)/span*100)+'%';
  const wrap=h('div',{class:'tl daychart'});
  const ax=h('div',{class:'ax'});
  for(let i=x.lo;i<=x.hi;i++)if(i%2===0||i===x.lo||i===x.hi){if(span>8&&i!==x.lo&&i!==x.hi&&i%4!==0)continue;ax.append(h('span',{style:'left:'+pct(i),text:tm(i)}))}
  wrap.append(ax);
  x.conf.forEach(c=>wrap.append(h('div',{class:'lbl',text:nm(c)+'（確定済み）'}),h('div',{class:'tr'},[h('div',{class:'bar solid cm',style:'left:'+pct(Math.max(c.s,x.lo))+';width:'+pct(x.lo+Math.min(c.e,x.hi)-Math.max(c.s,x.lo))})])));
  x.group.forEach(r=>{
    const isBad=x.bad.has(r.id),t=x.place.get(r.id),ex=exSet(r);
    const row=h('div',{class:'tr'},[h('div',{class:'bar '+(isBad?'badbar':'okbar'),style:'left:'+pct(r.s)+';width:'+pct(x.lo+r.e-r.s)})]);
    if(ex)for(let i=r.s;i<r.e;i++)if(ex.has(i))row.append(h('div',{class:'exbar',style:'left:'+pct(i)+';width:'+pct(x.lo+1)}));
    if(t!=null)row.append(h('div',{class:'pl okpl',style:'left:'+pct(t)+';width:'+pct(x.lo+r.dur)}));
    wrap.append(h('div',{class:'lbl'},[h('b',{text:nm(r)}),'　'+KINDS[r.kind]+'・'+durLabel(r.dur)+(loadLabel(r)?'（'+loadLabel(r)+'）':'')+'　',h('span',{class:'chip '+(isBad?'rejected':'confirmed'),text:isBad?'入らない':'入る '+tm(t)+'–'+tm(t+r.dur)})]),row);
  });
  return wrap;
}
function openConflicts(onlyBand){
  if(onlyBand==null)onlyBand=S.cfOnlyBand!=null?S.cfOnlyBand:true;
  S.cfOnlyBand=onlyBand;
  const res=[0,1,2,3,4,5,6].map(d=>conflictDay(d,onlyBand)).filter(Boolean);
  const seg=h('div',{class:'seg',style:'align-self:flex-start'},[[true,'バンド練習だけ'],[false,'全部']].map(o=>h('button',{'aria-pressed':String(onlyBand===o[0]),onclick:()=>openConflicts(o[0]),text:o[1]})));
  const W=weekLoad(),arr=[...W.values()].sort((a,b)=>b.sl-a.sl);
  let panel=null;
  if(arr.length){
    const mx=arr[0].sl,mn=arr[arr.length-1].sl,avg=arr.reduce((a,o)=>a+o.sl,0)/arr.length;
    panel=h('details',{class:'wload'},[h('summary',{text:'バンドごとの今週の練習（'+arr.length+'バンド・最大 '+durLabel(mx)+'／最小 '+durLabel(mn)+'）'}),
      h('div',{class:'wl'},arr.map(o=>h('div',{class:'wlr'+(o.sl>avg+1?' hi':o.sl<avg-1?' lo':'')},[h('span',{class:'wn',text:o.name}),h('span',{class:'wb'},[h('i',{style:'width:'+(o.sl/mx*100)+'%'})]),h('span',{class:'wt',text:o.n+'回・'+durLabel(o.sl)})]))),
      h('div',{class:'rank',text:'確定＋希望の練習時間です。削る・取り消す案は、練習が多いバンドから先に出します。'})]);
  }
  const kids=[h('h3',{text:'被りの整理'}),seg,panel,
    h('p',{class:'rank',text:'点線の枠＝希望の時間帯、色の帯＝入る場所、赤＝入りきらない希望、灰色の斜線＝除外した時間。優先度順（'+order().map(k=>KINDS[k]).join('→')+'、同じなら先に出した順）で並べた結果です。'})];
  if(!res.length){kids.push(h('div',{class:'clashbox okbox'},[h('div',{class:'ttl',text:onlyBand?'バンド練習の希望は、被らずに全部入ります':'今の希望は、全部入ります'})]));
    if(S.isAdmin&&onlyBand&&S.reqs.some(r=>r.status==='pending'&&r.kind==='band')){const n=S.reqs.filter(r=>r.status==='pending'&&r.kind==='band').length;const b=h('button',{class:'btn primary',text:'バンド練習だけ先に確定（'+n+'件）',onclick:async()=>{if(b.dataset.a!=='1'){b.dataset.a='1';b.textContent='もう一度押すとバンド練習を確定';return}b.disabled=true;closeSheet();await confirmBand()}});kids.push(h('div',{class:'row'},[b]))}}
  res.forEach(x=>{
    const cut=suggestDay(x.day,onlyBand),canCut=cut&&cut.sols&&cut.sols.length;
    const box=h('div',{class:'card tight sugg'},[h('div',{class:'shead',style:'flex-wrap:wrap'},[h('h2',{text:DAYS[x.day]+'曜 '+md(addDays(S.ws,x.day))+'：入りきらない '+x.bad.size+'件'}),
      h('span',{class:'chip '+(canCut?'confirmed':'rejected'),text:canCut?'調整すれば全員入る':'調整だけでは入らない'})]),dayChart(x)]);
    if(canCut){
      const cb=h('div',{class:'clashbox okbox'},[h('div',{class:'ttl',text:'練習時間を短くすれば、取り消さずに全員入ります'}),
        h('div',{class:'hint',text:'30分ずつ、1時間までしか短くしません。削る量が少ない案から。'})]);
      cut.sols.forEach((sol,i)=>{
        const times=sol.test.slice().sort((a,b)=>sol.place.get(a.id)-sol.place.get(b.id)).map(r=>{const t=sol.place.get(r.id),c=sol.cuts.find(z=>z.r.id===r.id);return h('div',{class:'stime'+(c?' cut':'')},[h('span',{class:'tm',text:tm(t)+'–'+tm(t+r.dur)}),h('span',{text:nm(r)+(c?'（'+durLabel(c.from)+'→'+durLabel(c.to)+'）':'')})])});
        const kidsC=[h('div',null,[h('b',{text:'調整'+(i+1)+'　'}),sol.cuts.map(c=>nm(c.r)+' を '+durLabel(c.from)+'→'+durLabel(c.to)+(loadLabel(c.r)?'（'+loadLabel(c.r)+'）':'')).join('、')]),
          h('div',{class:'stimes'},times)];
        if(S.isAdmin){const b=h('button',{class:'btn sm primary',text:'この調整にする',onclick:async()=>{
          if(b.dataset.a!=='1'){b.dataset.a='1';b.textContent='もう一度押すと練習時間を変えます';return}
          b.disabled=true;try{for(const c of sol.cuts)await updReq(c.r.id,{dur:c.to});toast('調整しました。本人にも伝えてください');closeSheet();setTimeout(()=>openConflicts(onlyBand),600)}catch(e){b.disabled=false}}});kidsC.push(h('div',{class:'row'},[b]))}
        cb.append(h('div',{class:'sopt'},kidsC));
      });
      box.append(cb);
    }
    if(x.sols.length){
      box.append(h('div',{class:'shead'},[h('b',{text:canCut?'または、取り消せば全員入る案':'取り消せば全員入る案'})]));
      x.sols.forEach((sol,i)=>{
        const names=sol.rm.map(r=>nm(r)+'（'+tm(r.s)+'–'+tm(r.e)+(loadLabel(r)?'・'+loadLabel(r):'')+'）').join('、');
        const kidsS=[h('div',null,[h('b',{text:'案'+(i+1)+'　'}),names+' を取り消すと、残りは全員入ります'])];
        if(S.isAdmin){const b=h('button',{class:'btn sm',text:'この'+sol.rm.length+'件を見送りにする',onclick:async()=>{
          if(b.dataset.a!=='1'){b.dataset.a='1';b.textContent='もう一度押すと見送りにします';return}
          b.disabled=true;try{for(const r of sol.rm)await updReq(r.id,{status:'rejected'});toast('見送りにしました。本人にも伝えてください（希望一覧から「希望に戻す」もできます）');closeSheet();setTimeout(()=>openConflicts(onlyBand),600)}catch(e){b.disabled=false}}});kidsS.push(h('div',{class:'row'},[b]))}
        box.append(h('div',{class:'sopt'},kidsS));
      });
    }else box.append(h('div',{class:'hint',text:'1〜3件の取り消しでは全員入りません。時間帯を広げてもらうか、別の日に移す相談が必要です。'}));
    kids.push(box);
  });
  kids.push(h('div',{class:'row',style:'justify-content:flex-end'},[S.isAdmin?h('button',{class:'btn',onclick:openSuggest,text:'30分削る案を見る'}):null,h('button',{class:'btn',onclick:closeSheet,text:'閉じる'})]));
  layer(h('div',{class:'sheet wide',role:'dialog','aria-modal':'true'},kids));
}
