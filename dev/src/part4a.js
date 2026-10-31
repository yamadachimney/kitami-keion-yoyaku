
/* ---------- admin ---------- */
async function autoConfirm(){
  toast('確定しています…');
  try{
    const r=await mutate('confirmAll',[S.ws,S.pin]);
    toast('確定 '+r.ok+'件'+(r.ng?'・入りきらず見送り '+r.ng+'件':'')+'。自由予約に切り替えました');
  }catch(e){}
}
async function confirmBand(){
  toast('バンド練習を確定しています…');
  try{
    const r=await mutate('confirmKind',[S.ws,'band']);
    toast(r.ok?'バンド練習 '+r.ok+'件を確定しました'+(r.ng?'（入りきらない '+r.ng+'件は希望のまま）':'')+'。ほかは希望のままです':'確定できるバンド練習の希望がありません');
  }catch(e){}
}
function bandConfirmBtn(small){
  const n=S.reqs.filter(r=>r.status==='pending'&&r.kind==='band').length;
  const armed=S.armK;
  return h('button',{class:'btn'+(small?'':' primary'),disabled:n===0||null,onclick:()=>{if(!armed){S.armK=true;render();return}S.armK=false;confirmBand()},
    text:armed?'もう一度押すとバンド練習を確定':'バンド練習だけ先に確定（'+n+'件'+(capOf()?'・各'+durLabel(capOf())+'まで':'')+'）'});
}
/* 部会（毎週ではない土曜 12:30〜13:30）をワンタップで入れる */
function meetingCard(){
  const sat=addDays(S.ws,5),lb=md(sat)+'（土）12:30〜13:30';
  const ex=live().find(r=>r.day===5&&isMeeting(r)&&r.status==='confirmed');
  const kids=[h('h2',{text:'部会'})];
  if(ex){
    kids.push(h('p',{text:md(sat)+'（土）'+range(ex)+' に部会が入っています。'}));
    const armed=S.meetArm===ex.id;
    kids.push(h('div',{class:'row'},[h('button',{class:'btn danger',onclick:async()=>{
      if(!armed){S.meetArm=ex.id;render();return}
      S.meetArm=null;try{await mutate('deleteReq',[ex.id,S.uid,S.pin],'部会を取り消しました')}catch(e){}
    },text:armed?'もう一度押すと取り消します':'この週の部会を取り消す'}),
      armed?h('button',{class:'btn sm',onclick:()=>{S.meetArm=null;render()},text:'やめる'}):null]));
  }else{
    kids.push(h('div',{class:'row'},[h('button',{class:'btn primary',onclick:async()=>{
      try{await mutate('addReq',[{week:S.ws,band:'部会',rep:'運営',kind:'other',day:5,s:7,e:9,fixed:true},S.uid,S.pin],'部会を入れました')}catch(e){}
    },text:lb+' に部会を入れる'})]));
    kids.push(h('p',{text:'押すと確定済みの枠として入り、週間表・今日画面では「部会」「部会中」と表示されます。ほかの時間に入れたいときは、週間表で空いている時間をタップして、名前を「部会」にしてください。'}));
  }
  return h('div',{class:'card'},kids);
}
function adminView(){
  const p=phase();
  const seg=h('div',{class:'seg'},['closed','request','free'].map(k=>h('button',{'aria-pressed':String(p===k),onclick:()=>saveCfg({phase:k}),text:PHASES[k]})));
  const c1=h('div',{class:'card'},[h('h2',{text:'この週の状態'}),seg,
    h('p',{text:'準備中は予約できません。希望募集中は希望を集め、自由予約は空いている枠を先着で予約できます。'})]);
  const ranks=[0,1,2].map(i=>{
    const sel=h('select',{'aria-label':'第'+(i+1)+'優先'},KEYS.map(k=>h('option',{value:k,text:KINDS[k]})));
    sel.value=order()[i];
    sel.addEventListener('change',()=>{
      const o=order().slice(),j=o.indexOf(sel.value);
      o[j]=o[i];o[i]=sel.value;saveCfg({order:o});
    });
    return h('div',{class:'rankrow'},[h('span',{class:'no',text:'第'+(i+1)+'優先'}),sel]);
  });
  const c2=h('div',{class:'card'},[h('h2',{text:'優先度の順番'}),h('p',{text:'通常は バンド練習 → ドラム練習 → その他。イレギュラーな週はここで入れ替えられます。'})].concat(ranks));
  const msel=h('select',{id:'maxSel','aria-label':'1回の上限'},[2,3,4,5,6,8,10,12].map(n=>h('option',{value:n,text:durLabel(n)})));
  msel.value=maxSlots();
  msel.addEventListener('change',()=>saveCfg({maxSlots:+msel.value}));
  const cMax=h('div',{class:'card'},[h('h2',{text:'1回の練習時間の上限'}),msel,h('p',{text:'基本は2時間です。イレギュラーな週はここで変えられます。管理者が登録する固定枠（部会など）には適用されません。'})]);
  const n=S.reqs.filter(r=>r.status==='pending').length;
  const btn=h('button',{class:'btn primary',disabled:n===0||null,onclick:()=>{
    if(!S.armed){S.armed=true;render();return}
    S.armed=false;autoConfirm();
  },text:S.armed?'もう一度押すと確定します':'優先度順に自動で確定（希望 '+n+'件）'});
  const capSel=h('select',{'aria-label':'確定するときの練習時間'},[[0,'希望どおり'],[2,'1時間'],[3,'1時間30分'],[4,'2時間']].map(o=>h('option',{value:o[0],text:o[1]})));
  capSel.value=String(capOf());
  capSel.addEventListener('change',()=>{lsSet('kitami-cap-'+S.ws,capSel.value);render()});
  const pendN=S.reqs.filter(r=>r.status==='pending').length,badN=S.plan.bad.size;
  const capCard=h('div',{class:'clashbox'+(badN?'':' okbox')},[h('div',{class:'row',style:'gap:8px'},[h('b',{text:'確定するときの練習時間'}),capSel,h('span',{class:'rank',text:'までにそろえる'})]),
    h('div',{class:'sub',text:pendN?'この設定だと、希望 '+pendN+'件のうち '+(pendN-badN)+'件が入ります'+(badN?'（入らない '+badN+'件は見送り）':'（全部入ります）'):'まだ希望がありません'}),
    h('div',{class:'hint',text:'2時間の希望でも、ここで「1時間」にすると全員1時間で確定します。週間表の「仮」の時間もこの設定で表示されます（この端末の運営画面だけ）。'})]);
  const kids=[h('h2',{text:'部会で確定する'}),capCard,
    h('p',{text:'バンド練習だけ先に確定することもできます。ドラム練習・その他の希望はそのまま残るので、あとで調整してから下のボタンで確定してください。'}),
    h('div',{class:'row'},[bandConfirmBtn(false),S.armK?h('button',{class:'btn sm',onclick:()=>{S.armK=false;render()},text:'やめる'}):null]),h('p',{text:'優先度の高い順に、同じ優先度は先に出した順に、希望の時間帯の中で重ならないよう自動で並べて確定します。時間帯の中に入りきらない希望は「見送り」になり、希望一覧から個別に直せます。確定後は自由予約に切り替わります。'}),btn];
  if(S.armed)kids.push(h('button',{class:'btn sm',onclick:()=>{S.armed=false;render()},text:'やめる'}));
  return h('div',{style:'display:flex;flex-direction:column;gap:12px'},[c1,meetingCard(),c2,cMax,h('div',{class:'card'},kids),
    h('div',{class:'card'},[h('h2',{text:'練習表を画像で送る'}),
      h('p',{text:'この週の確定した予約を、今までの練習表と同じ見た目の画像にします。そのまま LINE のグループに送れます。'}),
      h('div',{class:'row'},[h('button',{class:'btn primary',onclick:()=>exportImage(),text:'練習表を画像で送る'})])]),
    h('div',{class:'card'},[h('h2',{text:'この端末の管理者モード'}),
      h('p',{text:'このスマホでは、終了するまで管理者のままです。共用のスマホやPCで使ったあとは、必ず終了してください。'}),
      h('div',{class:'row'},[h('button',{class:'btn',onclick:async()=>{await adminLogout();S.isAdmin=false;S.tab='grid';render();toast('管理者モードを終了しました')},text:'管理者モードを終了'})])])
  ]);
}

/* ---------- 運営メンバー：暗証番号で管理画面を開く ---------- */
function renderFoot(){
  const f=$('foot');f.replaceChildren();
  if(S.isAdmin)f.append('管理者モードで表示中');
  else f.append(h('button',{class:'btn sm',onclick:openPin,text:'運営メンバーの方はこちら'}));
}
function openPin(){
  const pin=h('input',{type:'password',id:'aPin',inputmode:'numeric',autocomplete:'off',maxlength:'32'});
  const err=h('div',{class:'err',role:'alert'});
  const go=h('button',{class:'btn primary',text:'管理画面を開く',onclick:async()=>{
    const v=pin.value.trim();err.textContent='';
    if(!v){err.textContent='暗証番号を入力してください';pin.focus();return}
    go.disabled=true;
    try{
      const ok=await api('checkPin',v);
      if(!ok){err.textContent='暗証番号が違います';go.disabled=false;return}
      S.isAdmin=true;closeSheet();S.tab='admin';render();toast('管理画面を開きました');
    }catch(e){err.textContent=e.message||'確認できませんでした';go.disabled=false}
  }});
  pin.addEventListener('keydown',e=>{if(e.key==='Enter')go.click()});
  layer(h('div',{class:'sheet',role:'dialog','aria-modal':'true','aria-label':'運営メンバー'},[
    h('h3',{text:'運営メンバー'}),
    h('p',{style:'margin:0;color:var(--muted);font-size:13px',text:'募集の切り替えや確定ができる管理画面は、暗証番号を知っている運営メンバーだけが開けます。'}),
    h('div',{class:'field'},[h('label',{for:'aPin',text:'暗証番号'}),pin]),
    err,
    h('div',{class:'row',style:'justify-content:flex-end'},[h('button',{class:'btn',onclick:closeSheet,text:'キャンセル'}),go])
  ]));
  setTimeout(()=>pin.focus(),50);
}
/* ---------- sheets ---------- */
function layer(content){
  const sc=h('div',{class:'scrim',onclick:e=>{if(e.target===sc)closeSheet()}},[content]);
  $('layer').replaceChildren(sc);
}
function closeSheet(){S.detailId=null;$('layer').replaceChildren()}
