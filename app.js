// Unser Haushalt – Web-App für iPhone (Firebase)
import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendEmailVerification,sendPasswordResetEmail,signOut} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {initializeFirestore,getFirestore,persistentLocalCache,persistentMultipleTabManager,collection,doc,setDoc,updateDoc,deleteDoc,onSnapshot,getDocs,query,where} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {firebaseConfig,SCAN_URL} from './config.js';

(function(){
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'});
const eur=c=>fmt.format((c||0)/100);
const MONTHS=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const MONTHS_L=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const CAT_GROUPS=[
  ['Wohnung',['Miete','Nebenkosten','Strom & Gas','Internet & Telefon','Rundfunkbeitrag','Versicherungen','Einrichtung & Reparaturen']],
  ['Haushalt',['Lebensmittel','Drogerie & Putzmittel']],
  ['Alltag & Freizeit',['Restaurant & Lieferdienst','Freizeit & Ausflüge','Mobilität','Geschenke','Sonstiges']]];
const CATS=CAT_GROUPS.flatMap(g=>g[1]);
const LEGACY_CAT={'Haushalt':'Drogerie & Putzmittel','Miete & Nebenkosten':'Nebenkosten','Restaurant':'Restaurant & Lieferdienst','Freizeit':'Freizeit & Ausflüge','Transport':'Mobilität'};
const catOf=e=>LEGACY_CAT[e.category]||(CATS.includes(e.category)?e.category:'Sonstiges');
const groupOf=c=>CAT_GROUPS.find(g=>g[1].includes(c))?.[0]||'Alltag & Freizeit';
const catSelect=(id,sel)=>`<select class="inp" id="${id}">${CAT_GROUPS.map(([g,cs])=>`<optgroup label="${g}">${cs.map(c=>`<option ${c===sel?'selected':''}>${c}</option>`).join('')}</optgroup>`).join('')}</select>`;
const ymAdd=(ym,k)=>{const[y,m]=ym.split('-').map(Number);const t=y*12+m-1+k;return Math.floor(t/12)+'-'+String(t%12+1).padStart(2,'0')};
const ymLabel=ym=>{const[y,m]=ym.split('-');return MONTHS_L[+m-1]+' '+y};
const dim=ym=>{const[y,m]=ym.split('-').map(Number);return new Date(Date.UTC(y,m,0)).getUTCDate()};
const recDate=(r,ym)=>ym+'-'+String(Math.min(r.day||1,dim(ym))).padStart(2,'0');
const REC_EVERY={1:'monatlich',2:'alle 2 Monate',3:'alle 3 Monate',6:'alle 6 Monate',12:'alle 12 Monate'};
function recNext(r){let ym=r.bookedThrough?ymAdd(r.bookedThrough,r.every||1):r.start;return recDate(r,ym)}
const ROUTES=['einkauf','ausgaben','putzplan','pinnwand'];
const ICON_X='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ICON_CHECK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';

function ymd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
const today=()=>ymd(new Date());
function dayNum(s){const p=s.split('-').map(Number);return Date.UTC(p[0],p[1]-1,p[2])/864e5}
function addDays(s,n){return new Date((dayNum(s)+n)*864e5).toISOString().slice(0,10)}
function parseEur(v){v=String(v??'').trim().replace(/\s|€/g,'');if(!v)return NaN;if(v.includes(','))v=v.replace(/\./g,'').replace(',','.');const n=Number(v);return Number.isFinite(n)?Math.round(n*100):NaN}
function centsToInput(c){return (c/100).toFixed(2).replace('.',',')}
function lsGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}

const S={phase:'loading',authMode:'login',email:null,db:null,meta:null,metaReady:false,shopping:[],expenses:[],chores:[],notes:[],recurring:[],expSub:lsGet('hh-sub')||'list',repMonth:null,me:lsGet('hh-me'),uid:null,ro:false,sample:null,img:null,slow:false,fail:null,ready:{},view:null};

const members=()=>S.meta?.members||[];
const mIdx=id=>Math.max(0,members().findIndex(m=>m.id===id));
const mName=id=>members().find(m=>m.id===id)?.name||'Jemand';
const av=(id,sm)=>{const n=mName(id);return `<span class="av ${sm?'sm ':''}p${mIdx(id)%4}" title="${esc(n)}">${esc((n[0]||'?').toUpperCase())}</span>`};

function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,3600)}
function failWrite(e){
  const c=e?.code;let m='Das hat nicht geklappt. Bitte noch einmal versuchen.';
  if(c==='permission-denied')m='Dafür fehlt die Berechtigung. Melde dich ab und wieder an.';
  else if(c==='resource-exhausted')m='Das kostenlose Tageslimit der Datenbank ist erreicht. Morgen geht es wieder.';
  else if(c==='unauthenticated')m='Du bist abgemeldet. Bitte melde dich erneut an.';
  toast(m);
}
async function save(fn){if(!S.db){toast('Keine Verbindung zum gemeinsamen Speicher.');return false}try{await fn();return true}catch(e){failWrite(e);return false}}

/* ---------- Routing ---------- */
function show(v){
  if(!ROUTES.includes(v))v='einkauf';S.view=v;
  ROUTES.forEach(r=>{$('#v-'+r).hidden=!(r===v&&S.meta);document.querySelector(`[data-tab="${r}"]`).setAttribute('aria-current',r===v?'page':'false')});
}
addEventListener('hashchange',()=>show(location.hash.slice(1)));

/* ---------- Render ---------- */
function render(){
  const st=$('#status');
  if(S.fail){st.hidden=false;st.textContent=S.fail}
  else if(S.slow&&!S.metaReady){st.hidden=false;st.textContent='Die gemeinsamen Daten sind gerade nicht erreichbar. Prüfe die Verbindung, die Seite lädt dann von selbst.'}
  else if(S.phase==='loading'||(S.phase==='app'&&!S.meta)){st.hidden=false;st.textContent='Lädt …'}
  else st.hidden=true;

  ['noconfig','auth','verify','setup'].forEach(p=>$('#'+p).hidden=S.phase!==p);
  const hasMeta=S.phase==='app'&&!!S.meta;
  $('.tabs').hidden=!hasMeta;
  if(hasMeta){$('#hh-name').textContent=S.meta.name||'Unser Haushalt';$('#hh-sub').textContent=members().map(m=>m.name).join(' & ')}
  else{$('#hh-name').textContent='Unser Haushalt';$('#hh-sub').textContent='Einkauf, Ausgaben, Putzplan und Pinnwand'}
  // who am I
  if(hasMeta&&S.uid){const byUid=members().find(m=>m.uid===S.uid);if(byUid&&S.me!==byUid.id){S.me=byUid.id;lsSet('hh-me',S.me)}}
  if(S.me&&!members().some(m=>m.id===S.me))S.me=null;
  const pill=$('#me-pill');pill.hidden=!hasMeta;
  if(hasMeta)pill.innerHTML=S.me?`${av(S.me)}<span>${esc(mName(S.me))}</span>`:`<span class="av sm p3">?</span><small>Wer bist du?</small>`;
  const who=$('#who');who.hidden=!(hasMeta&&!S.me);
  if(!who.hidden)$('#who-btns').innerHTML=members().map(m=>`<button class="btn ghost" data-act="iam" data-id="${m.id}">${av(m.id)} ${esc(m.name)}</button>`).join('');
  show(S.view||location.hash.slice(1));
  if(!hasMeta)return;
  $('#rc-btn').hidden=!S.img;
  renderShop();renderExpenses();renderSub();renderChores();renderNotes();
}

function renderSub(){
  const s=['list','report','rec'].includes(S.expSub)?S.expSub:'list';
  document.querySelectorAll('[data-sub]').forEach(b=>b.setAttribute('aria-selected',b.dataset.sub===s?'true':'false'));
  $('#sub-list').hidden=s!=='list';$('#sub-report').hidden=s!=='report';$('#sub-rec').hidden=s!=='rec';
  if(s==='report')renderReport();if(s==='rec')renderRec();
}

function renderRec(){
  const rs=[...S.recurring].sort((a,b)=>(a.active===false)-(b.active===false)||(b.cents||0)-(a.cents||0));
  if(!rs.length){$('#rec-list').innerHTML=loadingOr('recurring',`<div class="card empty"><strong>Noch keine Daueraufträge</strong><span>Leg zum Beispiel die Miete an: Betrag, wer überweist, Tag im Monat und wie ihr sie aufteilt.</span><button class="btn primary w" data-act="rec-new" style="margin-top:6px">Miete anlegen</button></div>`);return}
  const monthly=rs.filter(r=>r.active!==false).reduce((s,r)=>s+(r.cents||0)/(r.every||1),0);
  $('#rec-list').innerHTML=`<div class="card"><ul class="list">${rs.map(r=>`<li><button class="exp" data-act="rec-edit" data-id="${r.id}">
    <span class="mid"><span class="t">${esc(r.title)}</span><br><span class="s">${esc(r.category||'')} · ${REC_EVERY[r.every||1]} am ${r.day||1}. · ${esc(mName(r.payer))} überweist</span></span>
    <span class="amt"><b class="num">${eur(r.cents)}</b>${r.active===false?'<span class="chip">pausiert</span>':`<span class="mut num">nächste: ${fmtDate(recNext(r)).replace(/ \d{4}$/,'')}</span>`}</span></button></li>`).join('')}</ul>
    <div class="cartbar"><span class="eyebrow">Fixkosten pro Monat</span><b class="num">${eur(Math.round(monthly))}</b></div></div>`;
}

function monthData(ym){
  const ex=S.expenses.filter(e=>e.kind!=='payment'&&(e.date||'').startsWith(ym));
  const total=ex.reduce((s,e)=>s+e.cents,0),fixed=ex.filter(e=>e.recId).reduce((s,e)=>s+e.cents,0);
  return{ex,total,fixed};
}
function renderReport(){
  if(!S.ready.expenses){$('#sub-report').innerHTML=loadingOr('expenses','');return}
  const cur=today().slice(0,7);const ym=S.repMonth||cur;
  const {ex,total,fixed}=monthData(ym),prev=monthData(ymAdd(ym,-1));
  const dPct=prev.total?Math.round((total-prev.total)/prev.total*100):null;
  // categories grouped
  const byCat={};const addC=(c,v)=>{byCat[c]=byCat[c]||{c:0,n:0};byCat[c].c+=v;byCat[c].n++};
  ex.forEach(e=>{if(Array.isArray(e.items)&&e.items.length)e.items.forEach(it=>addC(CATS.includes(it.category)?it.category:'Sonstiges',it.cents||0));else addC(catOf(e),e.cents)});
  for(const k in byCat)if(byCat[k].c<=0)delete byCat[k];
  const max=Math.max(1,...Object.values(byCat).map(x=>x.c));
  const groups=CAT_GROUPS.map(([g,cs])=>{const rows=cs.filter(c=>byCat[c]).sort((a,b)=>byCat[b].c-byCat[a].c);return{g,rows,sum:rows.reduce((s,c)=>s+byCat[c].c,0)}}).filter(x=>x.rows.length);
  const flat=g=>g.rows.map(c=>`<div class="catrow"><span>${esc(c)} <span class="pct num">${byCat[c].n}×</span></span><span class="num">${eur(byCat[c].c)}<span class="pct">${total?Math.round(byCat[c].c/total*100):0} %</span></span><span class="bar"><i style="width:${(byCat[c].c/max*100).toFixed(1)}%"></i></span></div>`).join('');
  // per person
  const ms=members();
  const per=ms.map(m=>{const paid=ex.filter(e=>e.payer===m.id).reduce((s,e)=>s+e.cents,0);const share=ex.reduce((s,e)=>s+(e.shares?.[m.id]||0),0);return{m,paid,share,diff:paid-share}});
  // 6-month trend
  const months=Array.from({length:6},(_,i)=>ymAdd(ym,i-5)).map(k=>({k,...monthData(k)}));
  const tmax=Math.max(1,...months.map(x=>x.total));
  const fixedList=ex.filter(e=>e.recId).sort((a,b)=>b.cents-a.cents);
  $('#sub-report').innerHTML=`
  <div class="monthnav"><button class="iconbtn" data-act="rep-prev" aria-label="Vorheriger Monat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg></button>
    <h2>${ymLabel(ym)}</h2>
    <button class="iconbtn" data-act="rep-next" aria-label="Nächster Monat" ${ym>=cur?'disabled style="opacity:.3"':''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 5l7 7-7 7"/></svg></button></div>
  <div class="kpis">
    <div class="card stat"><div class="eyebrow">Ausgaben gesamt</div><div class="v num">${eur(total)}</div>${dPct==null?'':`<div class="delta num ${dPct>0?'neg':dPct<0?'pos':'mut'}">${dPct>0?'+':''}${dPct} % ggü. ${MONTHS_L[+ymAdd(ym,-1).slice(5)-1]}</div>`}</div>
    <div class="card stat"><div class="eyebrow">Fixkosten</div><div class="v num">${eur(fixed)}</div><div class="delta mut">aus Daueraufträgen</div></div>
    <div class="card stat"><div class="eyebrow">Variabel</div><div class="v num">${eur(total-fixed)}</div><div class="delta mut">${ex.filter(e=>!e.recId).length} Ausgaben</div></div>
  </div>
  ${ex.length?`
  <div class="sec-h"><h2>Nach Kategorie</h2></div>
  <div class="card">${groups.map(g=>`<div class="grp"><div class="grp-h"><span>${g.g}</span><span class="num">${eur(g.sum)}</span></div>${flat(g)}</div>`).join('')}</div>
  <div class="sec-h"><h2>Wer hat was getragen</h2></div>
  <div class="card" style="overflow-x:auto"><table class="tbl num"><thead><tr><th>Person</th><th>Bezahlt</th><th>Anteil</th><th>Saldo</th></tr></thead><tbody>
    ${per.map(x=>`<tr><td>${av(x.m.id,true)} ${esc(x.m.name)}</td><td>${eur(x.paid)}</td><td>${eur(x.share)}</td><td class="${x.diff>0?'pos':x.diff<0?'neg':'mut'}">${x.diff>0?'+':''}${eur(x.diff)}</td></tr>`).join('')}
  </tbody></table></div>
  ${fixedList.length?`<div class="sec-h"><h2>Fixkosten im ${MONTHS_L[+ym.slice(5)-1]}</h2></div><div class="card"><ul class="list">${fixedList.map(e=>`<li><button class="exp" data-act="expense-edit" data-id="${e.id}"><span class="mid"><span class="t">${esc(e.title)}</span><br><span class="s">${esc(catOf(e))} · ${fmtDate(e.date)}</span></span><span class="amt"><b class="num">${eur(e.cents)}</b></span></button></li>`).join('')}</ul></div>`:''}`
  :`<div class="card empty"><strong>Keine Ausgaben im ${MONTHS_L[+ym.slice(5)-1]}</strong><span>Sobald ihr Ausgaben eintragt oder ein Dauerauftrag fällig wird, erscheint hier die Auswertung.</span></div>`}
  <div class="sec-h"><h2>Letzte 6 Monate</h2><span class="legend"><span>Fix</span><span class="v">Variabel</span></span></div>
  <div class="card pad"><div class="trend">${months.map(x=>`<div class="col ${x.k===ym?'cur':''}" title="${ymLabel(x.k)}: ${eur(x.total)}"><small class="num">${x.total?Math.round(x.total/100)+' €':''}</small><div class="b" style="height:${Math.max(x.total?3:0,x.total/tmax*82).toFixed(1)}%"><i style="height:${x.total?(x.fixed/x.total*100).toFixed(1):0}%"></i></div><small>${MONTHS[+x.k.slice(5)-1]}</small></div>`).join('')}</div></div>`;
}

function loadingOr(key,html){return S.ready[key]?html:`<div class="card empty"><span>Lädt …</span></div>`}

function renderShop(){
  const open=S.shopping.filter(i=>!i.done).sort((a,b)=>(a.at||0)-(b.at||0));
  const done=S.shopping.filter(i=>i.done).sort((a,b)=>(b.doneAt||0)-(a.doneAt||0));
  const d=$('#dot-shop');d.hidden=!open.length;d.textContent=open.length;
  const row=i=>`<li class="item ${i.done?'done':''}">
    <button class="check w" data-act="toggle" data-id="${i.id}" aria-label="${i.done?'Zurück auf die Liste':'Abhaken'}">${ICON_CHECK}</button>
    <span class="name">${esc(i.name)}</span>
    ${i.qty?`<span class="chip">${esc(i.qty)}</span>`:''}
    ${i.by?av(i.by,true):''}
    <button class="iconbtn w" data-act="del-item" data-id="${i.id}" aria-label="Löschen">${ICON_X}</button></li>`;
  let html='';
  if(!open.length&&!done.length){
    html=`<div class="card empty"><strong>Die Liste ist leer</strong><span>Tippe oben einen Artikel ein oder lade eine ganze Liste hoch, als Text, Datei oder Foto.</span></div>`;
  }else{
    html=`<div class="card">${open.length?`<ul class="list">${open.map(row).join('')}</ul>`:`<div class="empty"><span>Alles im Wagen.</span></div>`}
    ${done.length?`<div class="cartbar"><span class="eyebrow">Im Wagen · ${done.length}</span><span class="row-actions w"><button class="btn ghost sm" data-act="clear-done">Entfernen</button><button class="btn lemon sm" data-act="finish">Abschließen & Ausgabe erfassen</button></span></div><ul class="list">${done.map(row).join('')}</ul>`:''}</div>`;
  }
  $('#shop-list').innerHTML=loadingOr('shopping',html);
}

function balances(){
  const b={};members().forEach(m=>b[m.id]=0);
  for(const e of S.expenses){b[e.payer]=(b[e.payer]||0)+(e.cents||0);for(const[k,v]of Object.entries(e.shares||{}))b[k]=(b[k]||0)-v}
  return b;
}
/* Minimum number of transfers: split people into as many groups as possible that
   balance to zero on their own; each group of k people then needs exactly k-1 transfers.
   Exact via subset DP for up to 16 people with an open balance, greedy beyond that. */
function transfers(b){
  const P=Object.entries(b).filter(([,v])=>v!==0);const n=P.length;
  if(n<2)return[];
  if(n>16)return greedyTransfers(Object.fromEntries(P));
  const N=1<<n,sum=new Float64Array(N),dp=new Int8Array(N),from=new Int8Array(N);
  for(let m=1;m<N;m++){const lo=31-Math.clz32(m&-m);sum[m]=sum[m&(m-1)]+P[lo][1];
    let best=-1,bi=0;for(let i=0;i<n;i++)if(m>>i&1){const v=dp[m^(1<<i)];if(v>best){best=v;bi=i}}
    dp[m]=best+(sum[m]===0?1:0);from[m]=bi}
  const groups=[];let cur=[],m=N-1;
  while(m){const i=from[m];cur.push(P[i]);m^=1<<i;if(sum[m]===0){groups.push(cur);cur=[]}}
  if(cur.length)groups.push(cur);
  return groups.flatMap(g=>greedyTransfers(Object.fromEntries(g)));
}
function greedyTransfers(b){
  const cr=[],db=[];for(const[k,v]of Object.entries(b)){if(v>0)cr.push([k,v]);else if(v<0)db.push([k,-v])}
  cr.sort((a,b)=>b[1]-a[1]);db.sort((a,b)=>b[1]-a[1]);const out=[];let i=0,j=0;
  while(i<db.length&&j<cr.length){const x=Math.min(db[i][1],cr[j][1]);if(x>0)out.push({from:db[i][0],to:cr[j][0],c:x});db[i][1]-=x;cr[j][1]-=x;if(!db[i][1])i++;if(!cr[j][1])j++}
  return out;
}
function renderExpenses(){
  const b=balances(),xs=transfers(b);
  let head;
  if(!xs.length){head=`<div class="balance"><span class="eyebrow" style="color:inherit;opacity:.8">Kontostand</span><div class="big">Alles ausgeglichen</div><div class="sub">Niemand schuldet jemandem etwas.</div></div>`}
  else{
    const mine=S.me?b[S.me]||0:null;
    const big=mine==null?eur(xs.reduce((s,x)=>s+x.c,0))+' offen':mine>0?'Du bekommst '+eur(mine):mine<0?'Du schuldest '+eur(-mine):'Du bist ausgeglichen';
    head=`<div class="balance"><span class="eyebrow" style="color:inherit;opacity:.8">Kontostand</span><div class="big num">${big}</div>
    ${xs.map(x=>`<div class="xfer"><span class="txt num">${esc(mName(x.from))} → ${esc(mName(x.to))}: ${eur(x.c)}</span><button class="btn sm w" data-act="settle" data-from="${x.from}" data-to="${x.to}" data-c="${x.c}">Ausgleichen</button></div>`).join('')}</div>`;
  }
  $('#bal').innerHTML=loadingOr('expenses',head);

  const ym=today().slice(0,7);
  const thisM=S.expenses.filter(e=>e.kind!=='payment'&&(e.date||'').startsWith(ym));
  const total=thisM.reduce((s,e)=>s+e.cents,0);
  const myShare=S.me?thisM.reduce((s,e)=>s+(e.shares?.[S.me]||0),0):null;
  const myPaid=S.me?thisM.filter(e=>e.payer===S.me).reduce((s,e)=>s+e.cents,0):null;
  const mName0=MONTHS_L[new Date().getMonth()];
  $('#stats').innerHTML=S.ready.expenses?`<div class="stats">
    <div class="card stat"><div class="eyebrow">${mName0} gesamt</div><div class="v num">${eur(total)}</div></div>
    <div class="card stat"><div class="eyebrow">Dein Anteil</div><div class="v num">${myShare==null?'–':eur(myShare)}</div></div>
    <div class="card stat"><div class="eyebrow">Von dir bezahlt</div><div class="v num">${myPaid==null?'–':eur(myPaid)}</div></div></div>`:'';

  const sorted=[...S.expenses].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.at||0)-(a.at||0));
  if(!sorted.length){$('#exp-list').innerHTML=S.ready.expenses?`<div class="card empty"><strong>Noch keine Ausgaben</strong><span>Trag ein, wer was bezahlt hat. Die App rechnet aus, wer wem wie viel schuldet.</span></div>`:'';return}
  const groups={};sorted.forEach(e=>{const k=(e.date||'').slice(0,7);(groups[k]=groups[k]||[]).push(e)});
  let html='';
  for(const[k,list]of Object.entries(groups)){
    const [y,m]=k.split('-');const sum=list.filter(e=>e.kind!=='payment').reduce((s,e)=>s+e.cents,0);
    html+=`<div class="month-h"><span>${MONTHS_L[+m-1]} ${y}</span><span class="num">${eur(sum)}</span></div><div class="card"><ul class="list">`;
    for(const e of list){
      const d=e.date?e.date.split('-'):['','',''];
      let sub,impact='';
      if(e.kind==='payment'){const to=Object.keys(e.shares||{})[0];sub=`${esc(mName(e.payer))} hat ${esc(mName(to))} bezahlt`;
        if(S.me===e.payer)impact=`<span class="mut">von dir</span>`;else if(S.me===to)impact=`<span class="mut">an dich</span>`;}
      else{sub=`${esc(mName(e.payer))} hat bezahlt · ${e.items?.length?`Bon mit ${e.items.length} Positionen`:esc(catOf(e))}${e.recId?' · Dauerauftrag':''}`;
        if(S.me){const mine=e.shares?.[S.me]||0;const net=(e.payer===S.me?e.cents:0)-mine;
          impact=net>0?`<span class="pos num">du bekommst ${eur(net)}</span>`:net<0?`<span class="neg num">du schuldest ${eur(-net)}</span>`:`<span class="mut">nicht beteiligt</span>`;}}
      html+=`<li><button class="exp" data-act="${e.kind==='payment'?'settle-edit':'expense-edit'}" data-id="${e.id}">
        <span class="date"><b class="num">${+d[2]||''}</b><span>${d[1]?MONTHS[+d[1]-1]:''}</span></span>
        <span class="mid"><span class="t">${e.kind==='payment'?'Ausgleichszahlung':esc(e.title)}</span><br><span class="s">${sub}</span></span>
        <span class="amt"><b class="num">${eur(e.cents)}</b>${impact}</span></button></li>`;
    }
    html+=`</ul></div>`;
  }
  $('#exp-list').innerHTML=html;
}

function choreState(c){
  if(!c.last)return{diff:-1e6,label:'noch nie erledigt',cls:'warn'};
  const diff=dayNum(addDays(c.last,c.every||7))-dayNum(today());
  if(diff<0)return{diff,label:`${-diff} ${-diff===1?'Tag':'Tage'} überfällig`,cls:'bad'};
  if(diff===0)return{diff,label:'heute fällig',cls:'warn'};
  if(diff===1)return{diff,label:'morgen fällig',cls:'ok'};
  return{diff,label:`in ${diff} Tagen`,cls:'ok'};
}
const EVERY_NAMED={1:'täglich',2:'jeden 2. Tag',7:'wöchentlich',14:'alle 2 Wochen',30:'monatlich',365:'alle 12 Monate'};
const monthsOf=n=>Math.round(n/30*10)/10;
const deNum=x=>String(x).replace('.',',');
const everyLabel=n=>EVERY_NAMED[n]||(n>30?`alle ${deNum(monthsOf(n))} Monate`:n%7===0?`alle ${n/7} Wochen`:`alle ${n} Tage`);
const EVERY_PRESETS=[1,2,3,4,5,7,10,14,21,30,45,60,90,180,365];
function renderChores(){
  const list=S.chores.map(c=>({c,s:choreState(c)})).sort((a,b)=>a.s.diff-b.s.diff);
  const due=list.filter(x=>x.s.cls!=='ok').length;const d=$('#dot-chore');d.hidden=!due;d.textContent=due;
  const ym=today().slice(0,7);const pts={};members().forEach(m=>pts[m.id]=0);
  S.chores.forEach(c=>(c.log||[]).forEach(l=>{if((l.d||'').startsWith(ym))pts[l.m]=(pts[l.m]||0)+(l.p||c.points||1)}));
  $('#board').innerHTML=S.ready.chores&&S.chores.length?`<span class="eyebrow">Punkte im ${MONTHS_L[new Date().getMonth()]}</span><div class="board" style="margin-top:6px">${members().map(m=>`<div class="who">${av(m.id)}${esc(m.name)} <b class="num">${pts[m.id]||0}</b></div>`).join('')}</div>`:'';
  if(!list.length){$('#chore-list').innerHTML=loadingOr('chores',`<div class="card empty"><strong>Noch kein Putzplan</strong><span>Leg Aufgaben wie „Bad putzen“ oder „Müll rausbringen“ an. Wer sie erledigt, bekommt Punkte, und die Zuständigkeit wechselt automatisch.</span><button class="btn primary w" data-act="chore-new" style="margin-top:6px">Erste Aufgabe anlegen</button></div>`);return}
  $('#chore-list').innerHTML=`<div class="card"><ul class="list">${list.map(({c,s})=>`<li><div class="chore">
    <span class="stripe ${s.cls}"></span>
    <button class="mid" data-act="chore-edit" data-id="${c.id}" style="border:0;background:transparent;text-align:left;padding:0">
      <span class="t">${esc(c.title)}</span>
      <span class="s"><span class="chip ${s.cls}">${s.label}</span><span>${everyLabel(c.every||7)}</span><span>· ${c.points||1} P.</span>${c.assignee?`<span>· dran: </span>${av(c.assignee,true)}<span>${esc(mName(c.assignee))}</span>`:''}</span>
    </button>
    <button class="btn sm primary w" data-act="chore-done" data-id="${c.id}">Erledigt</button></div></li>`).join('')}</ul></div>`;
}

function renderNotes(){
  const ns=[...S.notes].sort((a,b)=>(b.at||0)-(a.at||0));
  $('#notes').innerHTML=loadingOr('notes',ns.length?`<div class="notes">${ns.map(n=>{const d=new Date(n.at||0);return `<article class="note"><p>${esc(n.text)}</p><footer><span>${esc(mName(n.by))} · ${d.getDate()}. ${MONTHS[d.getMonth()]}</span><button class="iconbtn w" data-act="del-note" data-id="${n.id}" aria-label="Notiz entfernen">${ICON_X}</button></footer></article>`}).join('')}</div>`:`<div class="card empty"><strong>Nichts angepinnt</strong><span>Platz für Absprachen, Termine und Codes fürs WLAN.</span></div>`);
}

/* ---------- Sheets ---------- */
function openSheet(html,onMount){$('#sheet').innerHTML=html;$('#scrim').hidden=false;onMount&&onMount($('#sheet'));const f=$('#sheet').querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea');if(f&&matchMedia('(min-width:640px)').matches)f.focus()}
function closeSheet(){if(RC?.busy)RC.ctl?.abort();RC=null;const s=$('#sheet');s.oninput=s.onchange=null;$('#scrim').hidden=true;s.innerHTML=''}
$('#scrim').addEventListener('click',e=>{if(e.target.id==='scrim')closeSheet()});
addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#scrim').hidden)closeSheet()});
const sheetHead=t=>`<div class="head"><h3>${t}</h3><button class="iconbtn" data-act="close" aria-label="Schließen">${ICON_X}</button></div>`;
const memberOpts=sel=>members().map(m=>`<option value="${m.id}" ${m.id===sel?'selected':''}>${esc(m.name)}</option>`).join('');

/* Expense */
let EX=null;
const fmtDate=s=>{const[y,m,d]=s.split('-');return `${+d}. ${MONTHS_L[+m-1]} ${y}`};
function expenseSheet(e,prefill,rec){
  const ms=members();
  EX={id:e?.id||null,mode:e?.mode||'equal',raw:e?.raw||{},rec:!!rec};
  const p=prefill||{};
  openSheet(`${sheetHead(rec?(e?'Dauerauftrag bearbeiten':'Neuer Dauerauftrag'):(e?'Ausgabe bearbeiten':'Neue Ausgabe'))}
  ${e?.recId&&!rec?`<p class="hint" style="margin:0">Automatisch eingetragen aus dem Dauerauftrag „${esc(S.recurring.find(r=>r.id===e.recId)?.title||e.title)}“. Änderungen gelten nur für diesen Monat.</p>`:''}
  <div class="field"><label for="ex-title">Wofür?</label><input class="inp" id="ex-title" value="${esc(e?.title||p.title||'')}" placeholder="${rec?'z. B. Miete':'z. B. Wocheneinkauf Rewe'}"></div>
  <div class="grid2">
    <div class="field"><label for="ex-amount">Betrag in €</label><input class="inp num" id="ex-amount" inputmode="decimal" value="${e?centsToInput(e.cents):''}" placeholder="0,00"></div>
    <div class="field"><label for="ex-payer">Bezahlt von</label><select class="inp" id="ex-payer">${memberOpts(e?.payer||S.me||ms[0]?.id)}</select></div>
    ${rec?`<div class="field"><label for="ex-every">Rhythmus</label><select class="inp" id="ex-every">${Object.entries(REC_EVERY).map(([k,l])=>`<option value="${k}" ${+k===(e?.every||1)?'selected':''}>${l}</option>`).join('')}</select></div>`
      :`<div class="field"><label for="ex-date">Datum</label><input class="inp" type="date" id="ex-date" value="${e?.date||today()}"></div>`}
    <div class="field"><label for="ex-cat">Kategorie</label>${catSelect('ex-cat',e?catOf(e):(p.category||(rec?'Miete':'Lebensmittel')))}</div>
    ${rec?`<div class="field"><label for="ex-day">Tag im Monat</label><select class="inp" id="ex-day">${Array.from({length:31},(_,i)=>`<option value="${i+1}" ${i+1===(e?.day||1)?'selected':''}>${i+1}.${i+1>28?' (oder Monatsende)':''}</option>`).join('')}</select></div>
    <div class="field"><label for="ex-start">Erste Buchung im</label><input class="inp" type="month" id="ex-start" value="${e?.start||today().slice(0,7)}" ${e?.bookedThrough?'disabled':''}></div>`:''}
  </div>
  ${rec?`<label class="splitrow" style="border:0;padding:0"><input type="checkbox" id="ex-active" ${e?.active===false?'':'checked'}><span class="n" style="font-weight:500">Aktiv, wird automatisch eingetragen</span></label>
  ${e?.bookedThrough?`<p class="hint" style="margin:0">Änderungen gelten ab der nächsten Buchung (${fmtDate(recNext(e))}). Bereits eingetragene Monate bleiben unverändert.</p>`:''}`:''}
  <div class="field"><span class="lbl">Aufteilen</span>
    <div class="seg" role="radiogroup">
      ${[['equal','Gleichmäßig'],['exact','Beträge'],['percent','Prozent']].map(([v,l])=>`<label><input type="radio" name="ex-mode" id="ex-mode-${v}" value="${v}" ${EX.mode===v?'checked':''}><span>${l}</span></label>`).join('')}
    </div></div>
  <div class="card pad" id="ex-split" style="padding-block:4px"></div>
  <div class="hint" id="ex-hint"></div>
  <div class="foot">${e?`<button class="btn danger" data-act="${rec?'rec-del':'ex-del'}">Löschen</button>`:''}<div class="right"><button class="btn ghost" data-act="close">Abbrechen</button><button class="btn primary w" data-act="ex-save">Speichern</button></div></div>`,
  root=>{root.querySelectorAll('[name=ex-mode]').forEach(r=>r.addEventListener('change',()=>{captureRaw();EX.mode=r.value;EX.raw={};renderSplit()}));
    root.addEventListener('input',ev=>{if(ev.target.id==='ex-amount'||ev.target.id.startsWith('ex-s-'))splitHint()});renderSplit()});
}
function captureRaw(){members().forEach(m=>{const el=$('#ex-s-'+m.id);if(!el)return;EX.raw[m.id]=el.type==='checkbox'?el.checked:el.value})}
function renderSplit(){
  const ms=members();
  $('#ex-split').innerHTML=ms.map(m=>{const r=EX.raw[m.id];
    if(EX.mode==='equal')return `<label class="splitrow"><input type="checkbox" id="ex-s-${m.id}" ${r===false?'':'checked'}>${av(m.id)}<span class="n">${esc(m.name)}</span><span class="hint num" id="ex-v-${m.id}"></span></label>`;
    const ph=EX.mode==='exact'?'0,00':String(Math.round(1000/ms.length)/10).replace('.',',');
    return `<div class="splitrow">${av(m.id)}<label class="n" for="ex-s-${m.id}">${esc(m.name)}</label><input class="inp num" id="ex-s-${m.id}" inputmode="decimal" value="${esc(r??(EX.mode==='percent'?ph:''))}" placeholder="${ph}"><span class="hint">${EX.mode==='exact'?'€':'%'}</span></div>`}).join('');
  splitHint();
}
function computeShares(){
  const ms=members(),cents=parseEur($('#ex-amount').value);const shares={};
  if(!(cents>0))return{err:'Gib einen Betrag größer als 0 ein.'};
  if(EX.mode==='equal'){const sel=ms.filter(m=>$('#ex-s-'+m.id)?.checked);if(!sel.length)return{err:'Wähle mindestens eine Person aus.'};
    const base=Math.floor(cents/sel.length);let rem=cents-base*sel.length;sel.forEach(m=>{shares[m.id]=base+(rem>0?1:0);if(rem>0)rem--});return{cents,shares}}
  if(EX.mode==='exact'){let sum=0;for(const m of ms){const v=$('#ex-s-'+m.id).value.trim();const c=v?parseEur(v):0;if(Number.isNaN(c))return{err:`Betrag für ${m.name} ist keine Zahl.`};if(c)shares[m.id]=c;sum+=c}
    if(sum!==cents)return{err:`Die Beträge ergeben ${eur(sum)}, es fehlen ${eur(cents-sum)}.`,soft:true};return{cents,shares}}
  let tot=0;const ps={};for(const m of ms){const v=$('#ex-s-'+m.id).value.trim().replace(',','.');const p=v?Number(v):0;if(!Number.isFinite(p))return{err:`Prozent für ${m.name} ist keine Zahl.`};ps[m.id]=p;tot+=p}
  if(Math.abs(tot-100)>0.01)return{err:`Die Prozente ergeben ${String(Math.round(tot*10)/10).replace('.',',')} %, nicht 100 %.`,soft:true};
  let acc=0,big=null;for(const m of ms){if(!ps[m.id])continue;const c=Math.round(cents*ps[m.id]/100);shares[m.id]=c;acc+=c;if(!big||ps[m.id]>ps[big])big=m.id}
  if(big)shares[big]+=cents-acc;return{cents,shares};
}
function splitHint(){
  const r=computeShares();const h=$('#ex-hint');
  members().forEach(m=>{const el=$('#ex-v-'+m.id);if(el)el.textContent=r.shares&&r.shares[m.id]?eur(r.shares[m.id]):''});
  if(r.err&&$('#ex-amount').value.trim()){h.textContent=r.err;h.className='hint bad'}else{h.textContent=r.shares?Object.entries(r.shares).map(([k,v])=>`${mName(k)} ${eur(v)}`).join(' · '):'';h.className='hint num'}
}
async function saveExpense(){
  const title=$('#ex-title').value.trim();if(!title){toast('Gib an, wofür das Geld war.');$('#ex-title').focus();return}
  const r=computeShares();if(r.err){toast(r.err);return}
  captureRaw();
  const base={title,cents:r.cents,payer:$('#ex-payer').value,category:$('#ex-cat').value,mode:EX.mode,shares:r.shares,raw:EX.raw};
  if(EX.rec){
    const old=S.recurring.find(x=>x.id===EX.id);
    const doc={...base,every:+$('#ex-every').value,day:+$('#ex-day').value,start:old?.bookedThrough?old.start:($('#ex-start').value||today().slice(0,7)),active:$('#ex-active').checked,bookedThrough:old?.bookedThrough||null,at:old?.at||Date.now()};
    const col=S.db.collection('recurring');
    const ok=await save(()=>EX.id?col.doc(EX.id).set(doc):col.add(doc));
    if(ok){closeSheet();toast(EX.id?'Dauerauftrag gespeichert':'Dauerauftrag angelegt')}
    return;
  }
  const orig=S.expenses.find(x=>x.id===EX.id);
  const doc={kind:'expense',...base,date:$('#ex-date').value||today(),...(orig?.recId?{recId:orig.recId}:{})};
  const col=S.db.collection('expenses');
  const ok=await save(()=>EX.id?col.doc(EX.id).set({...doc,at:orig?.at||Date.now(),by:S.me||null}):col.add({...doc,at:Date.now(),by:S.me||null}));
  if(ok){closeSheet();toast(EX.id?'Ausgabe gespeichert':'Ausgabe eingetragen')}
}

/* Recurring: book every due month once. Booked expenses get a fixed id per month,
   so two open devices writing at the same time produce the same single entry. */
const booking=new Set();
async function bookRecurring(){
  if(!S.db||S.ro||!S.ready.recurring||!S.ready.expenses)return;
  const t=today(),have=new Set(S.expenses.map(e=>e.id));
  for(const r of S.recurring){
    if(r.active===false||booking.has(r.id)||!r.start)continue;
    let ym=r.bookedThrough?ymAdd(r.bookedThrough,r.every||1):r.start;const due=[];
    while(recDate(r,ym)<=t&&due.length<36){due.push(ym);ym=ymAdd(ym,r.every||1)}
    if(!due.length)continue;
    booking.add(r.id);
    try{
      for(const m of due){const id='rec-'+r.id+'-'+m;if(have.has(id))continue;
        await S.db.doc('expenses/'+id).set({kind:'expense',title:r.title,cents:r.cents,payer:r.payer,date:recDate(r,m),category:r.category,mode:r.mode,shares:r.shares,raw:r.raw||{},recId:r.id,at:Date.now(),by:null})}
      await S.db.doc('recurring/'+r.id).update({bookedThrough:due[due.length-1]});
    }catch(e){}
    finally{booking.delete(r.id)}
  }
}

/* Receipt scan: photo -> Claude reads the lines -> review & correct -> one expense with item breakdown */
let RC=null;
function receiptSheet(e){
  const ms=members();
  RC={id:e?.id||null,ctl:null,busy:false,error:'',
    store:e?.title||'',date:e?.date||today(),payer:e?.payer||S.me||ms[0]?.id,bonTotal:e?.bonTotal??null,
    items:(e?.items||[]).map(x=>({...x})),parts:e?.raw?.parts||Object.fromEntries(ms.map(m=>[m.id,true]))};
  openSheet('',()=>rcRender());
}
function rcRender(){
  const root=$('#sheet');if(!RC)return;
  const ms=members();
  const head=sheetHead(RC.id?'Kassenzettel bearbeiten':'Kassenzettel scannen');
  if(!RC.items.length&&!RC.id){
    root.innerHTML=`${head}
    ${RC.busy?`<div class="rc-drop"><div class="spin" role="status" aria-label="Wird gelesen"></div><strong>Lese den Kassenzettel …</strong><span>Das dauert meist 10 bis 40 Sekunden.</span><button class="btn ghost sm" data-act="rc-stop">Abbrechen</button></div>`
    :`<label class="rc-drop" for="rc-file" style="cursor:pointer"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>
      <strong>Foto vom Kassenzettel wählen</strong><span>Am besten flach hingelegt und der ganze Bon im Bild. Du prüfst die erkannten Positionen danach, bevor etwas gespeichert wird.</span><span class="btn primary">Foto auswählen</span></label>
      <input type="file" id="rc-file" accept="${esc((S.img?.mediaTypes||['image/jpeg','image/png','image/webp']).join(','))}" hidden>
      ${RC.error?`<p class="hint bad" style="margin:0">${esc(RC.error)}</p>`:''}
      <button class="btn ghost sm" data-act="rc-manual" style="align-self:flex-start">Positionen selbst eintippen</button>`}`;
    $('#rc-file')?.addEventListener('change',ev=>{const f=ev.target.files[0];ev.target.value='';if(f)rcScan(f)});
    return;
  }
  root.innerHTML=`${head}
  <div class="grid2">
    <div class="field"><label for="rc-store">Geschäft</label><input class="inp" id="rc-store" value="${esc(RC.store)}" placeholder="z. B. Rewe"></div>
    <div class="field"><label for="rc-date">Datum</label><input class="inp" type="date" id="rc-date" value="${esc(RC.date)}"></div>
    <div class="field"><label for="rc-payer">Bezahlt von</label><select class="inp" id="rc-payer">${memberOpts(RC.payer)}</select></div>
    <div class="field"><span class="lbl">Geteilt zwischen</span><div style="display:flex;gap:12px;flex-wrap:wrap;min-height:42px;align-items:center">${ms.map(m=>`<label style="display:flex;gap:6px;align-items:center;font-weight:600"><input type="checkbox" id="rc-part-${m.id}" ${RC.parts[m.id]!==false?'checked':''} style="width:18px;height:18px;accent-color:var(--accent)">${esc(m.name)}</label>`).join('')}</div></div>
  </div>
  <div class="sec-h" style="margin:0"><h2 style="font-size:17px">Positionen <span class="mut num" style="font-size:14px">(${RC.items.length})</span></h2><button class="btn ghost sm" data-act="rc-add">Position hinzufügen</button></div>
  <p class="hint" style="margin:0">Pfand-Rückgabe und Rabatte stehen mit Minus. Bei „Für“ kannst du einzelne Artikel einer Person allein zuordnen.</p>
  <div class="card" style="padding:0 12px">${RC.items.map((it,i)=>`<div class="rc-item">
      <input class="inp" id="rc-n-${i}" value="${esc(it.name)}" aria-label="Artikel">
      <input class="inp num price" id="rc-p-${i}" inputmode="decimal" value="${centsToInput(it.cents)}" aria-label="Preis in €">
      <button class="iconbtn" data-act="rc-rm" data-i="${i}" aria-label="Position entfernen">${ICON_X}</button>
      <div class="sub2">${catSelect('rc-c-'+i,CATS.includes(it.category)?it.category:'Sonstiges')}
        <select class="inp" id="rc-f-${i}" aria-label="Für wen"><option value="all">Für: alle</option>${ms.map(m=>`<option value="${m.id}" ${it.for===m.id?'selected':''}>Für: nur ${esc(m.name)}</option>`).join('')}</select></div>
    </div>`).join('')||'<div class="empty"><span>Noch keine Positionen.</span></div>'}</div>
  <div class="rc-sum" id="rc-sum"></div>
  <div class="foot">${RC.id?`<button class="btn danger" data-act="rc-del">Löschen</button>`:''}<div class="right"><button class="btn ghost" data-act="close">Abbrechen</button><button class="btn primary w" data-act="rc-save">Als Ausgabe speichern</button></div></div>`;
  root.oninput=root.onchange=ev=>{if(ev.target.id?.startsWith('rc-'))rcSync()};
  rcSync();
}
function rcSync(){
  // read the form back into RC and refresh the summary
  if(!$('#rc-store'))return;
  RC.store=$('#rc-store').value;RC.date=$('#rc-date').value;RC.payer=$('#rc-payer').value;
  members().forEach(m=>{const c=$('#rc-part-'+m.id);if(c)RC.parts[m.id]=c.checked});
  RC.items.forEach((it,i)=>{it.name=$('#rc-n-'+i).value;const c=parseEur($('#rc-p-'+i).value);it.cents=Number.isNaN(c)?NaN:c;it.category=$('#rc-c-'+i).value;it.for=$('#rc-f-'+i).value});
  const r=rcShares(),el=$('#rc-sum');
  const sum=RC.items.reduce((s,it)=>s+(Number.isNaN(it.cents)?0:it.cents),0);
  const byCat={};RC.items.forEach(it=>{if(!Number.isNaN(it.cents))byCat[it.category]=(byCat[it.category]||0)+it.cents});
  el.innerHTML=`<div class="ln"><span>Summe der Positionen</span><b class="num">${eur(sum)}</b></div>
    ${RC.bonTotal!=null&&RC.bonTotal!==sum?`<div class="ln ${Math.abs(RC.bonTotal-sum)>0?'neg':''}"><span>Summe laut Bon</span><span class="num">${eur(RC.bonTotal)} · Differenz ${eur(RC.bonTotal-sum)}</span></div>`:''}
    <div class="ln mut"><span>${Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([c,v])=>`${esc(c)} ${eur(v)}`).join(' · ')}</span></div>
    <div class="ln ${r.err?'neg':''}"><span>${r.err?esc(r.err):Object.entries(r.shares).map(([k,v])=>`${esc(mName(k))} trägt ${eur(v)}`).join(' · ')}</span></div>`;
}
function rcShares(){
  if(RC.items.some(it=>Number.isNaN(it.cents)))return{err:'Ein Preis ist keine Zahl.'};
  const parts=members().filter(m=>RC.parts[m.id]!==false).map(m=>m.id);
  const shares={};let all=0;
  RC.items.forEach(it=>{if(it.for&&it.for!=='all')shares[it.for]=(shares[it.for]||0)+it.cents;else all+=it.cents});
  if(all!==0&&!parts.length)return{err:'Wähle aus, zwischen wem geteilt wird.'};
  const k=parts.length;parts.forEach((id,i)=>{shares[id]=(shares[id]||0)+Math.round(all*(i+1)/k)-Math.round(all*i/k)});
  for(const key in shares)if(!shares[key])delete shares[key];
  return{shares};
}
async function rcScan(file){
  if(!S.img)return;
  const mine=RC;RC.busy=true;RC.error='';RC.ctl=new AbortController();rcRender();
  const alive=()=>RC===mine;
  const prompt=`Das Bild zeigt einen Kassenzettel (Bon), meist aus einem deutschen Geschäft.
Lies jede gekaufte Position ab und ordne sie genau einer dieser Kategorien zu: ${CATS.join(', ')}.
Regeln:
- "price" ist der Gesamtpreis der Zeile in Euro als Zahl (Menge × Einzelpreis), z. B. 2.38.
- Rabatte, Coupons und Pfand-Rückgaben sind eigene Positionen mit negativem Preis. Pfand beim Kauf ist eine Position mit positivem Preis in derselben Kategorie wie der Artikel.
- Schreibe abgekürzte Artikelnamen verständlich aus (z. B. "BIO H-MILCH 1,5%" -> "Bio H-Milch 1,5 %"), ohne zu erfinden.
- Ignoriere Zwischensummen, Gesamtsumme, Zahlungsart, Steuerzeilen und Rückgeld als Positionen.
- "total" ist die zu zahlende Endsumme laut Bon, "date" das Kaufdatum als YYYY-MM-DD, "store" der Name des Geschäfts. Unlesbares als null.
Antworte nur mit JSON in dieser Form:
{"store":"Rewe","date":"2026-11-07","total":23.45,"items":[{"name":"Bio H-Milch 1,5 %","price":1.19,"category":"Lebensmittel"}]}
Wenn kein Kassenzettel zu sehen ist, antworte mit {"items":[]}.`;
  try{
    const res=await scanJSON(prompt,file,RC.ctl.signal);
    const items=(Array.isArray(res?.items)?res.items:[]).filter(x=>x&&typeof x.name==='string'&&Number.isFinite(Number(x.price)))
      .map(x=>({name:x.name.trim().slice(0,120),cents:Math.round(Number(x.price)*100),category:CATS.includes(x.category)?x.category:'Sonstiges',for:'all'})).slice(0,150);
    if(!alive())return;
    RC.busy=false;
    if(!items.length){RC.error='Auf dem Foto habe ich keine Positionen erkannt. Versuch ein schärferes Foto, auf dem der ganze Bon zu sehen ist.';rcRender();return}
    RC.items=items;
    if(typeof res.store==='string'&&res.store.trim())RC.store=res.store.trim().slice(0,60);
    if(/^\d{4}-\d{2}-\d{2}$/.test(res.date||'')&&res.date<=today())RC.date=res.date;
    RC.bonTotal=Number.isFinite(Number(res.total))&&res.total!==null?Math.round(Number(res.total)*100):null;
    rcRender();
  }catch(e){
    if(!alive())return;
    RC.busy=false;const c=e?.code;
    if(c==='cancelled')RC.error='';
    else if(c==='offline')RC.error='Ohne Internet geht das Scannen nicht. Du kannst die Positionen selbst eintippen.';
    else if(c==='not_granted')RC.error='Der Scan-Dienst kennt deine E-Mail nicht. Prüfe ALLOWED_EMAILS beim Scan-Server (Anleitung Schritt 6).';
    else if(c==='rate_limited')RC.error='Gerade zu viele Anfragen oder das API-Guthaben ist aufgebraucht. Versuch es später noch einmal.';
    else if(c==='image_rejected')RC.error='Dieses Bild kann ich nicht lesen. Nimm ein JPG oder PNG.';
    else if(c==='invalid_json')RC.error='Der Bon konnte nicht sauber ausgelesen werden. Versuch es noch einmal oder mit einem schärferen Foto.';
    else RC.error='Das Foto konnte nicht gelesen werden. Bitte noch einmal versuchen.';
    rcRender();
  }
}
async function rcSave(){
  rcSync();
  const items=RC.items.filter(it=>it.name.trim()||it.cents);
  if(!items.length){toast('Füge mindestens eine Position hinzu.');return}
  const r=rcShares();if(r.err){toast(r.err);return}
  const cents=items.reduce((s,it)=>s+it.cents,0);if(!(cents>0)){toast('Die Summe muss größer als 0 sein.');return}
  const byCat={};items.forEach(it=>byCat[it.category]=(byCat[it.category]||0)+it.cents);
  const main=Object.entries(byCat).sort((a,b)=>b[1]-a[1])[0][0];
  const orig=S.expenses.find(x=>x.id===RC.id);
  const doc={kind:'expense',title:RC.store.trim()||'Einkauf',cents,payer:RC.payer,date:RC.date||today(),category:main,mode:'items',shares:r.shares,
    raw:{parts:RC.parts},items:items.map(it=>({name:it.name.trim()||'Artikel',cents:it.cents,category:it.category,for:it.for||'all'})),bonTotal:RC.bonTotal,at:orig?.at||Date.now(),by:S.me||null};
  const col=S.db.collection('expenses');
  const ok=await save(()=>RC.id?col.doc(RC.id).set(doc):col.add(doc));
  if(ok){closeSheet();RC=null;toast(`Bon gespeichert: ${eur(cents)} in ${Object.keys(byCat).length} ${Object.keys(byCat).length===1?'Kategorie':'Kategorien'}`)}
}

/* Settle */
function settleSheet(e,pre){
  const ms=members();const to=e?Object.keys(e.shares||{})[0]:pre?.to;
  const from=e?.payer||pre?.from||S.me||ms[0]?.id;
  openSheet(`${sheetHead(e?'Zahlung bearbeiten':'Zahlung erfassen')}
  <p class="hint" style="margin:0">Trag ein, wenn jemand Geld überwiesen oder bar gegeben hat. Das gleicht den Kontostand aus.</p>
  <div class="grid2">
    <div class="field"><label for="st-from">Wer hat gezahlt?</label><select class="inp" id="st-from">${memberOpts(from)}</select></div>
    <div class="field"><label for="st-to">An wen?</label><select class="inp" id="st-to">${memberOpts(to||ms.find(m=>m.id!==from)?.id)}</select></div>
    <div class="field"><label for="st-amount">Betrag in €</label><input class="inp num" id="st-amount" inputmode="decimal" value="${e?centsToInput(e.cents):pre?.c?centsToInput(pre.c):''}"></div>
    <div class="field"><label for="st-date">Datum</label><input class="inp" type="date" id="st-date" value="${e?.date||today()}"></div>
  </div>
  <div class="foot">${e?`<button class="btn danger" data-act="st-del" data-id="${e.id}">Löschen</button>`:''}<div class="right"><button class="btn ghost" data-act="close">Abbrechen</button><button class="btn primary w" data-act="st-save" data-id="${e?.id||''}">Als bezahlt speichern</button></div></div>`);
}
async function saveSettle(id){
  const from=$('#st-from').value,to=$('#st-to').value,c=parseEur($('#st-amount').value);
  if(from===to){toast('Zahler und Empfänger müssen verschiedene Personen sein.');return}
  if(!(c>0)){toast('Gib einen Betrag größer als 0 ein.');return}
  const doc={kind:'payment',title:'Ausgleichszahlung',cents:c,payer:from,shares:{[to]:c},date:$('#st-date').value||today(),by:S.me||null};
  const col=S.db.collection('expenses');
  const ok=await save(()=>id?col.doc(id).set({...doc,at:S.expenses.find(x=>x.id===id)?.at||Date.now()}):col.add({...doc,at:Date.now()}));
  if(ok){closeSheet();toast('Zahlung gespeichert')}
}

/* Chore */
function choreSheet(c){
  const ev=c?.every||7;const isPreset=EVERY_PRESETS.includes(ev);
  const cu=ev>=30?[deNum(monthsOf(ev)),30]:ev%7===0?[ev/7,7]:[ev,1];
  openSheet(`${sheetHead(c?'Aufgabe bearbeiten':'Neue Aufgabe')}
  <div class="field"><label for="ch-title">Aufgabe</label><input class="inp" id="ch-title" value="${esc(c?.title||'')}" placeholder="z. B. Bad putzen"></div>
  <div class="grid2">
    <div class="field"><label for="ch-every">Wie oft?</label><select class="inp" id="ch-every">${EVERY_PRESETS.map(n=>`<option value="${n}" ${n===ev?'selected':''}>${everyLabel(n)}</option>`).join('')}<option value="custom" ${isPreset?'':'selected'}>Eigener Rhythmus …</option></select></div>
    <div class="field"><label for="ch-points">Punkte</label><select class="inp" id="ch-points">${[1,2,3,4,5].map(n=>`<option ${n===(c?.points||2)?'selected':''}>${n}</option>`).join('')}</select></div>
    <div class="field"><label for="ch-who">Wer ist dran?</label><select class="inp" id="ch-who">${memberOpts(c?.assignee||S.me||members()[0]?.id)}</select></div>
    <div class="field"><label for="ch-last">Zuletzt erledigt</label><input class="inp" type="date" id="ch-last" value="${c?.last||''}"></div>
  </div>
  <div class="field" id="ch-custom" ${isPreset?'hidden':''}><span class="lbl">Eigener Rhythmus</span>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span>alle</span>
      <input class="inp num" id="ch-n" inputmode="decimal" value="${cu[0]}" style="width:90px;flex:0 0 90px" aria-label="Anzahl">
      <select class="inp" id="ch-unit" style="width:auto;flex:1;min-width:120px" aria-label="Einheit"><option value="1" ${cu[1]===1?'selected':''}>Tage</option><option value="7" ${cu[1]===7?'selected':''}>Wochen</option><option value="30" ${cu[1]===30?'selected':''}>Monate</option></select>
    </div><span class="hint" id="ch-prev"></span></div>
  <label class="splitrow" style="border:0"><input type="checkbox" id="ch-rotate" ${c?.rotate===false?'':'checked'}><span class="n" style="font-weight:500">Nach dem Erledigen ist die nächste Person dran</span></label>
  <div class="foot">${c?`<button class="btn danger" data-act="ch-del" data-id="${c.id}">Löschen</button>`:''}<div class="right"><button class="btn ghost" data-act="close">Abbrechen</button><button class="btn primary w" data-act="ch-save" data-id="${c?.id||''}">Speichern</button></div></div>`,
  root=>{const sel=$('#ch-every'),box=$('#ch-custom');
    const prev=()=>{const d=customDays();$('#ch-prev').textContent=d?`= ${everyLabel(d)}`:'Gib eine Zahl ein, z. B. 1,5.'};
    sel.addEventListener('change',()=>{box.hidden=sel.value!=='custom';if(!box.hidden){prev();$('#ch-n').focus()}});
    $('#ch-n').addEventListener('input',prev);$('#ch-unit').addEventListener('change',prev);prev()});
}
function customDays(){const n=Number($('#ch-n').value.trim().replace(',','.'));if(!(n>0))return 0;const d=Math.round(n*(+$('#ch-unit').value));return d>=1?Math.min(d,3650):0}
async function saveChore(id){
  const title=$('#ch-title').value.trim();if(!title){toast('Gib der Aufgabe einen Namen.');return}
  const every=$('#ch-every').value==='custom'?customDays():+$('#ch-every').value;
  if(!every){toast('Gib beim eigenen Rhythmus eine Zahl ab 1 ein.');return}
  const doc={title,every,points:+$('#ch-points').value,assignee:$('#ch-who').value,last:$('#ch-last').value||null,rotate:$('#ch-rotate').checked};
  const ok=await save(()=>id?S.db.doc('chores/'+id).update(doc):S.db.collection('chores').add({...doc,log:[],at:Date.now()}));
  if(ok){closeSheet();toast('Aufgabe gespeichert')}
}
async function choreDone(id){
  const c=S.chores.find(x=>x.id===id);if(!c)return;
  const who=S.me||c.assignee;const ms=members();
  let next=c.assignee;if(c.rotate!==false&&ms.length>1){const i=ms.findIndex(m=>m.id===who);next=ms[(i+1)%ms.length].id}
  const log=[...(c.log||[]),{m:who,d:today(),p:c.points||1}].slice(-40);
  const ok=await save(()=>S.db.doc('chores/'+id).update({last:today(),assignee:next,log}));
  if(ok)toast(`${c.title}: erledigt, +${c.points||1} Punkte`);
}

/* Upload */
function parseLines(text){
  return text.split(/\r?\n|;/).map(l=>l.replace(/^\s*(?:[-*•·–]|\[\s?[xX ]?\]|\d+[.)])\s*/,'').trim()).filter(Boolean).map(l=>{
    const m=l.match(/^(\d+(?:[.,]\d+)?\s*(?:x|×|g|kg|ml|l|stk\.?|stück|pck\.?|packung(?:en)?|dosen?|fl\.?|flaschen?|bund|becher)?)\s+(.+)$/i);
    return m?{name:m[2].trim(),qty:m[1].trim()}:{name:l,qty:''};
  }).filter(x=>x.name.length<=120).slice(0,80);
}
function uploadSheet(){
  openSheet(`${sheetHead('Liste hochladen')}
  <p class="hint" style="margin:0">Füge eine Liste ein (ein Artikel pro Zeile), lade eine Textdatei hoch${S.img?' oder fotografiere einen Einkaufszettel':''}. Prüfe die Liste und füge sie dann hinzu.</p>
  <div class="row-actions">
    <label class="btn ghost sm" for="up-file">Textdatei wählen</label><input type="file" id="up-file" accept=".txt,.csv,.md,text/plain" hidden>
    <span ${S.img?'':'hidden'} id="up-photo-wrap"><label class="btn lemon sm" for="up-photo">Foto vom Zettel</label><input type="file" id="up-photo" accept="${esc((S.img?.mediaTypes||['image/jpeg','image/png']).join(','))}" hidden></span>
  </div>
  <div class="field"><label for="up-text">Artikel</label><textarea class="inp" id="up-text" rows="7" placeholder="2 Hafermilch&#10;Bananen&#10;500 g Nudeln&#10;Spülmittel"></textarea></div>
  <div class="hint" id="up-hint"></div>
  <div class="foot"><div class="right"><button class="btn ghost" data-act="close">Abbrechen</button><button class="btn primary w" data-act="up-add">Zur Liste hinzufügen</button></div></div>`,
  root=>{
    const t=$('#up-text'),h=$('#up-hint');
    const upd=()=>{const n=parseLines(t.value).length;h.textContent=n?`${n} Artikel erkannt`:'';h.className='hint'};t.addEventListener('input',upd);
    $('#up-file').addEventListener('change',async ev=>{const f=ev.target.files[0];if(!f)return;t.value=(t.value?t.value+'\n':'')+(await f.text());upd();ev.target.value=''});
    $('#up-photo').addEventListener('change',async ev=>{const f=ev.target.files[0];if(!f||!S.img)return;ev.target.value='';
      h.className='hint';h.textContent='Lese den Zettel …';
      try{
        const res=await scanJSON('Das Bild zeigt einen Einkaufszettel oder eine Einkaufsliste (meist auf Deutsch, oft handschriftlich). Lies jeden Artikel ab. Antworte nur mit einem JSON-Array aus Objekten {"name": string, "qty": string}; qty ist die Menge, wenn eine dasteht, sonst "". Beispiel: [{"name":"Hafermilch","qty":"2"},{"name":"Bananen","qty":""}]. Wenn kein Einkaufszettel zu sehen ist, antworte mit [].',f);
        const items=Array.isArray(res)?res.filter(x=>x&&typeof x.name==='string'&&x.name.trim()):[];
        if(!items.length){h.textContent='Auf dem Foto habe ich keine Artikel gefunden. Versuch ein schärferes Foto.';h.className='hint bad';return}
        t.value=(t.value?t.value+'\n':'')+items.map(x=>(x.qty?String(x.qty).trim()+' ':'')+x.name.trim()).join('\n');upd();
      }catch(e){
        const c=e?.code;h.className='hint bad';
        if(c==='offline')h.textContent='Ohne Internet geht die Fotoerkennung nicht. Tippe die Liste ein oder versuch es später.';
        else if(c==='not_granted')h.textContent='Der Scan-Dienst kennt deine E-Mail nicht. Prüfe ALLOWED_EMAILS beim Scan-Server (Anleitung Schritt 6).';
        else if(c==='rate_limited')h.textContent='Gerade zu viele Anfragen. Versuch es in ein paar Minuten noch einmal.';
        else if(c==='image_rejected')h.textContent='Dieses Bild kann ich nicht lesen. Nimm ein JPG oder PNG.';
        else if(c==='cancelled')h.textContent='';
        else h.textContent='Das Foto konnte nicht gelesen werden. Bitte noch einmal versuchen.';
      }});
  });
}
async function addItems(items){
  const col=S.db.collection('shopping');const now=Date.now();
  return save(()=>Promise.all(items.map((it,i)=>col.add({name:it.name,qty:it.qty||'',done:false,by:S.me||null,at:now+i}))));
}

/* Settings */
function settingsSheet(){
  const ms=members();
  openSheet(`${sheetHead('Haushalt')}
  <div class="field"><label for="se-name">Name des Haushalts</label><input class="inp" id="se-name" value="${esc(S.meta.name||'')}"></div>
  <div class="field"><span class="lbl">Mitbewohner</span>${ms.map(m=>`<div class="splitrow">${av(m.id)}<input class="inp" style="flex:1;width:auto;text-align:left" id="se-m-${m.id}" value="${esc(m.name)}" aria-label="Name"></div>`).join('')}
    ${ms.length<6?`<div class="splitrow"><span class="av p3">+</span><input class="inp" style="flex:1;width:auto;text-align:left" id="se-new" placeholder="Weitere Person (optional)" aria-label="Weitere Person"></div>`:''}</div>
  <div class="field"><label for="se-me">Auf diesem Gerät bin ich</label><select class="inp" id="se-me">${memberOpts(S.me)}</select></div>
  <div class="field"><span class="lbl">Zugang per E-Mail</span>
    <div class="card" style="padding:0 12px">${(S.meta.emails||[]).map(e=>`<div class="splitrow"><span class="n" style="font-weight:500;overflow-wrap:anywhere">${esc(e)}${e===S.email?' <span class="mut">(du)</span>':''}</span>${e===S.email?'':`<button class="btn danger sm" data-act="se-rm-mail" data-mail="${esc(e)}">Entfernen</button>`}</div>`).join('')}</div>
    <input class="inp" id="se-mail" type="email" autocapitalize="off" inputmode="email" placeholder="Weitere E-Mail einladen (optional)">
    <span class="hint">Wer hier steht, kann sich mit dieser Adresse registrieren und sieht euren Haushalt.</span></div>
  <div class="foot"><button class="btn ghost" data-act="logout">Abmelden</button><div class="right"><button class="btn ghost" data-act="close">Abbrechen</button><button class="btn primary" data-act="se-save">Speichern</button></div></div>`);
}
async function iAm(id){
  S.me=id;lsSet('hh-me',id);render();
  if(S.uid&&!S.ro){const ms=members().map(m=>{const c={...m};if(c.uid===S.uid&&c.id!==id)delete c.uid;if(c.id===id)c.uid=S.uid;return c});
    if(JSON.stringify(ms)!==JSON.stringify(members()))try{await S.db.doc('meta/household').update({members:ms})}catch(e){}}
}

/* ---------- Events ---------- */
const armed=new Map();
function confirmTwice(btn,label){if(armed.get(btn)){armed.delete(btn);return true}armed.set(btn,1);const old=btn.innerHTML;btn.textContent=label||'Wirklich löschen?';setTimeout(()=>{if(armed.get(btn)){armed.delete(btn);btn.innerHTML=old}},3000);return false}

document.addEventListener('click',async ev=>{
  const tab=ev.target.closest('[data-tab]');if(tab){location.hash=tab.dataset.tab;show(tab.dataset.tab);return}
  const sb=ev.target.closest('[data-sub]');if(sb){S.expSub=sb.dataset.sub;lsSet('hh-sub',S.expSub);renderSub();return}
  const b=ev.target.closest('[data-act]');if(!b)return;const a=b.dataset.act,id=b.dataset.id;
  switch(a){
    case 'rep-prev':S.repMonth=ymAdd(S.repMonth||today().slice(0,7),-1);renderReport();break;
    case 'rep-next':{const n=ymAdd(S.repMonth||today().slice(0,7),1);if(n<=today().slice(0,7)){S.repMonth=n;renderReport()}break}
    case 'rec-new':expenseSheet(null,null,true);break;
    case 'rec-edit':expenseSheet(S.recurring.find(x=>x.id===id),null,true);break;
    case 'rec-del':if(confirmTwice(b)&&await save(()=>S.db.doc('recurring/'+EX.id).delete())){closeSheet();toast('Dauerauftrag gelöscht. Bereits eingetragene Monate bleiben erhalten.')}break;
    case 'close':closeSheet();break;
    case 'settings':settingsSheet();break;
    case 'iam':iAm(id);break;
    case 'setup-save':createHousehold(b);break;
    case 'su-retry':lsSet('hh-id','');findHousehold();break;
    case 'logout':closeSheet();lsSet('hh-id','');lsSet('hh-me','');S.me=null;stopHousehold();signOut(auth);break;
    case 'au-toggle':S.authMode=S.authMode==='login'?'register':'login';renderAuth();break;
    case 'au-reset':authReset();break;
    case 'vf-check':verifyCheck();break;
    case 'vf-resend':try{await sendEmailVerification(auth.currentUser);$('#vf-msg').textContent='E-Mail ist unterwegs.'}catch(e){$('#vf-msg').textContent=authError(e)}break;
    case 'se-rm-mail':{const m=b.dataset.mail;if(!confirmTwice(b,'Sicher?'))return;
      if(await save(()=>S.db.doc('meta/household').update({emails:(S.meta.emails||[]).filter(x=>x!==m)}))){closeSheet();toast(m+' hat keinen Zugang mehr')}break}
    case 'toggle':{const it=S.shopping.find(x=>x.id===id);if(it)save(()=>S.db.doc('shopping/'+id).update({done:!it.done,doneAt:Date.now()}));break}
    case 'del-item':save(()=>S.db.doc('shopping/'+id).delete());break;
    case 'clear-done':{const d=S.shopping.filter(i=>i.done);if(!confirmTwice(b,`${d.length} entfernen?`))return;save(()=>Promise.all(d.map(i=>S.db.doc('shopping/'+i.id).delete())));break}
    case 'finish':{const d=S.shopping.filter(i=>i.done);const names=d.map(i=>i.name);
      const ok=await save(()=>Promise.all(d.map(i=>S.db.doc('shopping/'+i.id).delete())));
      if(ok){expenseSheet(null,{title:'Einkauf'+(names.length?': '+names.slice(0,4).join(', ')+(names.length>4?' …':''):''),category:'Lebensmittel'});setTimeout(()=>$('#ex-amount')?.focus(),50)}break}
    case 'upload':uploadSheet();break;
    case 'up-add':{const items=parseLines($('#up-text').value);if(!items.length){toast('Keine Artikel gefunden. Ein Artikel pro Zeile.');return}if(await addItems(items)){closeSheet();toast(`${items.length} Artikel hinzugefügt`)}break}
    case 'expense-new':expenseSheet(null);break;
    case 'expense-edit':{const e=S.expenses.find(x=>x.id===id);if(e?.items?.length)receiptSheet(e);else expenseSheet(e);break}
    case 'receipt':receiptSheet(null);break;
    case 'rc-stop':RC?.ctl?.abort();break;
    case 'rc-manual':RC.items.push({name:'',cents:0,category:'Lebensmittel',for:'all'});rcRender();break;
    case 'rc-add':rcSync();RC.items.push({name:'',cents:0,category:RC.items.at(-1)?.category||'Lebensmittel',for:'all'});rcRender();$('#rc-n-'+(RC.items.length-1))?.focus();break;
    case 'rc-rm':rcSync();RC.items.splice(+b.dataset.i,1);rcRender();break;
    case 'rc-save':rcSave();break;
    case 'rc-del':if(confirmTwice(b)&&await save(()=>S.db.doc('expenses/'+RC.id).delete())){closeSheet();toast('Bon gelöscht')}break;
    case 'ex-save':saveExpense();break;
    case 'ex-del':if(confirmTwice(b)&&await save(()=>S.db.doc('expenses/'+EX.id).delete())){closeSheet();toast('Ausgabe gelöscht')}break;
    case 'settle':settleSheet(null,{from:b.dataset.from,to:b.dataset.to,c:+b.dataset.c});break;
    case 'settle-new':settleSheet(null);break;
    case 'settle-edit':settleSheet(S.expenses.find(x=>x.id===id));break;
    case 'st-save':saveSettle(id);break;
    case 'st-del':if(confirmTwice(b)&&await save(()=>S.db.doc('expenses/'+id).delete())){closeSheet();toast('Zahlung gelöscht')}break;
    case 'chore-new':choreSheet(null);break;
    case 'chore-edit':choreSheet(S.chores.find(x=>x.id===id));break;
    case 'ch-save':saveChore(id);break;
    case 'ch-del':if(confirmTwice(b)&&await save(()=>S.db.doc('chores/'+id).delete())){closeSheet();toast('Aufgabe gelöscht')}break;
    case 'chore-done':choreDone(id);break;
    case 'del-note':if(confirmTwice(b,'?'))save(()=>S.db.doc('notes/'+id).delete());break;
    case 'se-save':{const ms=members().map(m=>({...m,name:$('#se-m-'+m.id).value.trim()||m.name}));const nn=$('#se-new')?.value.trim();
      if(nn){let k=ms.length+1;while(ms.some(m=>m.id==='m'+k))k++;ms.push({id:'m'+k,name:nn})}
      const me=$('#se-me').value;const nm=$('#se-mail').value.trim().toLowerCase();
      if(nm&&!MAIL_RE.test(nm)){toast('Die E-Mail-Adresse sieht nicht richtig aus.');return}
      const emails=[...new Set([...(S.meta.emails||[]),...(nm?[nm]:[])])];
      const ok=await save(()=>S.db.doc('meta/household').update({name:$('#se-name').value.trim()||'Unser Haushalt',members:ms,emails}));
      if(ok){closeSheet();if(me!==S.me)iAm(me);toast('Gespeichert')}break}
  }
});
$('#add-form').addEventListener('submit',async ev=>{ev.preventDefault();const n=$('#add-name').value.trim();if(!n)return;const q=$('#add-qty').value.trim();
  $('#add-name').value='';$('#add-qty').value='';$('#add-name').focus();
  const items=n.includes(',')&&!q?n.split(',').map(s=>s.trim()).filter(Boolean).map(x=>({name:x,qty:''})):[{name:n,qty:q}];addItems(items)});
$('#note-form').addEventListener('submit',async ev=>{ev.preventDefault();const t=$('#note-text').value.trim();if(!t)return;
  if(await save(()=>S.db.collection('notes').add({text:t.slice(0,2000),by:S.me||null,at:Date.now()})))$('#note-text').value=''});

/* ---------- Firebase: Anmeldung, Haushalt, Speicher ---------- */
const MAIL_RE=/^[^@\s]+@[^@\s]+\.[^@\s]+$/;
let auth=null,fs=null,unsubs=[],bookTimer=null;

/* Small adapter so the rest of the app keeps its simple db.doc()/db.collection() calls.
   Writes return immediately: Firestore saves them on the phone first and syncs as soon as there is a connection. */
function makeDb(hid){
  const hRef=doc(fs,'households',hid);
  const ref=p=>p==='meta/household'?hRef:doc(hRef,...p.split('/'));
  const fire=p=>{p.catch(failWrite);return Promise.resolve()};
  const wrapDoc=r=>({
    set:d=>fire(setDoc(r,d)),
    update:d=>fire(updateDoc(r,d)),
    delete:()=>fire(deleteDoc(r)),
    onSnapshot:(next,err)=>onSnapshot(r,{includeMetadataChanges:true},s=>next({id:s.id,exists:s.exists(),data:()=>s.data(),metadata:s.metadata}),err)});
  return{
    doc:p=>wrapDoc(ref(p)),
    collection:c=>{const cr=collection(hRef,c);return{
      add:d=>{const r=doc(cr);return fire(setDoc(r,d)).then(()=>wrapDoc(r))},
      doc:id=>wrapDoc(id?doc(cr,id):doc(cr)),
      onSnapshot:(next,err)=>onSnapshot(cr,{includeMetadataChanges:true},next,err)}}};
}

function stopHousehold(){
  unsubs.forEach(u=>{try{u()}catch(e){}});unsubs=[];
  Object.assign(S,{db:null,meta:null,metaReady:false,shopping:[],expenses:[],chores:[],notes:[],recurring:[],ready:{},slow:false,fail:null});
}
function startHousehold(hid){
  stopHousehold();S.phase='app';
  const db=makeDb(hid);S.db=db;
  const timer=setTimeout(()=>{S.slow=true;render()},10000);
  const forget=()=>{clearTimeout(timer);lsSet('hh-id','');stopHousehold();findHousehold()};
  const onErr=e=>{if(e?.code==='permission-denied'){forget();return}clearTimeout(timer);S.fail='Die Daten konnten nicht geladen werden. Schließe die App und öffne sie neu.';render()};
  unsubs.push(db.doc('meta/household').onSnapshot(s=>{
    if(!s.exists&&!s.metadata.fromCache){forget();return}
    S.meta=s.exists?s.data():null;if(s.exists){S.metaReady=true;S.slow=false;clearTimeout(timer)}render()},onErr));
  for(const k of ['shopping','expenses','chores','notes','recurring'])unsubs.push(db.collection(k).onSnapshot(s=>{
    S[k]=s.docs.map(d=>({id:d.id,...d.data()}));S.ready[k]=true;render();
    if((k==='recurring'||k==='expenses')&&!s.metadata.fromCache)bookRecurring()},onErr));
  render();
}
async function findHousehold(){
  const saved=lsGet('hh-id');
  if(saved){startHousehold(saved);return}
  S.phase='loading';render();
  try{
    const q=await getDocs(query(collection(fs,'households'),where('emails','array-contains',S.email)));
    if(!q.empty){const id=q.docs[0].id;lsSet('hh-id',id);startHousehold(id)}
    else{S.phase='setup';render();const n=$('#su-m1');if(n&&!n.value)n.focus()}
  }catch(e){S.phase='setup';render();toast(e?.code==='unavailable'?'Keine Internetverbindung. Für die erste Anmeldung braucht die App Netz.':'Der Haushalt konnte nicht gesucht werden. Versuch es noch einmal.')}
}
async function createHousehold(btn){
  const n1=$('#su-m1').value.trim(),n2=$('#su-m2').value.trim(),m2=$('#su-mail2').value.trim().toLowerCase();
  if(!n1||!n2){toast('Gib beide Namen ein.');return}
  if(m2&&!MAIL_RE.test(m2)){toast('Die E-Mail-Adresse sieht nicht richtig aus.');return}
  btn.disabled=true;
  const r=doc(collection(fs,'households'));
  try{
    await setDoc(r,{name:$('#su-name').value.trim()||'Unser Haushalt',members:[{id:'m1',name:n1,uid:S.uid},{id:'m2',name:n2}],
      emails:[S.email,...(m2&&m2!==S.email?[m2]:[])],owner:S.uid,created:Date.now()});
    lsSet('hh-id',r.id);lsSet('hh-me','m1');S.me='m1';location.hash='einkauf';startHousehold(r.id);
  }catch(e){toast('Der Haushalt konnte nicht angelegt werden. Prüfe die Internetverbindung.')}
  finally{btn.disabled=false}
}

/* Anmeldung */
function authError(e){
  const c=e?.code||'';
  if(/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c))return 'E-Mail oder Passwort stimmt nicht.';
  if(c.includes('email-already-in-use'))return 'Für diese E-Mail gibt es schon ein Konto. Melde dich an.';
  if(c.includes('weak-password'))return 'Das Passwort braucht mindestens 6 Zeichen.';
  if(c.includes('invalid-email')||c.includes('missing-email'))return 'Die E-Mail-Adresse sieht nicht richtig aus.';
  if(c.includes('missing-password'))return 'Gib ein Passwort ein.';
  if(c.includes('network-request-failed'))return 'Keine Internetverbindung.';
  if(c.includes('too-many-requests'))return 'Zu viele Versuche. Warte ein paar Minuten.';
  return 'Das hat nicht geklappt. Bitte noch einmal versuchen.';
}
function renderAuth(){
  const reg=S.authMode==='register';
  $('#au-h').textContent=reg?'Konto erstellen':'Anmelden';
  $('#au-p').textContent=reg?'Einmalig mit der E-Mail, die im Haushalt eingetragen ist. Danach bleibst du angemeldet.':'Mit deiner E-Mail und deinem Passwort.';
  $('#au-submit').textContent=reg?'Konto erstellen':'Anmelden';
  $('#au-toggle').textContent=reg?'Ich habe schon ein Konto':'Neues Konto erstellen';
  $('#au-pw').setAttribute('autocomplete',reg?'new-password':'current-password');
  $('#au-msg').textContent='';$('#au-msg').className='hint';
}
$('#auth-form').addEventListener('submit',async ev=>{
  ev.preventDefault();const btn=$('#au-submit'),msg=$('#au-msg');
  const email=$('#au-email').value.trim(),pw=$('#au-pw').value;
  btn.disabled=true;msg.className='hint';msg.textContent='';
  try{
    if(S.authMode==='register'){const c=await createUserWithEmailAndPassword(auth,email,pw);await sendEmailVerification(c.user)}
    else await signInWithEmailAndPassword(auth,email,pw);
  }catch(e){msg.className='hint bad';msg.textContent=authError(e)}
  finally{btn.disabled=false}
});
async function authReset(){
  const email=$('#au-email').value.trim(),msg=$('#au-msg');
  if(!MAIL_RE.test(email)){msg.className='hint bad';msg.textContent='Trag oben deine E-Mail ein, dann schicke ich dir einen Link zum Zurücksetzen.';return}
  try{await sendPasswordResetEmail(auth,email);msg.className='hint';msg.textContent='Falls es ein Konto gibt, ist der Link jetzt unterwegs.'}
  catch(e){msg.className='hint bad';msg.textContent=authError(e)}
}
async function verifyCheck(){
  const u=auth.currentUser,msg=$('#vf-msg');if(!u)return;
  try{await u.reload()}catch(e){msg.textContent=authError(e);return}
  if(!auth.currentUser.emailVerified){msg.textContent='Noch nicht bestätigt. Tippe zuerst auf den Link in der E-Mail.';return}
  await auth.currentUser.getIdToken(true);
  msg.textContent='';findHousehold();
}

/* Foto-Erkennung über den eigenen Scan-Server (Cloudflare Worker mit Claude-API) */
function shrink(file,max=1600){
  return new Promise((res,rej)=>{
    const url=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{
      const k=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
      const c=document.createElement('canvas');c.width=Math.round(img.naturalWidth*k);c.height=Math.round(img.naturalHeight*k);
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg',0.85).split(',')[1]);
    };
    img.onerror=()=>{URL.revokeObjectURL(url);rej({code:'image_rejected'})};
    img.src=url;
  });
}
function looseJSON(t){
  t=String(t||'').trim();
  try{return JSON.parse(t)}catch(e){}
  const f=t.match(/```(?:json)?\s*([\s\S]*?)```/);if(f){try{return JSON.parse(f[1])}catch(e){}}
  const a=Math.min(...['{','['].map(ch=>{const i=t.indexOf(ch);return i<0?Infinity:i})),b=Math.max(t.lastIndexOf('}'),t.lastIndexOf(']'));
  if(a<b){try{return JSON.parse(t.slice(a,b+1))}catch(e){}}
  throw {code:'invalid_json'};
}
async function scanJSON(prompt,file,signal){
  if(!navigator.onLine)throw {code:'offline'};
  const image=await shrink(file);
  const token=await auth.currentUser.getIdToken();
  let r;
  try{r=await fetch(SCAN_URL,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({prompt,image,mediaType:'image/jpeg'}),signal})}
  catch(e){throw {code:e?.name==='AbortError'?'cancelled':'upstream_error'}}
  if(r.status===401||r.status===403)throw {code:'not_granted'};
  if(r.status===429||r.status===402)throw {code:'rate_limited'};
  if(!r.ok)throw {code:'upstream_error'};
  const {text}=await r.json();
  return looseJSON(text);
}

/* ---------- Boot ---------- */
function boot(){
  render();
  if(!firebaseConfig||!firebaseConfig.apiKey){S.phase='noconfig';render();return}
  const app=initializeApp(firebaseConfig);auth=getAuth(app);
  try{fs=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})})}
  catch(e){fs=getFirestore(app)}
  S.img=SCAN_URL?{mediaTypes:['image/*']}:null;
  renderAuth();
  onAuthStateChanged(auth,u=>{
    stopHousehold();
    if(!u){S.uid=null;S.email=null;S.phase='auth';render();return}
    S.uid=u.uid;S.email=(u.email||'').toLowerCase();
    if(!u.emailVerified){S.phase='verify';$('#vf-mail').textContent=u.email;render();return}
    findHousehold();
  });
  if(!bookTimer)bookTimer=setInterval(()=>{if(document.visibilityState==='visible')bookRecurring()},3600e3);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){render();bookRecurring()}});
}
boot();
})();
