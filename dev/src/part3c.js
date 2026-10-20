
/* ---------- カレンダーに追加 ---------- */
function slotHM(i){const m=540+i*30;return pad(Math.floor(m/60))+pad(m%60)+'00'}
function gcalUrl(r){
  const d=addDays(S.ws,r.day).replace(/-/g,'');
  const name=nm(r);
  const q='action=TEMPLATE'
    +'&text='+encodeURIComponent('部室練習：'+name)
    +'&dates='+d+'T'+slotHM(r.s)+'/'+d+'T'+slotHM(r.e)
    +'&ctz=Asia%2FTokyo'
    +'&location='+encodeURIComponent('部室')
    +'&details='+encodeURIComponent((r.rep?'代表 '+r.rep+'\n':'')+'北見工大 軽音予約');
  return 'https://calendar.google.com/calendar/render?'+q;
}
function calButtons(r){
  if(r.status!=='confirmed')return null;
  const kids=[h('a',{class:'btn sm cal',href:gcalUrl(r),target:'_blank',rel:'noopener',text:'Googleカレンダーに追加'})];
  kids.push(h('a',{class:'btn sm cal',href:icsHref([r]),download:'bushitsu.ics',text:'iPhone・その他のカレンダー'}));
  return h('div',{class:'row calrow'},kids);
}
function calBulk(){
  const n=live().filter(r=>mine(r)&&r.status==='confirmed').length;
  if(!n)return null;
  return h('div',{class:'card',style:'padding:12px 14px;gap:8px'},[
    h('div',{style:'font-weight:700',text:'今週の自分の予約（'+n+'件）をまとめてカレンダーに入れる'}),
    h('div',{class:'row'},[h('a',{class:'btn sm cal primary',href:icsHref(live().filter(r=>mine(r)&&r.status==='confirmed')),download:'bushitsu.ics',text:'まとめて追加（iPhone・その他）'})]),
    h('p',{text:'練習の1時間前に通知が来るように入ります。Googleカレンダーは、下の各予約のボタンから1件ずつ追加できます。'})
  ]);
}

/* ---------- 今日画面 ---------- */
function focusDate(){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+(S.dayOff||0));return d}
function goDay(off){
  S.dayOff=off;
  const ws=mondayOf(focusDate());
  if(ws!==S.ws){S.ws=ws;load()}else render();
}
function nowSlot(){const n=new Date();return (n.getHours()-9)*2+n.getMinutes()/30}
function todayView(){
  const fd=focusDate(),iso=isoOf(fd),d=(fd.getDay()+6)%7,off=S.dayOff||0;
  const label=(off?'明日':'今日')+' '+md(iso)+'（'+DAYS[d]+'）';
  const seg=h('div',{class:'seg'},[0,1].map(o=>{const x=new Date();x.setDate(x.getDate()+o);
    return h('button',{'aria-pressed':String(off===o),onclick:()=>goDay(o),text:(o?'明日':'今日')+' '+(x.getMonth()+1)+'/'+x.getDate()})}));
  const out=h('div',{class:'today'},[seg]);
  if(S.loading||mondayOf(fd)!==S.ws){out.append(h('div',{class:'empty-hint',text:'読み込み中…'}));return out}
  const items=live().filter(r=>r.day===d&&r.status==='confirmed').sort((a,b)=>a.s-b.s);
  const pendN=live().filter(r=>r.day===d&&r.status==='pending').length;
  const now=off===0?nowSlot():-99;
  const cur=items.find(r=>r.s<=now&&now<r.e);
  const nxt=items.find(r=>r.s>now);

  /* いまの状況（今日だけ） */
  if(off===0){
    let big,sub;
    if(now<0){big='まだ部室の時間前です';sub=nxt?'最初は '+tm(nxt.s)+'〜 '+nm(nxt):'今日はまだ予約がありません'}
    else if(now>=SLOTS){big='今日の部室の時間は終わりました';sub=''}
    else if(cur&&isMeeting(cur)){big='いま：部会中';sub=range(cur)+(nxt?'　→ つぎ '+tm(nxt.s)+'〜 '+nm(nxt):'　→ そのあとは空いています')}
    else if(cur){big='いま：'+nm(cur)+' が使用中';sub=range(cur)+(nxt?'　→ つぎ '+tm(nxt.s)+'〜 '+nm(nxt):'　→ そのあとは空いています')}
    else{big='いま：空いています';sub=nxt?tm(nxt.s)+' まで空き　→ つぎ '+nm(nxt):'このあとはずっと空いています'}
    const card=h('div',{class:'nowcard'+(cur?' busy '+cc(cur):' free')},[h('div',{class:'nowbig',text:big}),sub?h('div',{class:'nowsub',text:sub}):null]);
    out.append(card);
  }
  out.append(h('h2',{class:'dayh',text:label}));
  if(phase()==='request'&&pendN)out.append(h('div',{class:'rank',text:'この週は希望募集中です。部会で確定すると、ここに表示されます（希望 '+pendN+'件）。'}));

  /* 時間順のリスト（予約と空き） */
  const list=h('div',{class:'tlist'});
  const canBook=canAdd()&&phase()==='free';
  let t=0;
  const gap=(a,b)=>{
    if(b<=a)return;
    const past=off===0&&b<=now;
    const row=h('div',{class:'ti free'+(past?' past':'')},[
      h('div',{class:'tt',text:tm(a)+'–'+tm(b)}),
      h('div',{class:'tb'},[h('span',{class:'freel',text:'空き（'+durLabel(b-a)+'）'})])
    ]);
    if(canBook&&!past){
      const st=off===0?Math.max(a,Math.ceil(now)):a;
      if(st<b)row.lastChild.append(h('button',{class:'btn sm',onclick:()=>openAdd(d,st),text:'ここを予約'}));
    }
    list.append(row);
  };
  items.forEach(r=>{
    gap(t,r.s);
    const isNow=r===cur,isNext=r===nxt,past=off===0&&r.e<=now;
    const chip=isNow?h('span',{class:'chip confirmed',text:isMeeting(r)?'部会中':'いま使用中'}):isNext&&off===0?h('span',{class:'chip pending',text:'つぎ'}):past?h('span',{class:'chip',text:'終了'}):null;
    list.append(h('button',{class:'ti bk '+cc(r)+(past?' past':'')+(isNow?' now':'')+(mine(r)?' mine':''),onclick:()=>openDetail(r.id)},[
      h('div',{class:'tt',text:range(r)}),
      h('div',{class:'tb'},[h('div',{class:'tn'},[h('span',{text:nm(r)}),chip]),h('div',{class:'meta',text:(r.rep&&r.band?'代表 '+r.rep+'　':'')+durLabel(r.e-r.s)})])
    ]));
    t=Math.max(t,r.e);
  });
  gap(t,SLOTS);
  if(!items.length&&!(phase()==='request'&&pendN))list.prepend(h('div',{class:'empty-hint',text:'この日の予約はまだありません。'}));
  out.append(list);
  return out;
}
