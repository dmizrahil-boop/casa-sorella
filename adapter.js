/* ===== Conexión a Supabase (reemplaza la base de datos de Claude) ===== */
(function(){
const CFG=window.CS_CONFIG||{};
const LS='cs-supabase';
let saved={};try{saved=JSON.parse(localStorage.getItem(LS)||'{}')}catch(e){}
const URL_=(CFG.url&&!/PEGA/.test(CFG.url))?CFG.url:saved.url, KEY=(CFG.key&&!/PEGA/.test(CFG.key))?CFG.key:saved.key;
let sb=null,user=null,readyRes;const ready=new Promise(r=>readyRes=r);
const cache={},loaded={},loading={},colL={},docL={};
const css=`#sbgate{position:fixed;inset:0;z-index:9999;background:#F4EFE6;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Helvetica,Arial,sans-serif;color:#2C2C2A}
#sbgate form{background:#fff;border:1px solid #D9CBB4;border-radius:8px;padding:28px;width:100%;max-width:380px;display:flex;flex-direction:column;gap:12px}
#sbgate h1{font-family:'Cormorant Garamond',Georgia,serif;font-weight:500;font-size:30px;margin:0}
#sbgate label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:#7E6A50}
#sbgate input{font:inherit;font-size:15px;padding:10px;border:1px solid #D9CBB4;border-radius:5px;background:#fff;color:#2C2C2A}
#sbgate button{font:inherit;font-size:15px;padding:11px;border:0;border-radius:5px;background:#A9583A;color:#fff;cursor:pointer}
#sbgate .err{color:#A9583A;font-size:13px;min-height:16px}#sbgate small{color:#7E6A50}`;
function gate(html,onsubmit){let g=document.getElementById('sbgate');if(!g){const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);g=document.createElement('div');g.id='sbgate';document.body.appendChild(g)}
  g.innerHTML=`<form><img src="img/logo.png" alt="Casa Sorella" style="height:46px;align-self:flex-start">${html}<div class="err" id="sberr"></div></form>`;
  g.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=g.querySelector('button');b.disabled=true;try{await onsubmit(g)}catch(err){g.querySelector('#sberr').textContent=err.message||String(err)}b.disabled=false}}
function ungate(){const g=document.getElementById('sbgate');if(g)g.remove()}
function setupScreen(){gate(`<h1>Conectar con Supabase</h1><small>Solo se hace una vez en este navegador. Lo encuentras en Supabase → Project Settings → API.</small>
  <label>Project URL<input name="u" placeholder="https://xxxx.supabase.co" required></label><label>anon public key<input name="k" required></label><button>Conectar</button>`,async g=>{
  const u=g.querySelector('[name=u]').value.trim().replace(/\/$/,''),k=g.querySelector('[name=k]').value.trim();localStorage.setItem(LS,JSON.stringify({url:u,key:k}));location.reload()})}
function loginScreen(){gate(`<h1>Entrar</h1><label>Correo<input name="e" type="email" autocomplete="username" required></label><label>Contraseña<input name="p" type="password" autocomplete="current-password" required></label><button>Entrar</button>`,async g=>{
  const {error}=await sb.auth.signInWithPassword({email:g.querySelector('[name=e]').value.trim(),password:g.querySelector('[name=p]').value});if(error)throw new Error(error.message==='Invalid login credentials'?'Correo o contraseña incorrectos.':error.message)})}
function snapCol(col){const m=cache[col]||new Map();return {docs:[...m].map(([id,d])=>({id,exists:true,data:()=>d}))}}
function emit(col){const s=snapCol(col);(colL[col]||[]).forEach(f=>f.cb(s));Object.keys(docL).forEach(k=>{if(k.indexOf(col+'/')!==0)return;const d=(cache[col]||new Map()).get(k.slice(col.length+1));docL[k].forEach(f=>f.cb({exists:!!d,id:k.slice(col.length+1),data:()=>d||{}}))})}
function E(msg,code){const e=new Error(msg);e.code=code;return e}
async function load(col){if(loading[col])return loading[col];loading[col]=(async()=>{const m=new Map();let from=0;for(;;){const {data,error}=await sb.from('docs').select('id,data').eq('col',col).range(from,from+999);if(error)throw E(error.message,'unavailable');data.forEach(r=>m.set(r.id,r.data));if(data.length<1000)break;from+=1000}cache[col]=m;loaded[col]=true;emit(col)})().finally(()=>{loading[col]=null});return loading[col]}
function listen(map,key,col,cb,err){(map[key]=map[key]||[]);const o={cb,err};map[key].push(o);if(loaded[col])setTimeout(()=>map===colL?cb(snapCol(col)):emit(col),0);else load(col).catch(e=>err&&err(e));return ()=>{map[key]=map[key].filter(x=>x!==o)}}
const rid=()=>Array.from(crypto.getRandomValues(new Uint8Array(15)),b=>'abcdefghijklmnopqrstuvwxyz0123456789'[b%36]).join('').slice(0,20);
const db={
  collection:col=>({onSnapshot:(cb,err)=>listen(colL,col,col,cb,err),doc:id=>db.doc(col+'/'+(id||rid()))}),
  doc:path=>{const i=path.indexOf('/'),col=path.slice(0,i),id=path.slice(i+1);return {id,
    onSnapshot:(cb,err)=>listen(docL,path,col,cb,err),
    set:async data=>{const d=JSON.parse(JSON.stringify(data));(cache[col]=cache[col]||new Map()).set(id,d);emit(col);const {error}=await sb.from('docs').upsert({col,id,data:d,updated_by:user&&user.email,updated_at:new Date().toISOString()});if(error){load(col).catch(()=>{});throw E(error.message,/permission|policy|JWT/i.test(error.message)?'invalid_argument':'unavailable')}},
    delete:async()=>{if(cache[col]){cache[col].delete(id);emit(col)}const {error}=await sb.from('docs').delete().eq('col',col).eq('id',id);if(error){load(col).catch(()=>{});throw E(error.message,'unavailable')}}}}
};
const assets={
  upload:async file=>{if(file.size>20*1024*1024)throw E('Archivo muy grande','too_large');const safe=(file.name||'archivo').normalize('NFD').replace(/[^\w.\-]+/g,'_').slice(-80);const path=`${new Date().toISOString().slice(0,7)}/${rid()}-${safe}`;
    const {error}=await sb.storage.from('archivos').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});if(error)throw E(error.message,'unavailable');
    const {data}=sb.storage.from('archivos').getPublicUrl(path);return {url:data.publicUrl,id:path,contentType:file.type,sizeBytes:file.size}},
  delete:async id=>{await sb.storage.from('archivos').remove([id])}
};
const downloads={save:async({filename,data})=>{const a=document.createElement('a');a.href=URL.createObjectURL(data instanceof Blob?data:new Blob([data]));a.download=filename||'archivo';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000)}};
window.claude={use:async name=>{await ready;return {db,assets,downloads}[name]||null}};
window.csLogout=async()=>{if(sb){await sb.auth.signOut();location.reload()}};
window.csReconnect=()=>{localStorage.removeItem(LS);location.reload()};
async function start(){
  if(!URL_||!KEY){setupScreen();return}
  if(!window.supabase){gate('<h1>Sin conexión</h1><small>No se pudo cargar Supabase. Revisa tu internet y recarga.</small><button>Recargar</button>',async()=>location.reload());return}
  sb=window.supabase.createClient(URL_,KEY,{auth:{persistSession:true,autoRefreshToken:true}});
  const {data:{session}}=await sb.auth.getSession();
  sb.auth.onAuthStateChange((ev,s)=>{if(ev==='SIGNED_OUT'){location.reload()}if(s&&!user){user=s.user;go()}});
  if(session){user=session.user;go()}else loginScreen();
}
function go(){ungate();
  sb.channel('docs-all').on('postgres_changes',{event:'*',schema:'public',table:'docs'},p=>{const r=p.new&&p.new.col?p.new:p.old;if(!r||!r.col||!loaded[r.col])return;const m=cache[r.col]=cache[r.col]||new Map();if(p.eventType==='DELETE')m.delete(r.id);else m.set(r.id,p.new.data);emit(r.col)}).subscribe();
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')Object.keys(loaded).forEach(c=>load(c).catch(()=>{}))});
  const f=document.querySelector('.rail .foot');if(f)f.innerHTML=`${(user.email||'').replace(/[<>&"]/g,'')}<br><a href="#" onclick="csLogout();return false" style="color:inherit">Cerrar sesión</a><br><span style="opacity:.6">Versión 13</span>`;
  readyRes();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
