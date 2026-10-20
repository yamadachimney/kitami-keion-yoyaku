function openDone(day,idx,booked){
  layer(h('div',{class:'sheet',role:'dialog','aria-modal':'true'},[
    h('h3',{text:booked?'予約しました':'希望を出しました'}),
    h('p',{style:'margin:0;color:var(--muted)',text:'同じバンドで、ほかの日やほかの時間も、続けて何件でも申し込めます（名前は入力済みになります）。'}),
    h('div',{class:'row',style:'justify-content:flex-end'},[
      h('button',{class:'btn',onclick:closeSheet,text:'閉じる'}),
      h('button',{class:'btn primary',onclick:()=>openAdd(day,Math.min(SLOTS-1,idx)),text:'続けて追加する'})
    ])
  ]));
}
function openAdd(day,idx,edit,draft){
  S.detailId=null;
  const max=maxSlots();
  const free=phase()==='free';
  const wasConfirmed=!!edit&&edit.status==='confirmed';
  const heading=edit?'内容を変更':(free?'予約する':'希望を出す');
  let f;
  if(draft)f=Object.assign({},draft.f);
  else if(edit)f={day:edit.day,s:edit.s,e:edit.e,dur:durOf(edit)};
  else if(!free){
    const e=Math.min(SLOTS,idx+8),dur=Math.min(4,max);
    f={day:day,s:Math.max(0,Math.min(idx,e-dur)),e:e,dur:dur};
  }else f={day:day,s:idx,e:Math.min(SLOTS,idx+Math.min(2,max)),dur:2};

  const fixedIn=h('input',{type:'checkbox',id:'fFixed'});
  const fixed=(S.isAdmin&&!free&&!edit)?h('label',{class:'row',style:'gap:6px;font-size:13px'},[fixedIn,'確定済みとして登録する（部会などの固定枠）']):null;
  /* 希望募集中は「練習できる時間帯＋練習時間」、自由予約や固定枠はぴったりの時間 */
  const isFlex=()=>!fixedIn.checked&&(edit?edit.status==='pending':!free);

  const selDay=h('select',{id:'fDay'},[0,1,2,3,4,5,6].map(d=>h('option',{value:d,text:DAYS[d]+'曜 '+md(addDays(S.ws,d))})));
  const selS=h('select',{id:'fS'},Array.from({length:SLOTS},(_,i)=>h('option',{value:i,text:tm(i)})));
  const selE=h('select',{id:'fE'},Array.from({length:SLOTS},(_,i)=>h('option',{value:i+1,text:tm(i+1)})));
  const selDur=h('select',{id:'fDur'},Array.from({length:Math.max(max,f.dur)},(_,i)=>h('option',{value:i+1,text:durLabel(i+1)})));
  const lbS=h('label',{for:'fS'}),lbE=h('label',{for:'fE'});
  const timeLb=h('span',{class:'lb'});
  const durLb=h('label',{for:'fDur'});
  const durField=h('div',{class:'field'},[durLb,selDur]);
  const pv=h('div',{'aria-live':'polite'});
  /* 出す前に、今出ている希望・予約と比べて「入れそうか」を表示 */
  function renderPreview(fl){
    pv.replaceChildren();
    if(f.e<=f.s)return;
    const others=live().filter(o=>(!edit||o.id!==edit.id)&&o.day===f.day);
    const near=others.filter(o=>o.s<f.e&&f.s<o.e).sort((a,b)=>a.s-b.s);
    const row=o=>h('div',{class:'sub',text:'・'+whoText(o)+'　'+(o.status==='pending'?'希望 '+range(o)+'（'+durLabel(durOf(o))+'）':'確定 '+range(o))});
    let box;
    if(!fl){
      if(!near.length)box=h('div',{class:'clashbox okbox'},[h('div',{class:'ttl',text:'この時間は空いています'})]);
      else{box=h('div',{class:'clashbox'},[h('div',{class:'ttl',text:'この時間にはもう予約があります'})]);near.forEach(o=>box.append(row(o)))}
      pv.append(box);return;
    }
    const kv=kindEl?kindEl.value:'band';
    const cand={id:'__new',kind:kv,day:f.day,s:f.s,e:f.e,dur:f.dur,status:'pending',createdAt:edit?(edit.createdAt||0):Date.now()};
    const before=simulate(others);
    const after=simulate(others.concat([cand]));
    const t=after.place.get('__new');
    const pushed=others.filter(o=>o.status==='pending'&&!before.bad.has(o.id)&&after.bad.has(o.id));
    if(t!=null){
      box=h('div',{class:'clashbox okbox'},[h('div',{class:'ttl',text:'今の希望だと入れそうです（仮 '+tm(t)+'–'+tm(t+f.dur)+'）'})]);
      if(pushed.length){
        box.append(h('div',{class:'sub',style:'color:var(--bad)',text:'※ 優先度の関係で、次の希望が入らなくなります：'}));
        pushed.forEach(o=>box.append(row(o)));
      }
    }else{
      box=h('div',{class:'clashbox'},[h('div',{class:'ttl',text:'今の希望だと入りきりません（被り）'}),
        h('div',{class:'hint',text:'時間帯を広げるか、別の時間・日にすると入りやすくなります。'})]);
    }
    if(near.length){
      box.append(h('div',{class:'sub',style:'margin-top:4px;font-weight:700',text:'この時間帯に出ている希望・予約（'+near.length+'件）'}));
      near.forEach(o=>box.append(row(o)));
    }else box.append(h('div',{class:'sub',text:'この時間帯には、まだ誰も希望を出していません。'}));
    pv.append(box);
  }
  let kindEl=null;

  function refresh(){
    const fl=isFlex();
    selDay.value=f.day;selS.value=f.s;selE.value=f.e;selDur.value=f.dur;
    timeLb.textContent=fl?'練習できる時間帯':'時間';
    lbS.textContent=fl?'から':'開始';lbE.textContent=fl?'まで':'終了';
    durLb.textContent='練習時間（上限 '+durLabel(max)+'）';
    durField.hidden=!fl;
    renderPreview(fl);
  }
  selDay.onchange=()=>{f.day=+selDay.value;refresh()};
  selS.onchange=()=>{
    f.s=+selS.value;
    const need=isFlex()?f.dur:1;
    if(f.e-f.s<need)f.e=Math.min(SLOTS,f.s+Math.max(need,isFlex()?need:2));
    if(f.e-f.s<need)f.s=Math.max(0,f.e-need);
    refresh();
  };
  selE.onchange=()=>{f.e=+selE.value;refresh()};
  selDur.onchange=()=>{
    f.dur=+selDur.value;
    if(f.e-f.s<f.dur){f.e=Math.min(SLOTS,f.s+f.dur);if(f.e-f.s<f.dur)f.s=Math.max(0,f.e-f.dur)}
    refresh();
  };
  fixedIn.onchange=refresh;

  const band=h('input',{type:'text',id:'fBand',maxlength:'20',placeholder:'例：エルレ',value:(draft?draft.band:edit?edit.band:lsGet('kitami-band'))||null,autocomplete:'off'});
  const rep=h('input',{type:'text',id:'fRep',maxlength:'20',placeholder:'例：齊藤直弥',value:(draft?draft.rep:edit?edit.rep:lsGet('kitami-rep'))||null,autocomplete:'off'});
  const kind=h('select',{id:'fKind'},KEYS.map(k=>h('option',{value:k,text:KINDS[k]})));
  kind.value=draft?draft.kind:edit?edit.kind:(lsGet('kitami-kind')||'band');
  kindEl=kind;kind.addEventListener('change',refresh);
  const err=h('div',{class:'err',role:'alert',text:draft&&draft.err?draft.err:null});
  if(draft&&draft.fixed)fixedIn.checked=true;
  const go=h('button',{class:'btn primary',text:edit?'変更を保存':(free?'この時間で予約する':'希望を出す'),onclick:async()=>{
    const bn=band.value.trim(),rn=rep.value.trim(),fl=isFlex(),fx=fixedIn.checked;
    err.textContent='';
    if(kind.value==='band'&&!bn){err.textContent='バンド名・予約名を入力してください';band.focus();return}
    if(!rn){err.textContent='代表者名を入力してください';rep.focus();return}
    if(f.e<=f.s){err.textContent='終了は開始より後にしてください';return}
    let dur=f.e-f.s;
    if(fl){
      dur=f.dur;
      if(dur>max){err.textContent='1回の上限は '+durLabel(max)+' です';return}
      if(f.e-f.s<dur){err.textContent='時間帯が練習時間（'+durLabel(dur)+'）より短いです。時間帯を広げてください';return}
    }else{
      if(!fx&&dur>max){err.textContent='1回の上限は '+durLabel(max)+' です。時間を短くしてください';return}
      const cand={day:f.day,s:f.s,e:f.e};
      if(live().some(o=>o.status==='confirmed'&&(!edit||o.id!==edit.id)&&overlap(o,cand))){err.textContent='その時間にはすでに確定した予約があります。別の時間を選んでください';return}
      if((free||wasConfirmed)&&live().some(o=>(!edit||o.id!==edit.id)&&overlap(o,cand))){err.textContent='その時間にはすでに予約があります。時間をずらしてください';return}
    }
    go.disabled=true;
    const body={band:bn,rep:rn,kind:kind.value,day:f.day,s:f.s,e:f.e,dur:dur};
    lsSet('kitami-band',bn);lsSet('kitami-rep',rn);lsSet('kitami-kind',kind.value);
    /* 先に閉じて画面に反映。保存は裏で続ける */
    closeSheet();
    const fSnap=Object.assign({},f);
    try{
      let newId=null;
      if(edit)await updReq(edit.id,body);
      else newId=await addReq(Object.assign({},body,{fixed:fx}));
      const id=edit?edit.id:newId;
      computePlan();
      const cur=S.reqs.find(x=>x.id===id);
      if(cur&&cur.status==='pending'&&clashes(cur).length)openDetail(id);
      else if(edit)toast('変更しました');
      else openDone(f.day,f.e,free||fx);
    }catch(e){
      /* 保存できなかったときは、入力した内容のままフォームを開き直す */
      openAdd(fSnap.day,fSnap.s,edit,{f:fSnap,band:bn,rep:rn,kind:kind.value,fixed:fx,err:(e.message||'保存できませんでした')+(e.retry?'（もう一度押してください）':'')});
    }
  }});
  refresh();
  layer(h('div',{class:'sheet',role:'dialog','aria-modal':'true','aria-label':heading},[
    h('h3',{text:heading}),
    h('div',{class:'field'},[h('label',{for:'fDay',text:'日付'}),selDay]),
    h('div',{class:'field'},[timeLb,h('div',{class:'two'},[
      h('div',{class:'field'},[lbS,selS]),
      h('div',{class:'field'},[lbE,selE])
    ])]),
    durField,
    pv,
    h('div',{class:'two'},[
      h('div',{class:'field'},[h('label',{for:'fBand',text:'バンド名・予約名'}),band]),
      h('div',{class:'field'},[h('label',{for:'fRep',text:'代表者名'}),rep])
    ]),
    h('div',{class:'field'},[h('label',{for:'fKind',text:'種別（優先度に使います）'}),kind]),
    fixed,
    err,
    h('div',{class:'row',style:'justify-content:flex-end'},[h('button',{class:'btn',onclick:closeSheet,text:'キャンセル'}),go])
  ]));
}
