globalThis.__RULES=JSON.parse(require('fs').readFileSync(require('path').join(__dirname,'../../database.rules.json'),'utf8'));
globalThis.__USERS={'unei@kitami-keion.example':{pw:'311031',uid:'ADMIN'}};
require('./rtdb-mock.js');
const mk=globalThis.__mkApp;
const W='2026-10-19';
let pass=0,fail=0;
const ok=(c,m)=>{if(c){pass++}else{fail++;console.log('FAIL',m)}};
async function as(name,uid){const app=mk(name);const a=app.auth();
  if(uid==='ADMIN')await a.signInWithEmailAndPassword('unei@kitami-keion.example','311031');
  else {globalThis.__ANON_UID=uid;await a.signInAnonymously();}
  return app.database();}
const tryW=async(p)=>{try{await p;return true}catch(e){return false}};
const req=(uid,o)=>Object.assign({uid,band:'B',rep:'r',kind:'band',day:0,s:8,e:16,dur:4,status:'pending',createdAt:{'.sv':'timestamp'}},o);
(async()=>{
  const adm=await as('adm','ADMIN'), A=await as('a','uA'), B=await as('b','uB');
  const w=db=>db.ref('weeks/'+W);
  ok(!await tryW(w(A).child('cfg').set({phase:'request',order:['band','drum','other'],maxSlots:4})),'member cannot write cfg');
  ok(!await tryW(w(A).update({'reqs/x1':req('uA')})),'member cannot add when closed (no cfg)');
  ok(await tryW(w(adm).child('cfg').set({phase:'request',order:['band','drum','other'],maxSlots:4})),'admin sets cfg');
  ok(!await tryW(w(adm).update({'cfg/foo':1})),'cfg extra key rejected');
  ok(await tryW(w(A).update({'reqs/a1':req('uA')})),'member adds pending hope');
  ok(!await tryW(w(A).update({'reqs/a2':req('uA',{dur:6,e:20})})),'pending over max rejected');
  ok(!await tryW(w(A).update({'reqs/a3':req('uB')})),'cannot create as someone else');
  ok(!await tryW(w(A).update({'reqs/a4':req('uA',{status:'confirmed',dur:8}),'slots/0_8':'a4'})),'member cannot create confirmed in request phase');
  ok(!await tryW(w(B).update({'reqs/a1':req('uB',{s:0})})),'other member cannot edit A');
  ok(!await tryW(w(B).update({'reqs/a1':null})),'other member cannot delete A');
  ok(await tryW(w(A).update({'reqs/a1':req('uA',{s:6,e:16})})),'A edits own pending');
  ok(!await tryW(w(A).update({'reqs/a1':req('uA',{status:'confirmed'})})),'A cannot self-confirm');
  ok(!await tryW(w(A).update({'reqs/a5':Object.assign(req('uA'),{hack:1})})),'extra field rejected');
  ok(!await tryW(w(A).update({'reqs/a6':req('uA',{rep:''})})),'empty rep rejected');
  ok(!await tryW(w(A).update({'reqs/a7':req('uA',{s:10,e:8})})),'e<=s rejected');
  ok(!await tryW(w(A).update({'reqs/a8':req('uA',{day:7})})),'day 7 rejected');
  // admin confirms a1 at 8..12 + slots
  const up={'reqs/a1':req('uA',{s:8,e:12,dur:4,status:'confirmed',ws:6,we:16})};for(let i=8;i<12;i++)up['slots/0_'+i]='a1';up['cfg/phase']='free';
  ok(await tryW(w(adm).update(up)),'admin confirms with slots & switches to free');
  // free phase
  const b1={'reqs/b1':req('uB',{s:10,e:14,dur:4,status:'confirmed'})};for(let i=10;i<14;i++)b1['slots/0_'+i]='b1';
  ok(!await tryW(w(B).update(b1)),'B double-booking overlapping slots rejected');
  const b2={'reqs/b2':req('uB',{s:12,e:16,dur:4,status:'confirmed'})};for(let i=12;i<16;i++)b2['slots/0_'+i]='b2';
  ok(await tryW(w(B).update(b2)),'B books adjacent free slots');
  const b3={'reqs/b3':req('uB',{s:16,e:22,dur:6,status:'confirmed'})};for(let i=16;i<22;i++)b3['slots/0_'+i]='b3';
  ok(!await tryW(w(B).update(b3)),'free booking over max rejected');
  ok(!await tryW(w(B).update({'slots/0_8':null})),'B cannot free A slot');
  ok(!await tryW(w(B).update({'slots/0_20':'a1'})),'B cannot create slot pointing to A booking');
  ok(!await tryW(w(adm).update({'slots/0_8':'b2'})),'even admin cannot overwrite existing slot');
  // simultaneous: A and B race for 20..22
  const ra={'reqs/ra':req('uA',{s:20,e:22,dur:2,status:'confirmed'}),'slots/0_20':'ra','slots/0_21':'ra'};
  const rb={'reqs/rb':req('uB',{s:21,e:23,dur:2,status:'confirmed'}),'slots/0_21':'rb','slots/0_22':'rb'};
  const [x,y]=await Promise.all([tryW(w(A).update(ra)),tryW(w(B).update(rb))]);
  ok(x!==y,'race: exactly one of two overlapping bookings wins ('+x+','+y+')');
  // A deletes own confirmed + slots
  const del={'reqs/a1':null};for(let i=8;i<12;i++)del['slots/0_'+i]=null;
  ok(await tryW(w(A).update(del)),'A deletes own confirmed booking & slots');
  ok(!await tryW(w(B).update({'reqs/b2':null,'slots/0_12':null,'slots/0_13':null,'slots/0_14':null,'slots/0_15':null}).then(()=>w(A).update({'reqs/b2':null}))),'(A cannot delete B)');
  ok(!await tryW(w(A).update({'reqs/zz':req('uA',{status:'rejected'})})),'member cannot create rejected');
  ok(await tryW(w(adm).update({'reqs/m1':req('uA',{band:'部会',rep:'運営',kind:'other',day:5,s:7,e:9,dur:2,status:'confirmed'}),'slots/5_7':'m1','slots/5_8':'m1'})),'admin adds meeting');
  ok(!await tryW(w(A).update({'other':1})),'unknown week child rejected');
  const anon=mk('anon').database();
  ok(!await tryW(anon.ref('weeks/'+W).update({'reqs/q':req('x')})),'signed-out cannot write');
  console.log('rules tests:',pass,'passed,',fail,'failed');
})();
