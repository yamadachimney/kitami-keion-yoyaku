
/* ---------- アプリとして追加（ホーム画面）の案内 ---------- */
const UA=navigator.userAgent||'';
const IS_IOS=/iPhone|iPad|iPod/.test(UA)||(/Macintosh/.test(UA)&&navigator.maxTouchPoints>1);
const IS_LINE=/\bLine\//i.test(UA);
function isStandalone(){try{return window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true}catch(e){return false}}
let deferredInstall=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;renderInstall()});
window.addEventListener('appinstalled',()=>{deferredInstall=null;lsSet('kitami-installed','1');renderInstall();toast('ホーム画面に追加しました')});
function renderInstall(){
  const box=$('installBox');if(!box)return;
  box.replaceChildren();
  if(isStandalone()||lsGet('kitami-install-hide')==='1')return;
  const hide=h('button',{class:'btn sm',onclick:()=>{lsSet('kitami-install-hide','1');renderInstall()},text:'閉じる'});
  let msg,btn=null;
  if(IS_LINE){
    msg='LINEの中で開いています。右下（または右上）の︙から「ブラウザで開く」にすると、ホーム画面に追加できて、次から一発で開けます。';
  }else if(deferredInstall){
    msg='ホーム画面に追加すると、アプリみたいにアイコンから一発で開けます。';
    btn=h('button',{class:'btn primary',onclick:async()=>{
      try{deferredInstall.prompt();const r=await deferredInstall.userChoice;if(r&&r.outcome==='accepted')lsSet('kitami-install-hide','1')}catch(e){}
      deferredInstall=null;renderInstall();
    },text:'アプリとして追加'});
  }else if(IS_IOS){
    msg='ホーム画面に追加すると、アプリみたいにアイコンから一発で開けます。';
    btn=h('button',{class:'btn primary',onclick:openIosGuide,text:'やり方を見る（2ステップ）'});
  }else return;
  box.append(h('div',{class:'install'},[h('div',{class:'imsg',text:msg}),h('div',{class:'row'},[btn,hide])]));
}
function openIosGuide(){
  const share=h('span',{class:'shareic','aria-hidden':'true'});
  layer(h('div',{class:'sheet',role:'dialog','aria-modal':'true','aria-label':'ホーム画面に追加'},[
    h('h3',{text:'ホーム画面に追加'}),
    h('div',{class:'gstep'},[h('b',{text:'1'}),h('div',null,['画面の下（iPadは右上）にある ',share,' 共有ボタンを押す'])]),
    h('div',{class:'gstep'},[h('b',{text:'2'}),h('div',null,['下にスクロールして「ホーム画面に追加」→ 右上の「追加」'])]),
    h('p',{class:'rank',text:'Safari以外（Chromeなど）で開いている場合は、Safariで開き直してください。'}),
    h('div',{class:'row',style:'justify-content:flex-end'},[h('button',{class:'btn primary',onclick:closeSheet,text:'わかった'})])
  ]));
}
