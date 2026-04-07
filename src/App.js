import { useState, useEffect, useRef, useCallback } from "react";

/* ── Supabase config ── */
const SB_URL = process.env.REACT_APP_SUPABASE_URL;
const SB_KEY = process.env.REACT_APP_SUPABASE_KEY;
const BUCKET = "suppliers-files";




/* ── Supabase REST helpers ── */
const sbHeaders = (extra={}) => ({
  "Content-Type":"application/json",
  "apikey": SB_KEY,
  "Authorization": `Bearer ${SB_KEY}`,
  "Prefer": "return=representation",
  ...extra
});

const sb = {
  async select(table, query=""){
    const r = await fetch(`${SB_URL}/rest/v1/${table}?${query}&order=id.asc`, {headers: sbHeaders({"Prefer":""})});
    if(!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async insert(table, data){
    const r = await fetch(`${SB_URL}/rest/v1/${table}`, {method:"POST", headers: sbHeaders(), body: JSON.stringify(data)});
    if(!r.ok) throw new Error(await r.text());
    const d = await r.json();
    return Array.isArray(d)?d[0]:d;
  },
  async update(table, id, data){
    const r = await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`, {method:"PATCH", headers: sbHeaders(), body: JSON.stringify(data)});
    if(!r.ok) throw new Error(await r.text());
    const d = await r.json();
    return Array.isArray(d)?d[0]:d;
  },
  async delete(table, id){
    const r = await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`, {method:"DELETE", headers: sbHeaders({"Prefer":""})});
    if(!r.ok) throw new Error(await r.text());
  },
  async upsertMeta(key, value){
    const r = await fetch(`${SB_URL}/rest/v1/app_meta`, {method:"POST", headers: sbHeaders({"Prefer":"resolution=merge-duplicates,return=representation"}), body: JSON.stringify({key, value})});
    if(!r.ok) throw new Error(await r.text());
  },
  async getMeta(key){
    const r = await fetch(`${SB_URL}/rest/v1/app_meta?key=eq.${key}`, {headers: sbHeaders({"Prefer":""})});
    if(!r.ok) return null;
    const d = await r.json();
    return d?.[0]?.value ?? null;
  },
  /* Storage */
  async uploadFile(path, blob, contentType){
    const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method:"POST",
      headers:{"apikey":SB_KEY,"Authorization":`Bearer ${SB_KEY}`,"Content-Type":contentType||"image/jpeg","x-upsert":"true"},
      body: blob
    });
    if(!r.ok) throw new Error(await r.text());
    return `${SB_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  },
  async deleteFile(path){
    await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method:"DELETE",
      headers:{"apikey":SB_KEY,"Authorization":`Bearer ${SB_KEY}`}
    });
  },
  publicUrl(path){ return `${SB_URL}/storage/v1/object/public/${BUCKET}/${path}`; }
};

/* ── City/Province map ── */
const CPM = {
  "Langfang":"Hebei","Bazhou":"Hebei","Anji":"Zhejiang","Foshan":"Guangdong",
  "Huizhou":"Guangdong","Shenzhen":"Guangdong","Luoyang":"Henan","Shuyang":"Jiangsu",
  "Suzhou":"Jiangsu","Qingdao":"Shandong","Dezhou":"Shandong","Tianjin":"Tianjin",
  "Fuding":"Fujian","Zhangzhou":"Fujian","Fuzhou":"Fujian","Ganzhou":"Jiangxi"
};
const CITIES = Object.keys(CPM);
const PROVINCES = ["Hebei","Zhejiang","Guangdong","Shandong","Henan","Jiangsu","Jiangxi","Fujian","Tianjin","Sichuan","אחר"];
const FIELDS_OF_WORK = ["פלסטיק","עץ","ברזל","מרופדים","אחר"];

function getProvince(city){ if(!city)return""; const k=CITIES.find(c=>c.toLowerCase()===city.trim().toLowerCase()); return k?CPM[k]:""; }
function fileToBase64(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(file);});}
function base64ToBlob(b64,type){const b=atob(b64),arr=new Uint8Array(b.length);for(let i=0;i<b.length;i++)arr[i]=b.charCodeAt(i);return new Blob([arr],{type});}
function todayStr(){return new Date().toISOString().slice(0,10);}
function nowISO(){return new Date().toISOString();}
function dtLabel(){const n=new Date();return`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}_${String(n.getHours()).padStart(2,"0")}-${String(n.getMinutes()).padStart(2,"0")}`;}
function sanitize(s){return(s||"").replace(/[^a-zA-Z0-9א-ת\s\-_]/g,"").trim().replace(/\s+/g,"_").slice(0,40);}

async function callGemini(prompt, b64, mt, apiKey){
  const preferred = ["gemini-2.5-flash","gemini-flash-latest","gemini-2.0-flash-lite","gemini-2.0-flash"];
  const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  const listData = await listRes.json();
  if(listData.error) throw new Error(listData.error.message);
  const available = (listData.models||[]).filter(m=>(m.supportedGenerationMethods||[]).includes("generateContent")).map(m=>m.name.replace("models/",""));
  const model = preferred.find(p=>available.includes(p))||available.find(m=>m.includes("flash"))||available[0];
  if(!model) throw new Error("לא נמצאו מודלים זמינים");
  const parts=[];
  if(b64) parts.push({inline_data:{mime_type:mt||"image/jpeg",data:b64}});
  parts.push({text:prompt});
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts}]})});
  const d = await res.json();
  if(d.error) throw new Error(d.error.message);
  return d.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("\n")||"";
}

function compressImage(b64, srcType, quality=0.72){
  return new Promise(res=>{
    const img=new Image();
    img.onload=()=>{
      const MAX=1600;let w=img.naturalWidth,h=img.naturalHeight;
      if(w>MAX){h=Math.round(h*MAX/w);w=MAX;}if(h>MAX){w=Math.round(w*MAX/h);h=MAX;}
      const cvs=document.createElement("canvas");cvs.width=w;cvs.height=h;
      cvs.getContext("2d").drawImage(img,0,0,w,h);
      const data=cvs.toDataURL("image/jpeg",quality).split(",")[1];
      res({data,type:"image/jpeg",blob:base64ToBlob(data,"image/jpeg")});
    };
    img.src=`data:${srcType||"image/jpeg"};base64,${b64}`;
  });
}

function loadJSZip(){
  return new Promise((res,rej)=>{
    if(window.JSZip){res(window.JSZip);return;}
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    s.onload=()=>res(window.JSZip);s.onerror=rej;document.head.appendChild(s);
  });
}

function loadHtml2pdf(){
  return new Promise((res,rej)=>{
    if(window.html2pdf){res(window.html2pdf);return;}
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
    s.onload=()=>res(window.html2pdf);s.onerror=rej;document.head.appendChild(s);
  });
}

/* ── UI Components ── */
function Stars({value,onChange}){
  const [hover,setHover]=useState(0);
  return(<div style={{display:"flex",gap:3}}>{[1,2,3,4,5].map(i=>(
    <span key={i} onClick={()=>onChange&&onChange(i)} onMouseEnter={()=>onChange&&setHover(i)} onMouseLeave={()=>onChange&&setHover(0)}
      style={{fontSize:24,cursor:onChange?"pointer":"default",color:(hover||value)>=i?"#f59e0b":"#d1d5db",lineHeight:1,userSelect:"none"}}>★</span>
  ))}</div>);
}

function CityInput({value,onChange,onCitySelect}){
  const [v,setV]=useState(value||"");
  const listId=useRef("cl_"+Math.random().toString(36).slice(2));
  const prev=useRef(value||"");
  useEffect(()=>{setV(value||"");prev.current=value||"";},[value]);
  function handle(e){
    const val=e.target.value;setV(val);onChange(val);
    const m=CITIES.find(c=>c.toLowerCase()===val.trim().toLowerCase());
    if(m&&m!==prev.current){prev.current=m;onCitySelect(m);}
  }
  return(<div>
    <input value={v} list={listId.current} onChange={handle} onInput={handle} placeholder="הקלד שם עיר..." autoComplete="off"
      style={{width:"100%",boxSizing:"border-box",padding:"9px 11px",fontSize:14,border:"none",outline:"none",background:"transparent",color:"#111",fontFamily:"inherit"}}/>
    <datalist id={listId.current}>{CITIES.map(c=><option key={c} value={c}>{c} – {CPM[c]}</option>)}</datalist>
  </div>);
}

function MultiSelect({options,value=[],onChange}){
  const core=options.slice(0,-1);
  const custom=value.filter(v=>!options.includes(v));
  const hasOther=value.includes("אחר")||custom.length>0;
  const otherText=custom[0]||"";
  const toggle=opt=>{
    if(opt==="אחר"){if(hasOther)onChange(value.filter(v=>core.includes(v)));else onChange([...value.filter(v=>core.includes(v)),"אחר"]);}
    else{if(value.includes(opt))onChange(value.filter(v=>v!==opt));else onChange([...value.filter(v=>v!=="אחר"&&!custom.includes(v)),opt,...(hasOther?[otherText||"אחר"].filter(Boolean):[])]);}
  };
  return(<div style={{padding:"10px"}}>
    <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:hasOther?10:0}}>
      {options.map(opt=>{const sel=opt==="אחר"?hasOther:value.includes(opt);return(
        <button key={opt} onClick={()=>toggle(opt)} style={{padding:"6px 14px",borderRadius:20,border:"1.5px solid",borderColor:sel?"#1d4ed8":"rgba(0,0,0,0.18)",background:sel?"#1d4ed8":"#fff",color:sel?"#fff":"#444",fontSize:13,cursor:"pointer",fontWeight:sel?500:400}}>{opt}</button>
      );})}
    </div>
    {hasOther&&<input value={otherText} onChange={e=>onChange([...value.filter(v=>core.includes(v)),e.target.value].filter(Boolean))} placeholder="הקלד תחום..." style={{width:"100%",boxSizing:"border-box",padding:"7px 10px",fontSize:13,borderRadius:8,border:"1.5px solid rgba(0,0,0,0.18)",outline:"none",background:"#f8f8f8"}}/>}
  </div>);
}

function ProvinceSelect({value,onChange}){
  const isCustom=value&&!PROVINCES.slice(0,-1).includes(value)&&value!=="אחר";
  const selVal=isCustom?"אחר":(value||"");
  return(<div>
    <select value={selVal} onChange={e=>onChange(e.target.value)} style={{width:"100%",boxSizing:"border-box",padding:"9px 11px",fontSize:14,border:"none",outline:"none",background:"transparent",color:selVal?"#111":"#888",fontFamily:"inherit"}}>
      <option value="">-- בחר מחוז --</option>
      {PROVINCES.map(p=><option key={p} value={p}>{p}</option>)}
    </select>
    {selVal==="אחר"&&<input value={isCustom?value:""} onChange={e=>onChange(e.target.value)} placeholder="הקלד מחוז..." style={{width:"100%",boxSizing:"border-box",padding:"8px 11px",fontSize:13,border:"none",borderTop:"1px solid rgba(0,0,0,0.1)",outline:"none",background:"#f8f8f8",color:"#111"}}/>}
  </div>);
}

function MediaButton({label,accept,capture,onFile,style={}}){
  const uid=useRef("f"+Math.random().toString(36).slice(2));
  return(<label htmlFor={uid.current} style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:13,padding:"7px 12px",borderRadius:8,border:"1.5px solid rgba(0,0,0,0.18)",background:"#fff",cursor:"pointer",color:"#333",fontWeight:500,...style}}>
    {label}
    <input id={uid.current} type="file" accept={accept} capture={capture||undefined} style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)onFile(f);e.target.value="";}}/>
  </label>);
}

function Field({label,children,error}){
  return(<div style={{marginBottom:14}}>
    <label style={{fontSize:12,fontWeight:500,color:"#666",display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.04em"}}>{label}</label>
    <div style={{background:"#fff",borderRadius:10,border:"1.5px solid rgba(0,0,0,0.14)",overflow:"hidden"}}>{children}</div>
    {error&&<div style={{fontSize:12,color:"#dc2626",marginTop:4}}>{error}</div>}
  </div>);
}
const IS={width:"100%",boxSizing:"border-box",padding:"9px 11px",fontSize:14,border:"none",outline:"none",background:"transparent",color:"#111",fontFamily:"inherit"};

function Overlay({children,onClose}){
  return(<div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
    <div style={{background:"#f8f7f5",borderRadius:18,border:"1px solid rgba(0,0,0,0.12)",width:"100%",maxWidth:500,maxHeight:"88vh",overflowY:"auto",padding:"1.5rem",position:"relative",boxSizing:"border-box"}}>
      <button onClick={onClose} style={{position:"absolute",top:12,right:14,background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#888",lineHeight:1}}>✕</button>
      {children}
    </div>
  </div>);
}

function ImageEditor({src,type,onSave,onClose}){
  const canvasRef=useRef();const origRef=useRef(null);
  const [brightness,setBrightness]=useState(100);const [contrast,setContrast]=useState(100);const [saturation,setSaturation]=useState(100);
  const [rotate,setRotate]=useState(0);const [removing,setRemoving]=useState(false);const [bgRemoved,setBgRemoved]=useState(false);
  useEffect(()=>{const img=new Image();img.onload=()=>{origRef.current=img;draw(img,0,100,100,100,false);};img.src=`data:${type};base64,${src}`;},[]);
  function draw(img,rot,br,ct,sat,rb){
    if(!img||!canvasRef.current)return;
    const cvs=canvasRef.current,isRot=rot%180!==0;
    cvs.width=isRot?img.naturalHeight:img.naturalWidth;cvs.height=isRot?img.naturalWidth:img.naturalHeight;
    const ctx=cvs.getContext("2d");ctx.clearRect(0,0,cvs.width,cvs.height);ctx.save();
    ctx.translate(cvs.width/2,cvs.height/2);ctx.rotate(rot*Math.PI/180);
    ctx.filter=`brightness(${br}%) contrast(${ct}%) saturate(${sat}%)`;
    ctx.drawImage(img,-img.naturalWidth/2,-img.naturalHeight/2);ctx.restore();
    if(rb)removeBg(cvs);
  }
  const doRedraw=useCallback((rb)=>{if(origRef.current)draw(origRef.current,rotate,brightness,contrast,saturation,rb);},[rotate,brightness,contrast,saturation]);
  useEffect(()=>{doRedraw(bgRemoved);},[rotate,brightness,contrast,saturation]);
  function removeBg(cvs){
    const ctx=cvs.getContext("2d"),id=ctx.getImageData(0,0,cvs.width,cvs.height),d=id.data;
    const co=[[0,0],[cvs.width-1,0],[0,cvs.height-1],[cvs.width-1,cvs.height-1]];
    let rS=0,gS=0,bS=0;co.forEach(([x,y])=>{const i=(y*cvs.width+x)*4;rS+=d[i];gS+=d[i+1];bS+=d[i+2];});
    const br=rS/4,bg=gS/4,bb=bS/4,tol=55;
    for(let i=0;i<d.length;i+=4)if(Math.abs(d[i]-br)<tol&&Math.abs(d[i+1]-bg)<tol&&Math.abs(d[i+2]-bb)<tol)d[i+3]=0;
    ctx.putImageData(id,0,0);
  }
  const slRow=(lbl,val,set)=>(<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
    <span style={{width:70,fontSize:13,color:"#555",flexShrink:0}}>{lbl}</span>
    <input type="range" min={0} max={200} value={val} onChange={e=>set(+e.target.value)} style={{flex:1}}/>
    <span style={{width:36,fontSize:12,color:"#666"}}>{val}%</span>
  </div>);
  return(<Overlay onClose={onClose}>
    <div style={{fontWeight:600,fontSize:16,marginBottom:14}}>עריכת תמונה</div>
    <canvas ref={canvasRef} style={{width:"100%",borderRadius:10,border:"1px solid rgba(0,0,0,0.12)",marginBottom:14,display:"block",background:"repeating-conic-gradient(#ccc 0% 25%,#fff 0% 50%) 0 0/16px 16px"}}/>
    {slRow("בהירות",brightness,setBrightness)}{slRow("ניגודיות",contrast,setContrast)}{slRow("רוויה",saturation,setSaturation)}
    <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
      <span style={{fontSize:13,color:"#555"}}>סיבוב:</span>
      {[0,90,180,270].map(r=>(
        <button key={r} onClick={()=>{setRotate(r);setTimeout(()=>draw(origRef.current,r,brightness,contrast,saturation,bgRemoved),0);}}
          style={{padding:"5px 10px",borderRadius:7,border:"1.5px solid",borderColor:rotate===r?"#3b82f6":"rgba(0,0,0,0.2)",background:rotate===r?"#eff6ff":"transparent",color:rotate===r?"#1d4ed8":"#444",cursor:"pointer",fontSize:13}}>{r}°</button>
      ))}
    </div>
    <button onClick={()=>{setRemoving(true);setTimeout(()=>{doRedraw(true);setBgRemoved(true);setRemoving(false);},50);}} disabled={removing||bgRemoved}
      style={{width:"100%",padding:"9px",borderRadius:9,border:"1.5px solid rgba(0,0,0,0.15)",background:"#fff",cursor:"pointer",fontSize:13,marginBottom:10,color:"#333",fontWeight:500}}>
      {removing?"מסיר רקע...":bgRemoved?"רקע הוסר ✓":"✂ הסרת רקע"}
    </button>
    <div style={{display:"flex",gap:8}}>
      <button onClick={()=>{const cvs=canvasRef.current;onSave(cvs.toDataURL("image/jpeg",0.85).split(",")[1],"image/jpeg");}} style={{flex:1,padding:"9px",borderRadius:9,border:"none",background:"#1d4ed8",cursor:"pointer",fontSize:14,fontWeight:500,color:"#fff"}}>שמור</button>
      <button onClick={onClose} style={{flex:1,padding:"9px",borderRadius:9,border:"1.5px solid rgba(0,0,0,0.15)",background:"transparent",cursor:"pointer",fontSize:14,color:"#555"}}>ביטול</button>
    </div>
  </Overlay>);
}

function ImageStrip({images=[],onAdd,onEdit,onDelete}){
  return(<div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
    {images.map((img,i)=>(
      <div key={i} style={{position:"relative",flexShrink:0}}>
        <img src={img.url||`data:${img.type};base64,${img.data}`} style={{width:72,height:72,objectFit:"cover",borderRadius:8,border:"1px solid rgba(0,0,0,0.12)",display:"block"}}/>
        <div style={{position:"absolute",bottom:2,right:2,display:"flex",gap:2}}>
          {onEdit&&<button onClick={()=>onEdit(i)} style={{background:"rgba(0,0,0,0.65)",border:"none",borderRadius:4,color:"#fff",fontSize:10,padding:"2px 4px",cursor:"pointer"}}>✏</button>}
          <button onClick={()=>onDelete(i)} style={{background:"rgba(220,38,38,0.8)",border:"none",borderRadius:4,color:"#fff",fontSize:10,padding:"2px 4px",cursor:"pointer"}}>✕</button>
        </div>
      </div>
    ))}
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      <MediaButton label="📁 קובץ" accept="image/*" onFile={async f=>{const b64=await fileToBase64(f);onAdd({data:b64,type:f.type});}} style={{fontSize:12,padding:"5px 10px"}}/>
      <MediaButton label="📷 צלם" accept="image/*" capture="environment" onFile={async f=>{const b64=await fileToBase64(f);onAdd({data:b64,type:f.type});}} style={{fontSize:12,padding:"5px 10px"}}/>
    </div>
  </div>);
}

function Section({title,icon,children,accent}){
  return(<div style={{background:"#fff",borderRadius:14,border:"1px solid rgba(0,0,0,0.1)",marginBottom:12,overflow:"hidden"}}>
    <div style={{background:accent,padding:"10px 16px",display:"flex",alignItems:"center",gap:8}}>
      <span style={{fontSize:16}}>{icon}</span><span style={{fontWeight:600,fontSize:14,color:"#fff"}}>{title}</span>
    </div>
    <div style={{padding:"14px 16px"}}>{children}</div>
  </div>);
}
function ActBtn({icon,label,onClick,color,bg,disabled}){
  return(<button onClick={onClick} disabled={disabled} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"10px 14px",borderRadius:10,border:"1.5px solid rgba(0,0,0,0.14)",background:disabled?"#f3f4f6":bg||"#fff",cursor:disabled?"not-allowed":"pointer",color:disabled?"#aaa":color||"#333",fontWeight:500,fontSize:12,minWidth:72}}>
  <span style={{fontSize:20}}>{icon}</span><span>{label}</span>
</button>);
}

/* ── Login ── */
function LoginScreen({onLogin}){
  const [name,setName]=useState("");
  const [key,setKey]=useState("");
  const [showKey,setShowKey]=useState(false);
  const valid=name.trim()&&key.trim().length>10;
  return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f1f5f9",fontFamily:"sans-serif"}}>
    <div style={{background:"#fff",borderRadius:18,border:"1px solid rgba(0,0,0,0.1)",padding:"2rem",width:320,direction:"rtl"}}>
      <div style={{textAlign:"center",marginBottom:20}}>
        <div style={{fontSize:36,marginBottom:6}}>🏭</div>
        <div style={{fontSize:20,fontWeight:700,marginBottom:4}}>ניהול ספקים</div>
        <div style={{fontSize:13,color:"#888"}}>הזן פרטים להמשך</div>
      </div>
      <label style={{fontSize:12,fontWeight:500,color:"#666",display:"block",marginBottom:5}}>שם משתמש</label>
      <input value={name} onChange={e=>setName(e.target.value)} placeholder="השם שלך..."
        style={{width:"100%",boxSizing:"border-box",padding:"9px 12px",fontSize:14,borderRadius:9,border:"1.5px solid rgba(0,0,0,0.18)",outline:"none",marginBottom:14,textAlign:"right"}}/>
      <label style={{fontSize:12,fontWeight:500,color:"#666",display:"block",marginBottom:5}}>
        Gemini API Key
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{fontSize:11,color:"#2563eb",marginRight:6,fontWeight:400}}>קבל key חינמי ←</a>
      </label>
      <div style={{position:"relative",marginBottom:16}}>
        <input value={key} onChange={e=>setKey(e.target.value)} type={showKey?"text":"password"} placeholder="AIza..."
          style={{width:"100%",boxSizing:"border-box",padding:"9px 12px",paddingLeft:36,fontSize:13,borderRadius:9,border:"1.5px solid rgba(0,0,0,0.18)",outline:"none",textAlign:"left",direction:"ltr"}}/>
        <button onClick={()=>setShowKey(v=>!v)} style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:16,color:"#888"}}>{showKey?"🙈":"👁"}</button>
      </div>
      <div style={{fontSize:11,color:"#aaa",marginBottom:16}}>ה-key נשמר רק במכשיר שלך</div>
      <button onClick={()=>valid&&onLogin(name.trim(),key.trim())} disabled={!valid}
        style={{width:"100%",padding:"11px",borderRadius:10,border:"none",background:valid?"#1d4ed8":"#93c5fd",cursor:valid?"pointer":"default",fontSize:15,fontWeight:600,color:"#fff"}}>כניסה</button>
    </div>
  </div>);
}

/* ══ Main App ══ */
const EMPTY_FORM={name:"",contact:"",phone:"",email:"",city:"",province:"",fields:[],description:"",rating:0,cardImageUrl:"",source:"",date:todayStr()};
const EMPTY_PROD={description:"",images:[],rating:0};

export default function App(){
  const [user,setUser]=useState(null);
  const [view,setView]=useState("list");
  const [suppliers,setSuppliers]=useState([]);
  const [selSup,setSelSup]=useState(null);
  const [form,setForm]=useState(EMPTY_FORM);
  const [products,setProducts]=useState([]);
  const [prodModal,setProdModal]=useState(false);
  const [editProd,setEditProd]=useState(null);
  const [prodForm,setProdForm]=useState(EMPTY_PROD);
  const [extracting,setExtracting]=useState(false);
  const [saving,setSaving]=useState(false);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState("");
  const [filterProvince,setFilterProvince]=useState("");
  const [filterField,setFilterField]=useState("");
  const [errors,setErrors]=useState({});
  const [editImgCtx,setEditImgCtx]=useState(null);
  const [defaultSource,setDefaultSource]=useState("");
  const [msg,setMsg]=useState("");
  const [msgOk,setMsgOk]=useState(true);
  const [exporting,setExporting]=useState(false);
  const importSupRef=useRef();
  const importImgRef=useRef();

  const showMsg=(text,ok=true)=>{setMsg(text);setMsgOk(ok);setTimeout(()=>setMsg(""),5000);};
  const userName=user?.name||"user";

  const loadSuppliers=useCallback(async()=>{
    try{
      const data=await sb.select("suppliers","select=*");
      setSuppliers(data||[]);
    }catch(e){showMsg("שגיאה בטעינה: "+e.message,false);}
    setLoading(false);
  },[]);

  useEffect(()=>{
    const saved=localStorage.getItem("supplier_user");
    if(saved)try{setUser(JSON.parse(saved));}catch(_){}
    // load default source for today
    const dk="defaultSource_"+todayStr();
    sb.getMeta(dk).then(v=>{if(v)setDefaultSource(v);}).catch(()=>{});
    loadSuppliers();
  },[loadSuppliers]);

  async function handleLogin(name,key){
    const u={name,key};setUser(u);
    localStorage.setItem("supplier_user",JSON.stringify(u));
  }
  function handleLogout(){setUser(null);localStorage.removeItem("supplier_user");}

  const loadProducts=async sid=>{
    if(!sid)return;
    const data=await sb.select("products",`supplier_id=eq.${sid}&select=*`);
    setProducts(data||[]);
  };
  const sf=(k,v)=>setForm(f=>({...f,[k]:v}));

  const saveDefaultSource=async val=>{
    setDefaultSource(val);
    await sb.upsertMeta("defaultSource_"+todayStr(),val).catch(()=>{});
  };

  /* ── Upload image to Supabase Storage ── */
  async function uploadImg(b64, type, path){
    const compressed=await compressImage(b64,type);
    const url=await sb.uploadFile(path,compressed.blob,"image/jpeg");
    return url;
  }

  /* ── Card file handler ── */
  const handleCardFile=async file=>{
    setExtracting(true);
    try{
      const b64=await fileToBase64(file),mt=file.type;
      // preview locally first
      setForm(f=>({...f,_cardPreview:b64,_cardPreviewType:mt}));
      if(!user?.key){showMsg("אין Gemini API key",false);setExtracting(false);return;}
      const txt=await callGemini(
        "Business card image. Extract: name (company/supplier), contact (person name), email, phone, city (English city name only). Return ONLY valid JSON: {name,contact,email,phone,city}. No markdown.",
        b64,mt,user.key
      );
      try{
        const p=JSON.parse(txt.replace(/```json|```/g,"").trim());
        const rawCity=(p.city||"").trim();
        const matched=CITIES.find(c=>c.toLowerCase()===rawCity.toLowerCase())||rawCity;
        setForm(f=>({...f,name:p.name||f.name,contact:p.contact||f.contact,phone:p.phone||f.phone,email:p.email||f.email,city:matched||f.city,province:getProvince(matched)||f.province}));
        showMsg("פרטים חולצו ✓",true);
      }catch(_){showMsg("לא הצלחתי לפרסר תשובה",false);}
    }catch(e){showMsg("שגיאה: "+e.message,false);}
    setExtracting(false);
  };

  const validate=()=>{const e={};if(!form.name.trim())e.name="שם ספק חובה";setErrors(e);return!Object.keys(e).length;};

  const handleSave=async()=>{
    if(!validate())return;
    setSaving(true);const now=nowISO();
    try{
      if(form.source)await saveDefaultSource(form.source);

      // Upload card image if new preview exists
      let cardUrl=form.cardImageUrl||"";
      if(form._cardPreview){
        const supId=selSup?.id||"new";
        const path=`cards/${supId}_${Date.now()}.jpg`;
        cardUrl=await uploadImg(form._cardPreview,form._cardPreviewType||"image/jpeg",path);
      }

      const payload={
        name:form.name,contact:form.contact,phone:form.phone,email:form.email,
        city:form.city,province:form.province,fields:form.fields,
        description:form.description,rating:form.rating,source:form.source,
        date:form.date||todayStr(),card_image_url:cardUrl,
        updated_at:now,updated_by:userName
      };

      if(selSup){
        await sb.update("suppliers",selSup.id,payload);
        setSelSup(s=>({...s,...payload,id:selSup.id}));
      } else {
        const created=await sb.insert("suppliers",{...payload,created_at:now,created_by:userName});
        setSelSup(created);
        await loadProducts(created.id);
      }
      await loadSuppliers();
      if(selSup)await loadProducts(selSup.id);
      setForm(f=>({...f,_cardPreview:null,_cardPreviewType:null,cardImageUrl:cardUrl}));
      showMsg("נשמר ✓",true);
    }catch(e){showMsg("שגיאה: "+e.message,false);}
    setSaving(false);
  };

  const openEdit=async s=>{
    setSelSup(s);
    setForm({name:s.name||"",contact:s.contact||"",phone:s.phone||"",email:s.email||"",
      city:s.city||"",province:s.province||"",fields:s.fields||[],
      description:s.description||"",rating:s.rating||0,
      cardImageUrl:s.card_image_url||"",_cardPreview:null,
      source:s.source||"",date:s.date||todayStr()});
    setErrors({});await loadProducts(s.id);setView("form");
  };

  const handleDelSup=async id=>{
    if(!window.confirm("למחוק ספק זה?"))return;
    await sb.delete("suppliers",id);await loadSuppliers();
    if(selSup?.id===id){setView("list");setSelSup(null);}
  };

  const openProdModal=p=>{
    setEditProd(p||null);
    setProdForm(p?{description:p.description||"",images:p.images||[],rating:p.rating||0}:{...EMPTY_PROD,images:[]});
    setProdModal(true);
  };

  const handleSaveProd=async()=>{
    const sid=selSup?.id;if(!sid)return;
    const now=nowISO();
    // upload new images (those with .data but no .url)
    const uploadedImages=[];
    for(let i=0;i<prodForm.images.length;i++){
      const img=prodForm.images[i];
      if(img.url){uploadedImages.push(img);continue;}
      const path=`products/${sid}_${editProd?.id||"new"}_${i}_${Date.now()}.jpg`;
      const url=await uploadImg(img.data,img.type,path);
      uploadedImages.push({url,path});
    }
    const payload={description:prodForm.description,rating:prodForm.rating,images:uploadedImages,supplier_id:sid,updated_at:now,updated_by:userName};
    if(editProd)await sb.update("products",editProd.id,payload);
    else await sb.insert("products",{...payload,created_at:now,created_by:userName});
    await loadProducts(sid);setProdModal(false);
  };

  const handleDelProd=async id=>{
    if(!window.confirm("למחוק?"))return;
    await sb.delete("products",id);await loadProducts(selSup.id);
  };

  /* ── Build CSV ── */
  function buildCSV(allS,allP){
    let csv="\uFEFFאינדקס,שם ספק,מקור,תאריך,איש קשר,טלפון,אימייל,עיר,מחוז,תחום עיסוק,תיאור,דירוג,נוצר,נוצר ע\"י,עודכן,עודכן ע\"י\n";
    allS.forEach(s=>{csv+=[s.id,`"${(s.name||"").replace(/"/g,'""')}"`,`"${(s.source||"").replace(/"/g,'""')}"`,s.date||"",`"${(s.contact||"").replace(/"/g,'""')}"`,s.phone||"",s.email||"",s.city||"",s.province||"",`"${(s.fields||[]).join(", ")}"`,`"${(s.description||"").replace(/"/g,'""')}"`,s.rating||0,s.created_at||"",s.created_by||"",s.updated_at||"",s.updated_by||""].join(",")+"\n";});
    csv+="\n\nמוצרים\nאינדקס,ספק ID,תיאור,דירוג,נוצר,נוצר ע\"י,עודכן,עודכן ע\"י\n";
    allP.forEach(p=>{csv+=[p.id,p.supplier_id,`"${(p.description||"").replace(/"/g,'""')}"`,p.rating||0,p.created_at||"",p.created_by||"",p.updated_at||"",p.updated_by||""].join(",")+"\n";});
    return csv;
  }

  /* ── Export ZIP (by province/supplier folders) ── */
  const downloadZip=async()=>{
    setExporting(true);showMsg("מכין ZIP...",true);
    try{
      const JSZip=await loadJSZip();
      const zip=new JSZip();
      const label=dtLabel();
      const allS=await sb.select("suppliers","select=*");
      const allP=await sb.select("products","select=*");
      // CSV at root
      zip.file(`${label}/suppliers_${label}.csv`,buildCSV(allS,allP));
      // per province/supplier folders
      for(const s of allS){
        const prov=sanitize(s.province||"no_province");
        const supName=sanitize(s.name||`supplier_${s.id}`);
        const folder=`${label}/${prov}/${supName}/`;
        // card image
        if(s.card_image_url){
          try{
            const r=await fetch(s.card_image_url);const ab=await r.arrayBuffer();
            zip.file(`${folder}${s.id}.card.jpg`,ab);
          }catch(_){}
        }
        // products
        const prods=allP.filter(p=>p.supplier_id===s.id);
        for(const p of prods){
          for(let i=0;i<(p.images||[]).length;i++){
            const img=p.images[i];
            if(img.url){
              try{const r=await fetch(img.url);const ab=await r.arrayBuffer();zip.file(`${folder}${s.id}.${p.id}.${i+1}.jpg`,ab);}catch(_){}
            }
          }
        }
      }
      const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}});
      const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`suppliers_${label}.zip`;a.click();
      showMsg(`✓ הורד: suppliers_${label}.zip`,true);
    }catch(e){showMsg("שגיאה: "+e.message,false);}
    setExporting(false);
  };

  /* ── Export PDF (html2pdf – Hebrew support) ── */
  const downloadPDF = async () => {
    setExporting(true); showMsg("מייצר PDF...", true);
    try {
      const html2pdf = await loadHtml2pdf();
      const allS = await sb.select("suppliers", "select=*");
      const allP = await sb.select("products", "select=*");

      /* convert remote image URL → base64 data-url for embedding */
      async function imgToDataUrl(url) {
        try {
          const r = await fetch(url);
          const blob = await r.blob();
          return await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
        } catch { return null; }
      }

      /* build one big HTML string */
      let html = `
        <html><head><meta charset="utf-8">
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; direction: rtl; margin: 0; padding: 0; color: #111; font-size: 12px; }
          .page-break { page-break-before: always; }
          .sup-header { background: #1d4ed8; color: #fff; padding: 10px 14px; border-radius: 8px 8px 0 0; font-size: 15px; font-weight: bold; margin-bottom: 0; }
          .sup-box { border: 1px solid #d1d5db; border-radius: 8px; margin-bottom: 24px; overflow: hidden; }
          .sup-body { padding: 14px; }
          .sup-top { display: flex; gap: 16px; margin-bottom: 12px; }
          .card-img { width: 110px; height: 74px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e7eb; flex-shrink: 0; }
          .info-grid { display: grid; grid-template-columns: 90px 1fr; gap: 4px 8px; font-size: 11px; flex: 1; }
          .info-label { color: #6b7280; font-weight: bold; }
          .info-val { color: #111; }
          .stars { color: #f59e0b; font-size: 14px; }
          .tags { display: flex; flex-wrap: wrap; gap: 4px; }
          .tag { background: #eff6ff; color: #1d4ed8; font-size: 10px; padding: 2px 8px; border-radius: 12px; }
          .ts { font-size: 9px; color: #9ca3af; margin-top: 6px; }
          .section-title { font-size: 13px; font-weight: bold; color: #1d4ed8; border-bottom: 2px solid #1d4ed8; padding-bottom: 4px; margin: 14px 0 10px; }
          .prod-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
          .prod-card { border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: #fafaf9; }
          .prod-imgs { display: flex; gap: 4px; padding: 8px; background: #f3f4f6; flex-wrap: wrap; }
          .prod-img { width: 72px; height: 72px; object-fit: cover; border-radius: 4px; border: 1px solid #e5e7eb; }
          .prod-body { padding: 8px 10px; }
          .prod-desc { font-size: 11px; color: #374151; margin-bottom: 4px; min-height: 20px; }
          .prod-id { font-size: 9px; color: #9ca3af; }
        </style></head><body>`;

      for (let si = 0; si < allS.length; si++) {
        const s = allS[si];
        if (si > 0) html += `<div class="page-break"></div>`;
        const cardDataUrl = s.card_image_url ? await imgToDataUrl(s.card_image_url) : null;
        const prods = allP.filter(p => p.supplier_id === s.id);
        const fields = (s.fields || []).filter(Boolean);

        html += `<div class="sup-box">
          <div class="sup-header">#${s.id} &nbsp; ${s.name || ""}</div>
          <div class="sup-body">
            <div class="sup-top">
              ${cardDataUrl ? `<img class="card-img" src="${cardDataUrl}"/>` : ""}
              <div class="info-grid">
                ${s.source    ? `<span class="info-label">מקור:</span><span class="info-val">${s.source}</span>` : ""}
                ${s.date      ? `<span class="info-label">תאריך:</span><span class="info-val">${s.date}</span>` : ""}
                ${s.contact   ? `<span class="info-label">איש קשר:</span><span class="info-val">${s.contact}</span>` : ""}
                ${s.phone     ? `<span class="info-label">טלפון:</span><span class="info-val">${s.phone}</span>` : ""}
                ${s.email     ? `<span class="info-label">אימייל:</span><span class="info-val">${s.email}</span>` : ""}
                ${s.city      ? `<span class="info-label">עיר:</span><span class="info-val">${s.city}</span>` : ""}
                ${s.province  ? `<span class="info-label">מחוז:</span><span class="info-val">${s.province}</span>` : ""}
                ${s.rating    ? `<span class="info-label">דירוג:</span><span class="stars">${"★".repeat(s.rating)}${"☆".repeat(5-s.rating)}</span>` : ""}
              </div>
            </div>
            ${fields.length ? `<div class="tags">${fields.map(f=>`<span class="tag">${f}</span>`).join("")}</div>` : ""}
            ${s.description ? `<div style="margin-top:8px;font-size:11px;color:#374151;">${s.description}</div>` : ""}
            <div class="ts">
              ${s.created_at ? `נוצר ע"י ${s.created_by||""} · ${new Date(s.created_at).toLocaleString("he-IL")}` : ""}
              ${s.updated_at ? ` &nbsp;|&nbsp; עודכן ע"י ${s.updated_by||""} · ${new Date(s.updated_at).toLocaleString("he-IL")}` : ""}
            </div>`;

        if (prods.length > 0) {
          html += `<div class="section-title">מוצרים (${prods.length})</div><div class="prod-grid">`;
          for (const p of prods) {
            const imgs = p.images || [];
            const imgDataUrls = [];
            for (const img of imgs.slice(0, 4)) {
              if (img.url) { const d = await imgToDataUrl(img.url); if (d) imgDataUrls.push(d); }
            }
            html += `<div class="prod-card">
              ${imgDataUrls.length ? `<div class="prod-imgs">${imgDataUrls.map(d=>`<img class="prod-img" src="${d}"/>`).join("")}</div>` : ""}
              <div class="prod-body">
                <div class="prod-id">#${p.id} · ${imgs.length} תמונות · ${"★".repeat(p.rating||0)}</div>
                <div class="prod-desc">${p.description||"ללא תיאור"}</div>
                <div class="ts">${p.updated_at?`עודכן ע"י ${p.updated_by||""} · ${new Date(p.updated_at).toLocaleString("he-IL")}`:""}</div>
              </div>
            </div>`;
          }
          html += `</div>`;
        }
        html += `</div></div>`;
      }
      html += `</body></html>`;

      /* render to PDF */
      const el = document.createElement("div");
      el.innerHTML = html;
      el.style.cssText = "position:fixed;left:-9999px;top:0;width:210mm;";
      document.body.appendChild(el);

      await html2pdf().set({
        margin: [10, 10, 10, 10],
        filename: `suppliers_${dtLabel()}.pdf`,
        image: { type: "jpeg", quality: 0.9 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css","legacy"] }
      }).from(el).save();

      document.body.removeChild(el);
      showMsg("✓ PDF הורד", true);
    } catch(e) { showMsg("שגיאה PDF: " + e.message, false); }
    setExporting(false);
  };

  /* ── Import CSV ── */
  const importCSV=async file=>{
    showMsg("מייבא...",true);
    try{
      const text=await file.text();const lines=text.split("\n").filter(l=>l.trim());
      let start=0;for(let i=0;i<lines.length;i++){if(lines[i].includes("אינדקס")||lines[i].toLowerCase().includes("name")){start=i+1;break;}}
      let count=0;const now=nowISO();
      for(let i=start;i<lines.length;i++){
        const cols=lines[i].match(/(".*?"|[^,]+)(?=,|$)/g)||[];
        const c=cols.map(x=>x.replace(/^"|"$/g,"").trim());
        if(c.length<2||!c[1])continue;
        await sb.insert("suppliers",{name:c[1],source:c[2]||"",date:c[3]||todayStr(),contact:c[4]||"",phone:c[5]||"",email:c[6]||"",city:c[7]||"",province:c[8]||"",fields:(c[9]||"").split(",").map(s=>s.trim()).filter(Boolean),description:c[10]||"",rating:parseInt(c[11])||0,created_at:now,created_by:"import",updated_at:now,updated_by:"import"});
        count++;
      }
      await loadSuppliers();showMsg(`יובאו ${count} ספקים ✓`,true);
    }catch(e){showMsg("שגיאה: "+e.message,false);}
  };

  const filtered=suppliers.filter(s=>{
    const q=search.toLowerCase();
    return(!q||s.name?.toLowerCase().includes(q)||s.contact?.toLowerCase().includes(q))&&
      (!filterProvince||s.province===filterProvince)&&
      (!filterField||(s.fields||[]).includes(filterField));
  });

  const allUsedProvinces=[...new Set(suppliers.map(s=>s.province).filter(Boolean))].sort();
  const allUsedFields=[...new Set(suppliers.flatMap(s=>s.fields||[]))].sort();
  const CS={background:"#fff",borderRadius:14,border:"1px solid rgba(0,0,0,0.1)",padding:"1.25rem",marginBottom:14};
  const BP={padding:"10px",borderRadius:9,border:"none",background:"#1d4ed8",cursor:"pointer",fontSize:14,fontWeight:500,color:"#fff"};

  if(!user)return<LoginScreen onLogin={handleLogin}/>;
  if(loading)return<div style={{padding:"2rem",textAlign:"center",color:"#888"}}>טוען נתונים...</div>;

  return(<div dir="rtl" style={{fontFamily:"var(--font-sans)",padding:"0.75rem",maxWidth:560,margin:"0 auto",background:"var(--color-background-tertiary)",minHeight:"100vh"}}>
    <input ref={importSupRef} type="file" accept=".csv" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)importCSV(f);e.target.value="";}}/>
    <input ref={importImgRef} type="file" accept="image/*" multiple style={{display:"none"}}/>

    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,paddingTop:4}}>
      {view!=="list"
        ?<button onClick={()=>{setView("list");setSelSup(null);}} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#555",padding:0,fontWeight:500}}>← רשימה</button>
        :<span style={{fontSize:18,fontWeight:700}}>ניהול ספקים</span>}
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:12,color:"#666",background:"#f1f5f9",padding:"4px 10px",borderRadius:20}}>👤 {userName}</span>
        {view==="list"&&<button onClick={()=>{setForm({...EMPTY_FORM,source:defaultSource,date:todayStr()});setSelSup(null);setErrors({});setView("form");}} style={{...BP,padding:"7px 14px",fontSize:13}}>+ ספק חדש</button>}
        <button onClick={handleLogout} style={{fontSize:12,padding:"4px 10px",borderRadius:20,border:"1px solid rgba(0,0,0,0.15)",background:"#fff",cursor:"pointer",color:"#888"}}>יציאה</button>
      </div>
    </div>

    {msg&&<div style={{borderRadius:8,padding:"8px 14px",marginBottom:10,fontSize:13,fontWeight:500,background:msgOk?"#f0fdf4":"#fef2f2",border:`1px solid ${msgOk?"#bbf7d0":"#fecaca"}`,color:msgOk?"#065f46":"#dc2626"}}>{msg}</div>}

    {view==="list"&&<>
      <Section title="ייצוא נתונים" icon="📤" accent="#0f766e">
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <ActBtn icon="📦" label="ZIP" bg="#f0fdf4" color="#065f46" onClick={downloadZip} disabled={exporting}/>
          <ActBtn icon="📄" label="PDF" bg="#fff7ed" color="#c2410c" onClick={downloadPDF} disabled={exporting}/>
        </div>
        <div style={{fontSize:11,color:"#888",marginTop:8}}>ZIP: תיקיות לפי מחוז/ספק · PDF: כל הספקים עם תמונות</div>
      </Section>

      <Section title="ייבוא נתונים" icon="📥" accent="#7c3aed">
        <div style={{display:"flex",gap:10}}>
          <ActBtn icon="📊" label="ייבוא CSV" bg="#faf5ff" color="#5b21b6" onClick={()=>importSupRef.current.click()}/>
        </div>
        <div style={{fontSize:11,color:"#888",marginTop:8}}>ייבוא ספקים מ-CSV</div>
      </Section>

      <div style={{...CS,padding:"12px 14px",marginBottom:12}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="חיפוש לפי שם..." style={{width:"100%",border:"none",outline:"none",fontSize:14,background:"transparent",marginBottom:10,display:"block"}}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <select value={filterProvince} onChange={e=>setFilterProvince(e.target.value)} style={{fontSize:13,padding:"7px 8px",borderRadius:8,border:"1.5px solid rgba(0,0,0,0.14)",background:"#f8f7f5",color:"#333",outline:"none"}}>
            <option value="">כל המחוזות</option>{allUsedProvinces.map(p=><option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filterField} onChange={e=>setFilterField(e.target.value)} style={{fontSize:13,padding:"7px 8px",borderRadius:8,border:"1.5px solid rgba(0,0,0,0.14)",background:"#f8f7f5",color:"#333",outline:"none"}}>
            <option value="">כל תחומי העיסוק</option>{(allUsedFields.length?allUsedFields:FIELDS_OF_WORK).map(f=><option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        {(search||filterProvince||filterField)&&<button onClick={()=>{setSearch("");setFilterProvince("");setFilterField("");}} style={{marginTop:8,fontSize:12,color:"#2563eb",background:"none",border:"none",cursor:"pointer",padding:0,fontWeight:500}}>✕ נקה סינון</button>}
      </div>

      <div style={{fontSize:12,color:"#888",marginBottom:8}}>{filtered.length} ספקים</div>
      {filtered.length===0&&<div style={{textAlign:"center",color:"#888",padding:"2.5rem",background:"#fff",borderRadius:14}}>לא נמצאו ספקים</div>}
      {filtered.map(s=>(
        <div key={s.id} style={{...CS,display:"flex",alignItems:"center",gap:12,padding:"12px 14px"}}>
          {s.card_image_url
            ?<img src={s.card_image_url} style={{width:46,height:46,borderRadius:9,objectFit:"cover",flexShrink:0,border:"1px solid rgba(0,0,0,0.1)"}}/>
            :<div style={{width:46,height:46,borderRadius:9,background:"#dbeafe",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:600,color:"#1d4ed8",flexShrink:0}}>{(s.name||"?")[0]}</div>}
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:600,fontSize:15,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.name}</div>
            <div style={{fontSize:12,color:"#888",marginBottom:2}}>{[s.contact,s.city,s.province].filter(Boolean).join(" · ")}</div>
            {(s.fields||[]).filter(Boolean).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:3,marginBottom:2}}>{s.fields.filter(Boolean).map((f,i)=><span key={i} style={{fontSize:11,padding:"2px 7px",borderRadius:20,background:"#eff6ff",color:"#1d4ed8",fontWeight:500}}>{f}</span>)}</div>}
            <Stars value={s.rating}/>
            {s.updated_at&&<div style={{fontSize:10,color:"#bbb",marginTop:1}}>עודכן ע"י {s.updated_by} · {new Date(s.updated_at).toLocaleString("he-IL")}</div>}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0}}>
            <button onClick={()=>openEdit(s)} style={{fontSize:12,padding:"5px 12px",borderRadius:7,border:"1.5px solid rgba(0,0,0,0.15)",background:"#fff",cursor:"pointer",color:"#333",fontWeight:500}}>עריכה</button>
            <button onClick={()=>handleDelSup(s.id)} style={{fontSize:12,padding:"5px 12px",borderRadius:7,border:"1.5px solid rgba(220,38,38,0.3)",background:"#fff",cursor:"pointer",color:"#dc2626",fontWeight:500}}>מחק</button>
          </div>
        </div>
      ))}
    </>}

    {view==="form"&&<>
      <div style={CS}>
        <div style={{fontSize:16,fontWeight:600,marginBottom:16,paddingBottom:12,borderBottom:"1px solid rgba(0,0,0,0.08)"}}>{selSup?"עריכת ספק":"ספק חדש"}</div>

        {/* Card image */}
        <div style={{marginBottom:18}}>
          <label style={{fontSize:12,fontWeight:500,color:"#666",display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.04em"}}>כרטיס ביקור</label>
          <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",padding:"12px",background:"#f8f7f5",borderRadius:10,border:"1.5px dashed rgba(0,0,0,0.15)"}}>
            {(form._cardPreview||form.cardImageUrl)&&(
              <div style={{position:"relative",flexShrink:0}}>
                <img src={form._cardPreview?`data:${form._cardPreviewType};base64,${form._cardPreview}`:form.cardImageUrl}
                  style={{width:90,height:60,objectFit:"cover",borderRadius:8,border:"1px solid rgba(0,0,0,0.1)",display:"block"}}/>
                {form._cardPreview&&<button onClick={()=>setEditImgCtx({target:"card"})} style={{position:"absolute",bottom:3,right:3,background:"rgba(0,0,0,0.65)",border:"none",borderRadius:5,color:"#fff",fontSize:10,padding:"2px 5px",cursor:"pointer"}}>✏</button>}
              </div>
            )}
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <MediaButton label={extracting?"מחלץ...":"📁 העלאת כרטיס"} accept="image/*" onFile={handleCardFile}/>
              <MediaButton label="📷 צלם" accept="image/*" capture="environment" onFile={handleCardFile}/>
              {extracting&&<span style={{fontSize:12,color:"#2563eb",fontWeight:500}}>Gemini מחלץ...</span>}
            </div>
          </div>
        </div>

        <Field label="מקור ספק"><input style={IS} value={form.source} onChange={e=>sf("source",e.target.value)} onBlur={e=>{if(e.target.value)saveDefaultSource(e.target.value);}} placeholder="מאיפה הגיע הספק?"/></Field>
        <Field label="תאריך"><input type="date" style={IS} value={form.date} onChange={e=>sf("date",e.target.value)}/></Field>
        <Field label="שם ספק *" error={errors.name}><input style={IS} value={form.name} onChange={e=>sf("name",e.target.value)} placeholder="שם החברה"/></Field>
        <Field label="שם איש קשר"><input style={IS} value={form.contact} onChange={e=>sf("contact",e.target.value)} placeholder="שם מלא"/></Field>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Field label="טלפון"><input style={IS} value={form.phone||""} onChange={e=>sf("phone",e.target.value)} type="tel" placeholder="+86..."/></Field>
          <Field label="אימייל"><input style={IS} value={form.email} onChange={e=>sf("email",e.target.value)} type="email" placeholder="email@..."/></Field>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Field label="עיר"><CityInput value={form.city} onChange={v=>sf("city",v)} onCitySelect={c=>{sf("city",c);const p=getProvince(c);if(p)sf("province",p);}}/></Field>
          <Field label="מחוז"><ProvinceSelect value={form.province} onChange={v=>sf("province",v)}/></Field>
        </div>
        <Field label="תחום עיסוק"><MultiSelect options={FIELDS_OF_WORK} value={form.fields||[]} onChange={v=>sf("fields",v)}/></Field>
        <Field label="תיאור"><textarea style={{...IS,minHeight:80,resize:"vertical"}} value={form.description} onChange={e=>sf("description",e.target.value)} placeholder="תיאור כללי"/></Field>
        <div style={{marginBottom:18}}>
          <label style={{fontSize:12,fontWeight:500,color:"#666",display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.04em"}}>דירוג ספק</label>
          <Stars value={form.rating} onChange={v=>sf("rating",v)}/>
        </div>
        {selSup&&<div style={{fontSize:11,color:"#bbb",marginBottom:12}}>
          {selSup.created_at&&<span>נוצר ע"י {selSup.created_by} · {new Date(selSup.created_at).toLocaleString("he-IL")}  </span>}
          {selSup.updated_at&&<span>עודכן ע"י {selSup.updated_by} · {new Date(selSup.updated_at).toLocaleString("he-IL")}</span>}
        </div>}
        <button onClick={handleSave} disabled={saving} style={{...BP,width:"100%"}}>{saving?"שומר...":"שמור ספק"}</button>
      </div>

      {selSup&&<div style={CS}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,paddingBottom:12,borderBottom:"1px solid rgba(0,0,0,0.08)"}}>
          <span style={{fontSize:16,fontWeight:600}}>מוצרים</span>
          <button onClick={()=>openProdModal()} style={{...BP,fontSize:13,padding:"7px 14px"}}>+ הוסף</button>
        </div>
        {products.length===0&&<div style={{textAlign:"center",color:"#aaa",fontSize:14,padding:"1.5rem",background:"#f8f7f5",borderRadius:10}}>אין מוצרים עדיין</div>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {products.map(p=>{const fi=(p.images||[])[0];return(
            <div key={p.id} style={{border:"1px solid rgba(0,0,0,0.1)",borderRadius:12,overflow:"hidden",background:"#fafaf9"}}>
              {fi?.url?<img src={fi.url} style={{width:"100%",height:110,objectFit:"cover",display:"block"}}/>
                :<div style={{height:70,background:"#f0eeec",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#bbb"}}>אין תמונה</div>}
              <div style={{padding:"10px"}}>
                <div style={{fontSize:11,color:"#aaa",marginBottom:2}}>#{p.id} · {p.images?.length||0} תמונות</div>
                <div style={{fontSize:13,marginBottom:5,minHeight:26,lineHeight:1.4}}>{p.description||"ללא תיאור"}</div>
                <div style={{marginBottom:5,transform:"scale(0.82)",transformOrigin:"right"}}><Stars value={p.rating||0}/></div>
                {p.updated_at&&<div style={{fontSize:10,color:"#ccc",marginBottom:5}}>ע"י {p.updated_by} · {new Date(p.updated_at).toLocaleString("he-IL")}</div>}
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>openProdModal(p)} style={{fontSize:12,padding:"5px 0",borderRadius:7,border:"1.5px solid rgba(0,0,0,0.15)",background:"#fff",cursor:"pointer",color:"#333",fontWeight:500,flex:1}}>ערוך</button>
                  <button onClick={()=>handleDelProd(p.id)} style={{fontSize:12,padding:"5px 0",borderRadius:7,border:"1.5px solid rgba(220,38,38,0.25)",background:"#fff",cursor:"pointer",color:"#dc2626",fontWeight:500,flex:1}}>מחק</button>
                </div>
              </div>
            </div>
          );})}
        </div>
      </div>}
    </>}

    {prodModal&&<Overlay onClose={()=>setProdModal(false)}>
      <div style={{fontWeight:600,fontSize:16,marginBottom:18,paddingBottom:12,borderBottom:"1px solid rgba(0,0,0,0.08)"}}>{editProd?"עריכת מוצר":"מוצר חדש"}</div>
      <div style={{marginBottom:16}}>
        <label style={{fontSize:12,fontWeight:500,color:"#666",display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.04em"}}>תמונות</label>
        <div style={{padding:"12px",background:"#f0eeec",borderRadius:10,border:"1.5px dashed rgba(0,0,0,0.15)"}}>
          <ImageStrip images={prodForm.images||[]}
            onAdd={img=>setProdForm(f=>({...f,images:[...(f.images||[]),img]}))}
            onEdit={idx=>setEditImgCtx({target:"prod",idx})}
            onDelete={idx=>setProdForm(f=>({...f,images:f.images.filter((_,i)=>i!==idx)}))}/>
        </div>
      </div>
      <div style={{marginBottom:14}}>
        <label style={{fontSize:12,fontWeight:500,color:"#666",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.04em"}}>תיאור</label>
        <div style={{background:"#fff",borderRadius:10,border:"1.5px solid rgba(0,0,0,0.14)",overflow:"hidden"}}>
          <textarea style={{...IS,minHeight:80,resize:"vertical"}} value={prodForm.description} onChange={e=>setProdForm(f=>({...f,description:e.target.value}))} placeholder="תיאור מוצר..."/>
        </div>
      </div>
      <div style={{marginBottom:20}}>
        <label style={{fontSize:12,fontWeight:500,color:"#666",display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.04em"}}>דירוג</label>
        <Stars value={prodForm.rating||0} onChange={v=>setProdForm(f=>({...f,rating:v}))}/>
      </div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={handleSaveProd} style={{...BP,flex:1}}>שמור</button>
        <button onClick={()=>setProdModal(false)} style={{flex:1,padding:"10px",borderRadius:9,border:"1.5px solid rgba(0,0,0,0.15)",background:"transparent",cursor:"pointer",fontSize:14,color:"#555"}}>ביטול</button>
      </div>
    </Overlay>}

    {editImgCtx?.target==="card"&&form._cardPreview&&(
      <ImageEditor src={form._cardPreview} type={form._cardPreviewType||"image/jpeg"}
        onSave={(b64,mt)=>{setForm(f=>({...f,_cardPreview:b64,_cardPreviewType:mt}));setEditImgCtx(null);}}
        onClose={()=>setEditImgCtx(null)}/>
    )}
    {editImgCtx?.target==="prod"&&(()=>{
      const idx=editImgCtx.idx,img=prodForm.images?.[idx];if(!img||!img.data)return null;
      return(<ImageEditor src={img.data} type={img.type||"image/jpeg"}
        onSave={(b64,mt)=>{setProdForm(f=>{const imgs=[...f.images];imgs[idx]={data:b64,type:mt};return{...f,images:imgs};});setEditImgCtx(null);}}
        onClose={()=>setEditImgCtx(null)}/>);
    })()}
  </div>);
}