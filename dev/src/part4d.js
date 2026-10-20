
/* ---------- 調整の提案（運営） ----------
   入りきらない日について、だれの練習時間を30分ずつ削れば全員入るかを探す。
   削るのは1時間まで（それより短くはしない）。削る量が少ない案 → 削る人が少ない案の順。
   同じなら、優先度が低い・後から出した希望から削る案を先に出す */
const MIN_SLOTS=2;
function defaultAddDay(){const t=mondayOf(new Date());if(t!==S.ws)return 0;return (new Date().getDay()+6)%7}
function dayOcc(items){const occ=new Array(SLOTS).fill(false);items.filter(r=>r.status==='confirmed').forEach(r=>{for(let i=r.s;i<r.e;i++)occ[i]=true});return occ}
function suggestDay(d){
  const items=live().filter(r=>r.day===d),occ=dayOcc(items);
  const pend=items.filter(r=>r.status==='pending').map(r=>Object.assign({},r,{dur:durOf(r)}));
  if(!pend.length||feasible(pend,occ))return null;
  const cand=pend.filter(r=>r.dur>MIN_SLOTS).sort((a,b)=>rankOf(b.kind)-rankOf(a.kind)||(b.createdAt||0)-(a.createdAt||0));
  const maxCut=cand.reduce((a,r)=>a+r.dur-MIN_SLOTS,0);
  const sols=[];let calls=0;const LIMIT=1500;
  const cut=new Array(cand.length).fill(0);
  function go(i,left){
    if(sols.length>=6||calls>=LIMIT)return;
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
  sols.sort((a,b)=>a.cuts.length-b.cuts.length);
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
