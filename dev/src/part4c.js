function openDetail(id){
  const r=S.reqs.find(x=>x.id===id);
  if(!r){closeSheet();return}
  if(r._tmp){toast('保存中です。少し待ってね');return}
  S.detailId=id;
  const kids=[
    h('div',{class:'row',style:'justify-content:space-between;flex-wrap:nowrap'},[h('h3',{style:'overflow-wrap:anywhere',text:nm(r)}),h('span',{class:'chip '+r.status,text:ST[r.status]})]),
    h('div',{class:'big',text:DAYS[r.day]+'曜 '+md(addDays(S.ws,r.day))+'　'+range(r)}),
    h('div',{class:'rank',text:(r.rep&&r.band?'代表 '+r.rep+'　':'')+KINDS[r.kind]+(r.status==='pending'?'　希望の時間帯・練習 '+durLabel(durOf(r)):'')+(r.status==='pending'&&exText(r)?'　'+exText(r):'')})
  ];
  const t0=S.plan.place.get(r.id);
  if(r.status==='pending'&&t0!=null)kids.push(h('div',{class:'rank',text:'仮の配置：'+tm(t0)+'–'+tm(t0+durOf(r))+'（部会で確定します）'}));
  const cb=r.status==='rejected'?null:clashBox(r);
  if(cb)kids.push(cb);
  const cal=calButtons(r);if(cal)kids.push(cal);
  if(S.isAdmin)kids.push(h('div',{class:'field'},[h('span',{class:'lb',text:'種別（優先度）を変更'}),kindSelect(r)]));
  const more=(canAdd()&&mine(r))?[h('button',{class:'btn sm',onclick:()=>{closeSheet();openAdd(r.day,Math.min(SLOTS-1,r.e))},text:'続けて追加'})]:
    (phase()==='request'&&!mine(r))?[h('button',{class:'btn sm primary',onclick:()=>{closeSheet();openAdd(r.day,r.s)},text:'この時間帯に自分も希望を出す'})]:[];
  kids.push(h('div',{class:'row'},actions(r,closeSheet).concat(more,[h('button',{class:'btn sm',onclick:closeSheet,text:'閉じる'})])));
  layer(h('div',{class:'sheet',role:'dialog','aria-modal':'true'},kids));
}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet()});

/* ---------- render & boot ---------- */
function render(){
  const m=S.mode||'yoyaku',yo=m==='yoyaku';
  $('modeLbl').textContent=yo?'部室':modeName(m);
  $('weeknav').hidden=!yo;$('banner').hidden=!yo;$('tabs').hidden=!yo;
  if(!yo){renderInstall();renderFoot();$('view').replaceChildren(modeView());return}
  computePlan();colorMap();
  renderHead();renderInstall();renderBanner();renderTabs();renderFoot();
  const old=$('gridWrap'),sx=old?old.scrollLeft:0,sy=old?old.scrollTop:0;
  $('view').replaceChildren(S.tab==='today'?todayView():S.tab==='grid'?gridView():S.tab==='list'?listView():adminView());
  const nw=$('gridWrap');if(nw){nw.scrollLeft=sx;nw.scrollTop=sy}
  if(S.detailId)openDetail(S.detailId);
}
function boot(){
  S.ws=defaultWeek();
  S.mode=(['yoyaku','live','supply'].indexOf(lsGet('kitami-mode'))>=0)?lsGet('kitami-mode'):'yoyaku';
  $('menuBtn').onclick=openMenu;
  S.showAll=lsGet('kitami-showall')!=='0';
  S.tab=lsGet('kitami-tab')==='today'?'today':'grid';
  if(S.tab==='today')S.ws=mondayOf(new Date());
  $('prev').onclick=()=>{S.ws=addDays(S.ws,-7);load()};
  $('next').onclick=()=>{S.ws=addDays(S.ws,7);load()};
  $('goNow').onclick=()=>{S.ws=mondayOf(new Date());load()};
  render();
  if(!fbInit()){S.loading=false;render();return}
  S.appUrl=location.origin+location.pathname;
  /* 運営アカウントでログイン中かどうか */
  FBX.adminAuth.onAuthStateChanged(u=>{
    S.isAdmin=!!u&&u.email===ADMIN_EMAIL;
    if(!S.isAdmin&&S.tab==='admin')S.tab='grid';
    render();
  });
  /* メンバーは自動で匿名ログイン（このスマホの「自分」を覚えるため。操作は不要） */
  FBX.auth.onAuthStateChanged(async u=>{
    if(!u){
      try{await FBX.auth.signInAnonymously()}
      catch(e){S.loading=false;S.fail='接続できませんでした。電波を確認して、ページを開き直してください';render()}
      return;
    }
    S.uid=u.uid;
    if(FBX.ref){FBX.ref.off();FBX.ref=null}
    load();subscribeMode();
  });
  /* 画面を閉じて1分たったら接続を切る（同時接続数を節約）。戻ったらすぐつなぎ直す */
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){FBX.offT=setTimeout(()=>{FBX.db.goOffline();FBX.adminDb.goOffline()},60000)}
    else{clearTimeout(FBX.offT);FBX.db.goOnline();FBX.adminDb.goOnline()}
  });
}
boot();
})();
