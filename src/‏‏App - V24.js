import { useState, useEffect, useRef, useCallback } from "react";

/* ── City → Province (exact keys, trimmed) ── */
const CPM = {
  "Langfang":"Hebei","Bazhou":"Hebei","Anji":"Zhejiang","Foshan":"Guangdong",
  "Huizhou":"Guangdong","Shenzhen":"Guangdong","Luoyang":"Henan","Shuyang":"Jiangsu",
  "Suzhou":"Jiangsu","Qingdao":"Shandong","Dezhou":"Shandong","Tianjin":"Tianjin",
  "Fuding":"Fujian","Zhangzhou":"Fujian","Fuzhou":"Fujian","Ganzhou":"Jiangxi"
};
const CITIES = Object.keys(CPM); // ["Langfang","Bazhou",...]
const PROVINCES = ["Hebei","Zhejiang","Guangdong","Shandong","Henan","Jiangsu","Jiangxi","Fujian","Tianjin","Sichuan","אחר"];
const FIELDS_OF_WORK = ["פלסטיק","עץ","ברזל","מרופדים","אחר"];

function getProvince(cityRaw) {
  if (!cityRaw) return "";
  const trimmed = cityRaw.trim();
  // exact match first
  if (CPM[trimmed]) return CPM[trimmed];
  // case-insensitive fallback
  const key = CITIES.find(c => c.toLowerCase() === trimmed.toLowerCase());
  return key ? CPM[key] : "";
}

/* ── Helpers ── */
function fileToBase64(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(file);});}
function todayStr(){return new Date().toISOString().slice(0,10);}
function todayKey(){return new Date().toISOString().slice(0,10);}
function nowISO(){return new Date().toISOString();}
function dtLabel(){
  const n=new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}_${String(n.getHours()).padStart(2,"0")}-${String(n.getMinutes()).padStart(2,"0")}`;
}

async function callGemini(prompt, b64, mt, apiKey){
  const parts = [];
  if(b64) parts.push({inline_data:{mime_type:mt||"image/jpeg",data:b64}});
  parts.push({text: prompt});
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {method:"POST", headers:{"Content-Type":"application/json"},
     body:JSON.stringify({contents:[{parts}]})}
  );
  const d = await res.json();
  if(d.error) throw new Error(d.error.message);
  return d.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("\n")||"";
}

function compressImage(b64,srcType,quality=0.72){
  return new Promise(res=>{
    const img=new Image();
    img.onload=()=>{
      const cvs=document.createElement("canvas");
      const MAX=1600;
      let w=img.naturalWidth,h=img.naturalHeight;
      if(w>MAX){h=Math.round(h*MAX/w);w=MAX;}
      if(h>MAX){w=Math.round(w*MAX/h);h=MAX;}
      cvs.width=w;cvs.height=h;
      cvs.getContext("2d").drawImage(img,0,0,w,h);
      res({data:cvs.toDataURL("image/jpeg",quality).split(",")[1],type:"image/jpeg"});
    };
    img.src=`data:${srcType||"image/jpeg"};base64,${b64}`;
  });
}

/* ── ZIP helper (no external lib – manual ZIP) ── */
// We'll use JSZip from CDN
function loadJSZip(){
  return new Promise((res,rej)=>{
    if(window.JSZip){res(window.JSZip);return;}
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    s.onload=()=>res(window.JSZip);
    s.onerror=rej;
    document.head.appendChild(s);
  });
}

/* ── Stars ── */
function Stars({value,onChange}){
  const [hover,setHover]=useState(0);
  return(<div style={{display:"flex",gap:3}}>{[1,2,3,4,5].map(i=>(
    <span key={i} onClick={()=>onChange&&onChange(i)} onMouseEnter={()=>onChange&&setHover(i)} onMouseLeave={()=>onChange&&setHover(0)}
      style={{fontSize:24,cursor:onChange?"pointer":"default",color:(hover||value)>=i?"#f59e0b":"#d1d5db",lineHeight:1,userSelect:"none"}}>★</span>
  ))}</div>);
}

/* ── City Autocomplete – uses native <datalist> + manual province fill ── */
function CityInput({value, onChange, onCitySelect}){
  const [inputVal, setInputVal] = useState(value||"");
  const listId = useRef("cl_"+Math.random().toString(36).slice(2));
  const prevVal = useRef(value||"");

  useEffect(()=>{ setInputVal(value||""); prevVal.current=value||""; },[value]);

  function handleChange(e){
    const v = e.target.value;
    setInputVal(v);
    onChange(v);
    // check if typed value exactly matches a city (datalist selection)
    const matched = CITIES.find(c => c.toLowerCase() === v.trim().toLowerCase());
    if(matched && matched !== prevVal.current){
      prevVal.current = matched;
      onCitySelect(matched);
    }
  }

  // also fire on input event for datalist pick (some browsers fire input not change)
  function handleInput(e){
    const v = e.target.value;
    const matched = CITIES.find(c => c.toLowerCase() === v.trim().toLowerCase());
    if(matched && matched !== prevVal.current){
      prevVal.current = matched;
      setInputVal(matched);
      onChange(matched);
      onCitySelect(matched);
    }
  }

  return(
    <div>
      <input
        value={inputVal}
        list={listId.current}
        onChange={handleChange}
        onInput={handleInput}
        placeholder="הקלד שם עיר..."
        style={{width:"100%",boxSizing:"border-box",padding:"9px 11px",fontSize:14,border:"none",outline:"none",background:"transparent",color:"#111",fontFamily:"inherit"}}
        autoComplete="off"
      />
      <datalist id={listId.current}>
        {CITIES.map(c=><option key={c} value={c}>{c} – {CPM[c]}</option>)}
      </datalist>
    </div>
  );
}

/* ── MultiSelect ── */
function MultiSelect({options,value=[],onChange}){
  const coreOpts=options.slice(0,-1);
  const customVals=value.filter(v=>!options.includes(v));
  const hasOther=value.includes("אחר")||customVals.length>0;
  const otherText=customVals[0]||"";
  const toggle=opt=>{
    if(opt==="אחר"){
      if(hasOther)onChange(value.filter(v=>coreOpts.includes(v)));
      else onChange([...value.filter(v=>coreOpts.includes(v)),"אחר"]);
    } else {
      if(value.includes(opt))onChange(value.filter(v=>v!==opt));
      else onChange([...value.filter(v=>v!=="אחר"&&!customVals.includes(v)),opt,...(hasOther?[otherText||"אחר"].filter(Boolean):[])]);
    }
  };
  return(
    <div style={{padding:"10px"}}>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:hasOther?10:0}}>
        {options.map(opt=>{const sel=opt==="אחר"?hasOther:value.includes(opt);return(
          <button key={opt} onClick={()=>toggle(opt)} style={{padding:"6px 14px",borderRadius:20,border:"1.5px solid",borderColor:sel?"#1d4ed8":"rgba(0,0,0,0.18)",background:sel?"#1d4ed8":"#fff",color:sel?"#fff":"#444",fontSize:13,cursor:"pointer",fontWeight:sel?500:400}}>{opt}</button>
        );})}
      </div>
      {hasOther&&<input value={otherText} onChange={e=>{const v=e.target.value;onChange([...value.filter(v2=>coreOpts.includes(v2)),v].filter(Boolean));}} placeholder="הקלד תחום..." style={{width:"100%",boxSizing:"border-box",padding:"7px 10px",fontSize:13,borderRadius:8,border:"1.5px solid rgba(0,0,0,0.18)",outline:"none",background:"#f8f8f8"}}/>}
    </div>
  );
}

/* ── Province Select ── */
function ProvinceSelect({value,onChange}){
  const isCustom=value&&!PROVINCES.slice(0,-1).includes(value)&&value!=="אחר";
  const selVal=isCustom?"אחר":(value||"");
  return(
    <div>
      <select value={selVal} onChange={e=>{if(e.target.value!=="אחר")onChange(e.target.value); else onChange("אחר");}}
        style={{width:"100%",boxSizing:"border-box",padding:"9px 11px",fontSize:14,border:"none",outline:"none",background:"transparent",color:selVal?"#111":"#888",fontFamily:"inherit"}}>
        <option value="">-- בחר מחוז --</option>
        {PROVINCES.map(p=><option key={p} value={p}>{p}</option>)}
      </select>
      {(selVal==="אחר")&&(
        <input value={isCustom?value:""} onChange={e=>onChange(e.target.value)} placeholder="הקלד מחוז..."
          style={{width:"100%",boxSizing:"border-box",padding:"8px 11px",fontSize:13,border:"none",borderTop:"1px solid rgba(0,0,0,0.1)",outline:"none",background:"#f8f8f8",color:"#111"}}/>
      )}
    </div>
  );
}

/* ── Media Button ── */
function MediaButton({label,accept,capture,onFile,style={}}){
  const uid=useRef("f"+Math.random().toString(36).slice(2));
  return(
    <label htmlFor={uid.current} style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:13,padding:"7px 12px",borderRadius:8,border:"1.5px solid rgba(0,0,0,0.18)",background:"#fff",cursor:"pointer",color:"#333",fontWeight:500,...style}}>
      {label}
      <input id={uid.current} type="file" accept={accept} capture={capture||undefined} style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)onFile(f);e.target.value="";}}/>
    </label>
  );
}

function Field({label,children,error}){
  return(
    <div style={{marginBottom:14}}>
      <label style={{fontSize:12,fontWeight:500,color:"#666",display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.04em"}}>{label}</label>
      <div style={{background:"#fff",borderRadius:10,border:"1.5px solid rgba(0,0,0,0.14)",overflow:"hidden"}}>{children}</div>
      {error&&<div style={{fontSize:12,color:"#dc2626",marginTop:4}}>{error}</div>}
    </div>
  );
}
const IS={width:"100%",boxSizing:"border-box",padding:"9px 11px",fontSize:14,border:"none",outline:"none",background:"transparent",color:"#111",fontFamily:"inherit"};

function Overlay({children,onClose}){
  return(
    <div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
      <div style={{background:"#f8f7f5",borderRadius:18,border:"1px solid rgba(0,0,0,0.12)",width:"100%",maxWidth:500,maxHeight:"88vh",overflowY:"auto",padding:"1.5rem",position:"relative",boxSizing:"border-box"}}>
        <button onClick={onClose} style={{position:"absolute",top:12,right:14,background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#888",lineHeight:1}}>✕</button>
        {children}
      </div>
    </div>
  );
}

/* ── Image Editor ── */
function ImageEditor({src,type,onSave,onClose}){
  const canvasRef=useRef();const origRef=useRef(null);
  const [brightness,setBrightness]=useState(100);const [contrast,setContrast]=useState(100);const [saturation,setSaturation]=useState(100);
  const [rotate,setRotate]=useState(0);const [removing,setRemoving]=useState(false);const [bgRemoved,setBgRemoved]=useState(false);
  useEffect(()=>{const img=new Image();img.onload=()=>{origRef.current=img;redrawImg(img,0,100,100,100,false);};img.src=`data:${type};base64,${src}`;},[]);
  function redrawImg(img,rot,br,ct,sat,removeBg){
    if(!img||!canvasRef.current)return;
    const cvs=canvasRef.current,isRot=rot%180!==0;
    cvs.width=isRot?img.naturalHeight:img.naturalWidth;cvs.height=isRot?img.naturalWidth:img.naturalHeight;
    const ctx=cvs.getContext("2d");ctx.clearRect(0,0,cvs.width,cvs.height);ctx.save();
    ctx.translate(cvs.width/2,cvs.height/2);ctx.rotate(rot*Math.PI/180);
    ctx.filter=`brightness(${br}%) contrast(${ct}%) saturate(${sat}%)`;
    ctx.drawImage(img,-img.naturalWidth/2,-img.naturalHeight/2);ctx.restore();
    if(removeBg)applyBgRemoval(cvs);
  }
  const doRedraw=useCallback((rb)=>{if(origRef.current)redrawImg(origRef.current,rotate,brightness,contrast,saturation,rb);},[rotate,brightness,contrast,saturation]);
  useEffect(()=>{doRedraw(bgRemoved);},[rotate,brightness,contrast,saturation]);
  function applyBgRemoval(cvs){
    const ctx=cvs.getContext("2d"),id=ctx.getImageData(0,0,cvs.width,cvs.height),d=id.data;
    const corners=[[0,0],[cvs.width-1,0],[0,cvs.height-1],[cvs.width-1,cvs.height-1]];
    let rS=0,gS=0,bS=0;corners.forEach(([x,y])=>{const i=(y*cvs.width+x)*4;rS+=d[i];gS+=d[i+1];bS+=d[i+2];});
    const bgR=rS/4,bgG=gS/4,bgB=bS/4,tol=55;
    for(let i=0;i<d.length;i+=4){if(Math.abs(d[i]-bgR)<tol&&Math.abs(d[i+1]-bgG)<tol&&Math.abs(d[i+2]-bgB)<tol)d[i+3]=0;}
    ctx.putImageData(id,0,0);
  }
  const handleRemoveBg=()=>{setRemoving(true);setTimeout(()=>{doRedraw(true);setBgRemoved(true);setRemoving(false);},50);};
  const handleSave=()=>{const cvs=canvasRef.current;onSave(cvs.toDataURL("image/jpeg",0.85).split(",")[1],"image/jpeg");};
  const slRow=(lbl,val,set)=>(
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
      <span style={{width:70,fontSize:13,color:"#555",flexShrink:0}}>{lbl}</span>
      <input type="range" min={0} max={200} value={val} onChange={e=>set(+e.target.value)} style={{flex:1}}/>
      <span style={{width:36,fontSize:12,color:"#666"}}>{val}%</span>
    </div>
  );
  return(
    <Overlay onClose={onClose}>
      <div style={{fontWeight:600,fontSize:16,marginBottom:14}}>עריכת תמונה</div>
      <canvas ref={canvasRef} style={{width:"100%",borderRadius:10,border:"1px solid rgba(0,0,0,0.12)",marginBottom:14,display:"block",background:"repeating-conic-gradient(#ccc 0% 25%,#fff 0% 50%) 0 0/16px 16px"}}/>
      {slRow("בהירות",brightness,setBrightness)}{slRow("ניגודיות",contrast,setContrast)}{slRow("רוויה",saturation,setSaturation)}
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontSize:13,color:"#555"}}>סיבוב:</span>
        {[0,90,180,270].map(r=>(
          <button key={r} onClick={()=>{setRotate(r);setTimeout(()=>redrawImg(origRef.current,r,brightness,contrast,saturation,bgRemoved),0);}}
            style={{padding:"5px 10px",borderRadius:7,border:"1.5px solid",borderColor:rotate===r?"#3b82f6":"rgba(0,0,0,0.2)",background:rotate===r?"#eff6ff":"transparent",color:rotate===r?"#1d4ed8":"#444",cursor:"pointer",fontSize:13}}>{r}°</button>
        ))}
      </div>
      <button onClick={handleRemoveBg} disabled={removing||bgRemoved} style={{width:"100%",padding:"9px",borderRadius:9,border:"1.5px solid rgba(0,0,0,0.15)",background:"#fff",cursor:"pointer",fontSize:13,marginBottom:10,color:"#333",fontWeight:500}}>
        {removing?"מסיר רקע...":bgRemoved?"רקע הוסר ✓":"✂ הסרת רקע"}
      </button>
      <div style={{display:"flex",gap:8}}>
        <button onClick={handleSave} style={{flex:1,padding:"9px",borderRadius:9,border:"none",background:"#1d4ed8",cursor:"pointer",fontSize:14,fontWeight:500,color:"#fff"}}>שמור שינויים</button>
        <button onClick={onClose} style={{flex:1,padding:"9px",borderRadius:9,border:"1.5px solid rgba(0,0,0,0.15)",background:"transparent",cursor:"pointer",fontSize:14,color:"#555"}}>ביטול</button>
      </div>
    </Overlay>
  );
}

/* ── DB ── */
function useDB(){
  const dbRef=useRef(null);const [ready,setReady]=useState(false);
  useEffect(()=>{
    const req=indexedDB.open("suppliers_db_v10",1);
    req.onupgradeneeded=e=>{
      const db=e.target.result;
      if(!db.objectStoreNames.contains("suppliers"))db.createObjectStore("suppliers",{keyPath:"id",autoIncrement:true});
      if(!db.objectStoreNames.contains("products")){const p=db.createObjectStore("products",{keyPath:"id",autoIncrement:true});p.createIndex("supplierId","supplierId");}
      if(!db.objectStoreNames.contains("meta"))db.createObjectStore("meta",{keyPath:"key"});
    };
    req.onsuccess=e=>{dbRef.current=e.target.result;setReady(true);};
    req.onerror=()=>setReady(true);
  },[]);
  const tx=(store,mode,fn)=>new Promise((res,rej)=>{const t=dbRef.current.transaction(store,mode),s=t.objectStore(store),r=fn(s);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
  const getAllSuppliers=()=>tx("suppliers","readonly",s=>s.getAll());
  const addSupplier=d=>tx("suppliers","readwrite",s=>s.add(d));
  const updateSupplier=d=>tx("suppliers","readwrite",s=>s.put(d));
  const deleteSupplier=id=>tx("suppliers","readwrite",s=>s.delete(id));
  const getProductsBySupplier=sid=>new Promise((res,rej)=>{const t=dbRef.current.transaction("products","readonly"),s=t.objectStore("products"),r=s.index("supplierId").getAll(sid);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
  const addProduct=d=>tx("products","readwrite",s=>s.add(d));
  const updateProduct=d=>tx("products","readwrite",s=>s.put(d));
  const deleteProduct=id=>tx("products","readwrite",s=>s.delete(id));
  const getAllProducts=()=>tx("products","readonly",s=>s.getAll());
  const getMeta=key=>tx("meta","readonly",s=>s.get(key));
  const setMeta=(key,value)=>tx("meta","readwrite",s=>s.put({key,value}));
  return{ready,getAllSuppliers,addSupplier,updateSupplier,deleteSupplier,getProductsBySupplier,addProduct,updateProduct,deleteProduct,getAllProducts,getMeta,setMeta};
}

const EMPTY_FORM={name:"",contact:"",phone:"",email:"",city:"",province:"",fields:[],description:"",rating:0,cardImage:"",cardImageType:"",source:"",date:todayStr()};
const EMPTY_PROD={description:"",images:[],rating:0};

function ImageStrip({images=[],onAdd,onEdit,onDelete}){
  return(
    <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
      {images.map((img,i)=>(
        <div key={i} style={{position:"relative",flexShrink:0}}>
          <img src={`data:${img.type};base64,${img.data}`} style={{width:72,height:72,objectFit:"cover",borderRadius:8,border:"1px solid rgba(0,0,0,0.12)",display:"block"}}/>
          <div style={{position:"absolute",bottom:2,right:2,display:"flex",gap:2}}>
            <button onClick={()=>onEdit(i)} style={{background:"rgba(0,0,0,0.65)",border:"none",borderRadius:4,color:"#fff",fontSize:10,padding:"2px 4px",cursor:"pointer"}}>✏</button>
            <button onClick={()=>onDelete(i)} style={{background:"rgba(220,38,38,0.8)",border:"none",borderRadius:4,color:"#fff",fontSize:10,padding:"2px 4px",cursor:"pointer"}}>✕</button>
          </div>
        </div>
      ))}
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        <MediaButton label="📁 קובץ" accept="image/*" onFile={async f=>{const b64=await fileToBase64(f);onAdd({data:b64,type:f.type});}} style={{fontSize:12,padding:"5px 10px"}}/>
        <MediaButton label="📷 צלם" accept="image/*" capture="environment" onFile={async f=>{const b64=await fileToBase64(f);onAdd({data:b64,type:f.type});}} style={{fontSize:12,padding:"5px 10px"}}/>
      </div>
    </div>
  );
}

function Section({title,icon,children,accent}){
  return(
    <div style={{background:"#fff",borderRadius:14,border:"1px solid rgba(0,0,0,0.1)",marginBottom:12,overflow:"hidden"}}>
      <div style={{background:accent,padding:"10px 16px",display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:16}}>{icon}</span>
        <span style={{fontWeight:600,fontSize:14,color:"#fff"}}>{title}</span>
      </div>
      <div style={{padding:"14px 16px"}}>{children}</div>
    </div>
  );
}
function ActBtn({icon,label,onClick,color,bg}){
  return(
    <button onClick={onClick} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"10px 14px",borderRadius:10,border:"1.5px solid rgba(0,0,0,0.14)",background:bg||"#fff",cursor:"pointer",color:color||"#333",fontWeight:500,fontSize:12,minWidth:72}}>
      <span style={{fontSize:20}}>{icon}</span><span>{label}</span>
    </button>
  );
}

/* ── Login Screen ── */
function LoginScreen({onLogin}){
  const [name,setName]=useState("");
  const [key,setKey]=useState("");
  const [showKey,setShowKey]=useState(false);
  const [testing,setTesting]=useState(false);
  const [keyErr,setKeyErr]=useState("");
  const valid = name.trim() && key.trim().length > 10;

  async function handleSubmit(){
    if(!valid) return;
    setTesting(true); setKeyErr("");
    try{
      const trimmedKey = key.trim();
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${trimmedKey}`,
        {method:"POST", headers:{"Content-Type":"application/json"},
         body:JSON.stringify({contents:[{parts:[{text:"hi"}]}]})}
      );
      const d = await res.json();
      if(d.error){
        setKeyErr(`שגיאה: ${d.error.message}`);
        setTesting(false); return;
      }
      onLogin(name.trim(), trimmedKey);
    } catch(e){
      // CORS or network – let user in anyway, will fail on actual use
      console.warn("Login test failed:", e.message);
      onLogin(name.trim(), key.trim());
    }
    setTesting(false);
  }

  return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f1f5f9",fontFamily:"sans-serif"}}>
      <div style={{background:"#fff",borderRadius:18,border:"1px solid rgba(0,0,0,0.1)",padding:"2rem",width:320,direction:"rtl"}}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:36,marginBottom:6}}>🏭</div>
          <div style={{fontSize:20,fontWeight:700,marginBottom:4}}>ניהול ספקים</div>
          <div style={{fontSize:13,color:"#888"}}>הזן פרטים להמשך</div>
        </div>

        <label style={{fontSize:12,fontWeight:500,color:"#666",display:"block",marginBottom:5}}>שם משתמש</label>
        <input value={name} onChange={e=>setName(e.target.value)}
          placeholder="השם שלך..."
          style={{width:"100%",boxSizing:"border-box",padding:"9px 12px",fontSize:14,borderRadius:9,border:"1.5px solid rgba(0,0,0,0.18)",outline:"none",marginBottom:14,textAlign:"right"}}/>

        <label style={{fontSize:12,fontWeight:500,color:"#666",display:"block",marginBottom:5}}>
          Gemini API Key
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer"
            style={{fontSize:11,color:"#2563eb",marginRight:6,fontWeight:400}}>קבל key חינמי ←</a>
        </label>
        <div style={{position:"relative",marginBottom:6}}>
          <input value={key} onChange={e=>{setKey(e.target.value);setKeyErr("");}}
            type={showKey?"text":"password"}
            placeholder="AIza..."
            style={{width:"100%",boxSizing:"border-box",padding:"9px 12px",fontSize:13,borderRadius:9,border:`1.5px solid ${keyErr?"#dc2626":"rgba(0,0,0,0.18)"}`,outline:"none",textAlign:"left",direction:"ltr"}}/>
          <button onClick={()=>setShowKey(v=>!v)} style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:16,color:"#888"}}>{showKey?"🙈":"👁"}</button>
        </div>
        {keyErr && <div style={{fontSize:12,color:"#dc2626",marginBottom:8}}>{keyErr}</div>}
        <div style={{fontSize:11,color:"#aaa",marginBottom:16}}>ה-key נשמר רק במכשיר שלך ולא נשלח לשום שרת חיצוני</div>

        <button onClick={handleSubmit} disabled={!valid||testing}
          style={{width:"100%",padding:"11px",borderRadius:10,border:"none",background:valid?"#1d4ed8":"#93c5fd",cursor:valid?"pointer":"default",fontSize:15,fontWeight:600,color:"#fff"}}>
          {testing?"בודק key...":"כניסה"}
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════ */
export default function App(){
  const db=useDB();
  const [currentUser,setCurrentUser]=useState(null); // {name, key}
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
  const [search,setSearch]=useState("");
  const [filterProvince,setFilterProvince]=useState("");
  const [filterField,setFilterField]=useState("");
  const [errors,setErrors]=useState({});
  const [editImgCtx,setEditImgCtx]=useState(null);
  const [defaultSource,setDefaultSource]=useState("");
  const [msg,setMsg]=useState("");
  const [msgOk,setMsgOk]=useState(true);
  const importSupRef=useRef();
  const importImgRef=useRef();

  const showMsg=(text,ok=true)=>{setMsg(text);setMsgOk(ok);setTimeout(()=>setMsg(""),4000);};

  const loadAll=useCallback(async()=>{
    if(!db.ready)return;
    setSuppliers(await db.getAllSuppliers());
    const srcMeta=await db.getMeta("defaultSource_"+todayKey()).catch(()=>null);
    if(srcMeta?.value)setDefaultSource(srcMeta.value);
    const userMeta=await db.getMeta("currentUser").catch(()=>null);
    if(userMeta?.value&&!currentUser)setCurrentUser(userMeta.value);  },[db.ready]);
  useEffect(()=>{loadAll();},[loadAll]);

  async function handleLogin(name, key){
    const user={name,key};
    setCurrentUser(user);
    await db.setMeta("currentUser",user);
  }
  function handleLogout(){setCurrentUser(null);}

  const loadProducts=async sid=>{if(db.ready&&sid)setProducts(await db.getProductsBySupplier(sid));};
  const sf=(k,v)=>setForm(f=>({...f,[k]:v}));
  const saveDefaultSource=async val=>{setDefaultSource(val);await db.setMeta("defaultSource_"+todayKey(),val);};

  const handleCardFile=async file=>{
    setExtracting(true);
    try{
      const b64=await fileToBase64(file),mt=file.type;
      setForm(f=>({...f,cardImage:b64,cardImageType:mt}));
      if(!currentUser?.key){showMsg("אין Gemini API key – לא ניתן לחלץ פרטים",false);setExtracting(false);return;}
      const txt=await callGemini(
        "This is a business card. Extract: name (company/supplier), contact (person name), email, phone, city (English city name only). Return ONLY valid JSON with keys: name,contact,email,phone,city. No markdown.",
        b64, mt, currentUser.key
      );
      try{
        const p=JSON.parse(txt.replace(/```json|```/g,"").trim());
        const rawCity=(p.city||"").trim();
        const matchedCity=CITIES.find(c=>c.toLowerCase()===rawCity.toLowerCase())||rawCity;
        const autoProvince=getProvince(matchedCity);
        setForm(f=>({...f,
          name:p.name||f.name, contact:p.contact||f.contact,
          phone:p.phone||f.phone, email:p.email||f.email,
          city:matchedCity||f.city, province:autoProvince||f.province
        }));
      }catch(_){}
    }catch(e){console.error(e);showMsg("שגיאה בחילוץ: "+e.message,false);}
    setExtracting(false);
  };

  const validate=()=>{const e={};if(!form.name.trim())e.name="שם ספק הוא שדה חובה";setErrors(e);return!Object.keys(e).length;};

  const handleSave=async()=>{
    if(!validate())return;
    setSaving(true);const now=nowISO();
    try{
      if(form.source)await saveDefaultSource(form.source);
      if(selSup){
                  await db.updateSupplier({...form,id:selSup.id,updatedAt:now,updatedBy:userName});
        setSelSup(s=>({...s,...form,updatedAt:now,updatedBy:userName}));
      } else {
        const id=await db.addSupplier({...form,createdAt:now,createdBy:userName,updatedAt:now,updatedBy:userName});
        const all=await db.getAllSuppliers();const n=all.find(s=>s.id===id)||all[all.length-1];
        setSelSup(n);await loadProducts(n?.id);
      }
      await loadAll();if(selSup)await loadProducts(selSup.id);
      showMsg("הספק נשמר בהצלחה ✓",true);
    }catch(e){console.error(e);showMsg("שגיאה בשמירה",false);}
    setSaving(false);
  };

  const openEdit=async s=>{
    setSelSup(s);
    setForm({name:s.name||"",contact:s.contact||"",phone:s.phone||"",email:s.email||"",city:s.city||"",province:s.province||"",fields:s.fields||[],description:s.description||"",rating:s.rating||0,cardImage:s.cardImage||"",cardImageType:s.cardImageType||"",source:s.source||"",date:s.date||todayStr()});
    setErrors({});await loadProducts(s.id);setView("form");
  };
  
  /* eslint-disable no-restricted-globals */
  const handleDelSup=async id=>{if(!confirm("למחוק ספק זה?"))return;await db.deleteSupplier(id);await loadAll();if(selSup?.id===id){setView("list");setSelSup(null);}};
  const openProdModal=p=>{setEditProd(p||null);setProdForm(p?{description:p.description||"",images:p.images||[],rating:p.rating||0}:{...EMPTY_PROD,images:[]});setProdModal(true);};
  const handleSaveProd=async()=>{
    const sid=selSup?.id;if(!sid)return;const now=nowISO();
    const data={...prodForm,supplierId:sid,updatedAt:now,updatedBy:userName};
    if(editProd)await db.updateProduct({...data,id:editProd.id});
    else await db.addProduct({...data,createdAt:now,createdBy:userName});
    await loadProducts(sid);setProdModal(false);
  };
  const handleDelProd=async id=>{if(!confirm("למחוק מוצר זה?"))return;await db.deleteProduct(id);await loadProducts(selSup.id);};

  /* ── Build CSV string ── */
  const buildCSV=async()=>{
    const allS=await db.getAllSuppliers(),allP=await db.getAllProducts();
    let csv="\uFEFFאינדקס,שם ספק,מקור,תאריך,איש קשר,אימייל,עיר,מחוז,תחום עיסוק,תיאור,דירוג,נוצר,נוצר ע\"י,עודכן,עודכן ע\"י\n";
    allS.forEach(s=>{csv+=[s.id,`"${(s.name||"").replace(/"/g,'""')}"`,`"${(s.source||"").replace(/"/g,'""')}"`,s.date||"",`"${(s.contact||"").replace(/"/g,'""')}"`,s.email||"",s.city||"",s.province||"",`"${(s.fields||[]).join(", ")}"`,`"${(s.description||"").replace(/"/g,'""')}"`,s.rating||0,s.createdAt||"",s.createdBy||"",s.updatedAt||"",s.updatedBy||""].join(",")+"\n";});
    csv+="\n\nמוצרים\nאינדקס מוצר,ספק ID,תיאור,דירוג,נוצר,נוצר ע\"י,עודכן,עודכן ע\"י\n";
    allP.forEach(p=>{csv+=[p.id,p.supplierId,`"${(p.description||"").replace(/"/g,'""')}"`,p.rating||0,p.createdAt||"",p.createdBy||"",p.updatedAt||"",p.updatedBy||""].join(",")+"\n";});
    return csv;
  };

  /* ── Download ZIP ── */
  const downloadZip=async()=>{
    showMsg("מכין ZIP...",true);
    try{
      const JSZip=await loadJSZip();
      const zip=new JSZip();
      const folder=dtLabel();
      // CSV
      const csv=await buildCSV();
      zip.file(`${folder}/suppliers.csv`,csv);
      // images
      const allS=await db.getAllSuppliers(),allP=await db.getAllProducts();
      for(const s of allS){
        if(s.cardImage){
          const c=await compressImage(s.cardImage,s.cardImageType||"image/jpeg");
          zip.file(`${folder}/${s.id}.card.jpg`,c.data,{base64:true});
        }
      }
      for(const p of allP){
        for(let i=0;i<(p.images||[]).length;i++){
          const img=p.images[i];
          const c=await compressImage(img.data,img.type||"image/jpeg");
          zip.file(`${folder}/${p.supplierId}.${p.id}.${i+1}.jpg`,c.data,{base64:true});
        }
      }
      const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}});
      const a=document.createElement("a");
      a.href=URL.createObjectURL(blob);
      a.download=`suppliers_${dtLabel()}.zip`;
      a.click();
      showMsg(`✓ הורד ZIP: suppliers_${folder}.zip`,true);
    }catch(e){console.error(e);showMsg("שגיאה ביצירת ZIP: "+e.message,false);}
  };

  /* ── Import suppliers CSV ── */
  const importSuppliers=async file=>{
    showMsg("מייבא ספקים...",true);
    try{
      const text=await file.text();
      const lines=text.split("\n").filter(l=>l.trim());
      let start=0;
      for(let i=0;i<lines.length;i++){if(lines[i].includes("אינדקס")||lines[i].toLowerCase().includes("name")){start=i+1;break;}}
      let count=0;const now=nowISO();
      for(let i=start;i<lines.length;i++){
        const cols=lines[i].match(/(".*?"|[^,]+)(?=,|$)/g)||[];
        const c=cols.map(x=>x.replace(/^"|"$/g,"").trim());
        if(c.length<2||!c[1])continue;
        await db.addSupplier({name:c[1]||"",source:c[2]||"",date:c[3]||todayStr(),contact:c[4]||"",email:c[5]||"",city:c[6]||"",province:c[7]||"",fields:(c[8]||"").split(",").map(s=>s.trim()).filter(Boolean),description:c[9]||"",rating:parseInt(c[10])||0,cardImage:"",cardImageType:"",createdAt:now,createdBy:"import",updatedAt:now,updatedBy:"import"});
        count++;
      }
      await loadAll();showMsg(`יובאו ${count} ספקים ✓`,true);
    }catch(e){showMsg("שגיאה: "+e.message,false);}
  };

  /* ── Import images ── */
  const importImages=async files=>{
    showMsg("מייבא תמונות...",true);let count=0;
    for(const file of Array.from(files)){
      const name=file.name.replace(/\.[^.]+$/,"");
      const parts=name.split(".");
      if(parts.length===2&&parts[1]==="card"){
        const sid=parseInt(parts[0]);
        if(!isNaN(sid)){const all=await db.getAllSuppliers();const sup=all.find(s=>s.id===sid);        if(sup){const b64=await fileToBase64(file);await db.updateSupplier({...sup,cardImage:b64,cardImageType:file.type,updatedAt:nowISO(),updatedBy:userName});count++;}}
      } else if(parts.length>=2){
        const sid=parseInt(parts[0]),pid=parseInt(parts[1]);
        if(!isNaN(sid)&&!isNaN(pid)){const allP=await db.getAllProducts();const prod=allP.find(p=>p.id===pid&&p.supplierId===sid);if(prod){const b64=await fileToBase64(file);await db.updateProduct({...prod,images:[...(prod.images||[]),{data:b64,type:file.type}],updatedAt:nowISO(),updatedBy:userName});count++;}}
      }
    }
    await loadAll();showMsg(`יובאו ${count} תמונות ✓`,true);
  };

  const filtered=suppliers.filter(s=>{
    const q=search.toLowerCase();
    const ms=!q||s.name?.toLowerCase().includes(q)||s.contact?.toLowerCase().includes(q);
    const mp=!filterProvince||s.province===filterProvince;
    const mf=!filterField||(s.fields||[]).includes(filterField);
    return ms&&mp&&mf;
  });

  const allUsedProvinces=[...new Set(suppliers.map(s=>s.province).filter(Boolean))].sort();
  const allUsedFields=[...new Set(suppliers.flatMap(s=>s.fields||[]))].sort();
  const cardStyle={background:"#fff",borderRadius:14,border:"1px solid rgba(0,0,0,0.1)",padding:"1.25rem",marginBottom:14};
  const btnP={padding:"10px",borderRadius:9,border:"none",background:"#1d4ed8",cursor:"pointer",fontSize:14,fontWeight:500,color:"#fff"};

  if(!db.ready)return<div style={{padding:"2rem",textAlign:"center",color:"#888"}}>טוען...</div>;
  if(!currentUser)return<LoginScreen onLogin={handleLogin}/>;
  const userName = currentUser?.name||"user";

  return(
    <div dir="rtl" style={{fontFamily:"var(--font-sans)",padding:"0.75rem",maxWidth:560,margin:"0 auto",background:"var(--color-background-tertiary)",minHeight:"100vh"}}>
      <input ref={importSupRef} type="file" accept=".csv" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)importSuppliers(f);e.target.value="";}}/>
      <input ref={importImgRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>{if(e.target.files?.length)importImages(e.target.files);e.target.value="";}}/>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,paddingTop:4}}>
        {view!=="list"
          ?<button onClick={()=>{setView("list");setSelSup(null);}} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#555",padding:0,fontWeight:500}}>← רשימת ספקים</button>
          :<span style={{fontSize:18,fontWeight:700}}>ניהול ספקים</span>}
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:12,color:"#666",background:"#f1f5f9",padding:"4px 10px",borderRadius:20}}>👤 {userName}</span>
          {view==="list"&&<button onClick={()=>{setForm({...EMPTY_FORM,source:defaultSource,date:todayStr()});setSelSup(null);setErrors({});setView("form");}} style={{...btnP,padding:"7px 14px",fontSize:13}}>+ ספק חדש</button>}
          <button onClick={handleLogout} style={{fontSize:12,padding:"4px 10px",borderRadius:20,border:"1px solid rgba(0,0,0,0.15)",background:"#fff",cursor:"pointer",color:"#888"}}>יציאה</button>
        </div>
      </div>

      {msg&&<div style={{borderRadius:8,padding:"8px 14px",marginBottom:10,fontSize:13,fontWeight:500,background:msgOk?"#f0fdf4":"#fef2f2",border:`1px solid ${msgOk?"#bbf7d0":"#fecaca"}`,color:msgOk?"#065f46":"#dc2626"}}>{msg}</div>}

      {view==="list"&&<>
        <Section title="ייצוא נתונים" icon="📤" accent="#0f766e">
          <div style={{display:"flex",gap:10}}>
            <ActBtn icon="📦" label="הורד ZIP" bg="#f0fdf4" color="#065f46" onClick={downloadZip}/>
          </div>
          <div style={{fontSize:11,color:"#888",marginTop:8}}>יורד קובץ ZIP עם תיקיית תאריך+שעה שמכילה CSV וכל התמונות מכווצות</div>
        </Section>

        <Section title="ייבוא נתונים" icon="📥" accent="#7c3aed">
          <div style={{display:"flex",gap:10}}>
            <ActBtn icon="📊" label="ייבוא CSV" bg="#faf5ff" color="#5b21b6" onClick={()=>importSupRef.current.click()}/>
            <ActBtn icon="🖼" label="ייבוא תמונות" bg="#faf5ff" color="#5b21b6" onClick={()=>importImgRef.current.click()}/>
          </div>
          <div style={{fontSize:11,color:"#888",marginTop:8}}>תמונות לפי שם: ספקID.card.jpg | ספקID.מוצרID.מספר.jpg</div>
        </Section>

        {/* Search */}
        <div style={{...cardStyle,padding:"12px 14px",marginBottom:12}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="חיפוש לפי שם..." style={{width:"100%",border:"none",outline:"none",fontSize:14,background:"transparent",marginBottom:10,display:"block"}}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <select value={filterProvince} onChange={e=>setFilterProvince(e.target.value)} style={{fontSize:13,padding:"7px 8px",borderRadius:8,border:"1.5px solid rgba(0,0,0,0.14)",background:"#f8f7f5",color:"#333",outline:"none"}}>
              <option value="">כל המחוזות</option>
              {allUsedProvinces.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            <select value={filterField} onChange={e=>setFilterField(e.target.value)} style={{fontSize:13,padding:"7px 8px",borderRadius:8,border:"1.5px solid rgba(0,0,0,0.14)",background:"#f8f7f5",color:"#333",outline:"none"}}>
              <option value="">כל תחומי העיסוק</option>
              {(allUsedFields.length?allUsedFields:FIELDS_OF_WORK).map(f=><option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          {(search||filterProvince||filterField)&&<button onClick={()=>{setSearch("");setFilterProvince("");setFilterField("");}} style={{marginTop:8,fontSize:12,color:"#2563eb",background:"none",border:"none",cursor:"pointer",padding:0,fontWeight:500}}>✕ נקה סינון</button>}
        </div>

        <div style={{fontSize:12,color:"#888",marginBottom:8}}>{filtered.length} ספקים</div>
        {filtered.length===0&&<div style={{textAlign:"center",color:"#888",padding:"2.5rem",background:"#fff",borderRadius:14}}>לא נמצאו ספקים</div>}
        {filtered.map(s=>(
          <div key={s.id} style={{...cardStyle,display:"flex",alignItems:"center",gap:12,padding:"12px 14px"}}>
            {s.cardImage?<img src={`data:${s.cardImageType};base64,${s.cardImage}`} style={{width:46,height:46,borderRadius:9,objectFit:"cover",flexShrink:0,border:"1px solid rgba(0,0,0,0.1)"}}/>
              :<div style={{width:46,height:46,borderRadius:9,background:"#dbeafe",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:600,color:"#1d4ed8",flexShrink:0}}>{(s.name||"?")[0]}</div>}
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,fontSize:15,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.name}</div>
              <div style={{fontSize:12,color:"#888",marginBottom:2}}>{[s.contact,s.city,s.province].filter(Boolean).join(" · ")}</div>
              {(s.fields||[]).filter(Boolean).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:3,marginBottom:2}}>{s.fields.filter(Boolean).map((f,i)=><span key={i} style={{fontSize:11,padding:"2px 7px",borderRadius:20,background:"#eff6ff",color:"#1d4ed8",fontWeight:500}}>{f}</span>)}</div>}
              <Stars value={s.rating}/>
              {s.updatedAt&&<div style={{fontSize:10,color:"#bbb",marginTop:1}}>עודכן ע"י {s.updatedBy||"?"} · {new Date(s.updatedAt).toLocaleString("he-IL")}</div>}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0}}>
              <button onClick={()=>openEdit(s)} style={{fontSize:12,padding:"5px 12px",borderRadius:7,border:"1.5px solid rgba(0,0,0,0.15)",background:"#fff",cursor:"pointer",color:"#333",fontWeight:500}}>עריכה</button>
              <button onClick={()=>handleDelSup(s.id)} style={{fontSize:12,padding:"5px 12px",borderRadius:7,border:"1.5px solid rgba(220,38,38,0.3)",background:"#fff",cursor:"pointer",color:"#dc2626",fontWeight:500}}>מחק</button>
            </div>
          </div>
        ))}
      </>}

      {view==="form"&&<>
        <div style={cardStyle}>
          <div style={{fontSize:16,fontWeight:600,marginBottom:16,paddingBottom:12,borderBottom:"1px solid rgba(0,0,0,0.08)"}}>{selSup?"עריכת ספק":"ספק חדש"}</div>

          {/* כרטיס ביקור */}
          <div style={{marginBottom:18}}>
            <label style={{fontSize:12,fontWeight:500,color:"#666",display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.04em"}}>כרטיס ביקור</label>
            <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",padding:"12px",background:"#f8f7f5",borderRadius:10,border:"1.5px dashed rgba(0,0,0,0.15)"}}>
              {form.cardImage&&(
                <div style={{position:"relative",flexShrink:0}}>
                  <img src={`data:${form.cardImageType};base64,${form.cardImage}`} style={{width:90,height:60,objectFit:"cover",borderRadius:8,border:"1px solid rgba(0,0,0,0.1)",display:"block"}}/>
                  <button onClick={()=>setEditImgCtx({target:"card"})} style={{position:"absolute",bottom:3,right:3,background:"rgba(0,0,0,0.65)",border:"none",borderRadius:5,color:"#fff",fontSize:10,padding:"2px 5px",cursor:"pointer"}}>✏</button>
                </div>
              )}
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <MediaButton label={extracting?"מחלץ...":"📁 העלאת כרטיס"} accept="image/*" onFile={handleCardFile}/>
                <MediaButton label="📷 צלם כרטיס" accept="image/*" capture="environment" onFile={handleCardFile}/>
                {extracting&&<span style={{fontSize:12,color:"#2563eb",fontWeight:500}}>AI מחלץ פרטים...</span>}
              </div>
            </div>
          </div>

          <Field label="מקור ספק">
            <input style={IS} value={form.source} onChange={e=>sf("source",e.target.value)} onBlur={e=>{if(e.target.value)saveDefaultSource(e.target.value);}} placeholder="מאיפה הגיע הספק?"/>
          </Field>
          <Field label="תאריך">
            <input type="date" style={IS} value={form.date} onChange={e=>sf("date",e.target.value)}/>
          </Field>
          <Field label="שם ספק *" error={errors.name}>
            <input style={IS} value={form.name} onChange={e=>sf("name",e.target.value)} placeholder="שם החברה"/>
          </Field>
          <Field label="שם איש קשר">
            <input style={IS} value={form.contact} onChange={e=>sf("contact",e.target.value)} placeholder="שם מלא"/>
          </Field>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Field label="טלפון">
              <input style={IS} value={form.phone||""} onChange={e=>sf("phone",e.target.value)} placeholder="+86..." type="tel"/>
            </Field>
            <Field label="אימייל">
              <input style={IS} value={form.email} onChange={e=>sf("email",e.target.value)} type="email" placeholder="email@..."/>
            </Field>
            <Field label="עיר">
              <CityInput
                value={form.city}
                onChange={v=>sf("city",v)}
                onCitySelect={city=>{
                  sf("city",city);
                  const prov=getProvince(city);
                  if(prov) sf("province",prov);
                }}
              />
            </Field>
          </div>
          <Field label="מחוז">
            <ProvinceSelect value={form.province} onChange={v=>sf("province",v)}/>
          </Field>
          <Field label="תחום עיסוק">
            <MultiSelect options={FIELDS_OF_WORK} value={form.fields||[]} onChange={v=>sf("fields",v)}/>
          </Field>
          <Field label="תיאור">
            <textarea style={{...IS,minHeight:80,resize:"vertical"}} value={form.description} onChange={e=>sf("description",e.target.value)} placeholder="תיאור כללי"/>
          </Field>
          <div style={{marginBottom:18}}>
            <label style={{fontSize:12,fontWeight:500,color:"#666",display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.04em"}}>דירוג ספק</label>
            <Stars value={form.rating} onChange={v=>sf("rating",v)}/>
          </div>
          {selSup&&<div style={{fontSize:11,color:"#bbb",marginBottom:12}}>
            {selSup.createdAt&&<span>נוצר ע"י {selSup.createdBy} · {new Date(selSup.createdAt).toLocaleString("he-IL")}   </span>}
            {selSup.updatedAt&&<span>עודכן ע"י {selSup.updatedBy} · {new Date(selSup.updatedAt).toLocaleString("he-IL")}</span>}
          </div>}
          <button onClick={handleSave} disabled={saving} style={{...btnP,width:"100%"}}>{saving?"שומר...":"שמור ספק"}</button>
        </div>

        {selSup&&(
          <div style={cardStyle}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,paddingBottom:12,borderBottom:"1px solid rgba(0,0,0,0.08)"}}>
              <span style={{fontSize:16,fontWeight:600}}>מוצרים</span>
              <button onClick={()=>openProdModal()} style={{...btnP,fontSize:13,padding:"7px 14px"}}>+ הוסף</button>
            </div>
            {products.length===0&&<div style={{textAlign:"center",color:"#aaa",fontSize:14,padding:"1.5rem",background:"#f8f7f5",borderRadius:10}}>אין מוצרים עדיין</div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {products.map(p=>{
                const fi=p.images?.[0];
                return(
                  <div key={p.id} style={{border:"1px solid rgba(0,0,0,0.1)",borderRadius:12,overflow:"hidden",background:"#fafaf9"}}>
                    {fi?<img src={`data:${fi.type};base64,${fi.data}`} style={{width:"100%",height:110,objectFit:"cover",display:"block"}}/>
                      :<div style={{height:70,background:"#f0eeec",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#bbb"}}>אין תמונה</div>}
                    <div style={{padding:"10px"}}>
                      <div style={{fontSize:11,color:"#aaa",marginBottom:2}}>#{p.id} · {p.images?.length||0} תמונות</div>
                      <div style={{fontSize:13,marginBottom:5,minHeight:26,lineHeight:1.4}}>{p.description||"ללא תיאור"}</div>
                      <div style={{marginBottom:5,transform:"scale(0.82)",transformOrigin:"right"}}><Stars value={p.rating||0}/></div>
                      {p.updatedAt&&<div style={{fontSize:10,color:"#ccc",marginBottom:5}}>ע"י {p.updatedBy} · {new Date(p.updatedAt).toLocaleString("he-IL")}</div>}
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>openProdModal(p)} style={{fontSize:12,padding:"5px 0",borderRadius:7,border:"1.5px solid rgba(0,0,0,0.15)",background:"#fff",cursor:"pointer",color:"#333",fontWeight:500,flex:1}}>ערוך</button>
                        <button onClick={()=>handleDelProd(p.id)} style={{fontSize:12,padding:"5px 0",borderRadius:7,border:"1.5px solid rgba(220,38,38,0.25)",background:"#fff",cursor:"pointer",color:"#dc2626",fontWeight:500,flex:1}}>מחק</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </>}

      {prodModal&&(
        <Overlay onClose={()=>setProdModal(false)}>
          <div style={{fontWeight:600,fontSize:16,marginBottom:18,paddingBottom:12,borderBottom:"1px solid rgba(0,0,0,0.08)"}}>{editProd?"עריכת מוצר":"מוצר חדש"}</div>
          <div style={{marginBottom:16}}>
            <label style={{fontSize:12,fontWeight:500,color:"#666",display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.04em"}}>תמונות</label>
            <div style={{padding:"12px",background:"#f0eeec",borderRadius:10,border:"1.5px dashed rgba(0,0,0,0.15)"}}>
              <ImageStrip images={prodForm.images||[]} onAdd={img=>setProdForm(f=>({...f,images:[...(f.images||[]),img]}))} onEdit={idx=>setEditImgCtx({target:"prod",idx})} onDelete={idx=>setProdForm(f=>({...f,images:f.images.filter((_,i)=>i!==idx)}))}/>
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
            <button onClick={handleSaveProd} style={{...btnP,flex:1}}>שמור</button>
            <button onClick={()=>setProdModal(false)} style={{flex:1,padding:"10px",borderRadius:9,border:"1.5px solid rgba(0,0,0,0.15)",background:"transparent",cursor:"pointer",fontSize:14,color:"#555"}}>ביטול</button>
          </div>
        </Overlay>
      )}

      {editImgCtx?.target==="card"&&form.cardImage&&(
        <ImageEditor src={form.cardImage} type={form.cardImageType} onSave={(b64,mt)=>{setForm(f=>({...f,cardImage:b64,cardImageType:mt}));setEditImgCtx(null);}} onClose={()=>setEditImgCtx(null)}/>
      )}
      {editImgCtx?.target==="prod"&&(()=>{
        const idx=editImgCtx.idx,img=prodForm.images?.[idx];
        if(!img)return null;
        return(<ImageEditor src={img.data} type={img.type} onSave={(b64,mt)=>{setProdForm(f=>{const imgs=[...f.images];imgs[idx]={data:b64,type:mt};return{...f,images:imgs};});setEditImgCtx(null);}} onClose={()=>setEditImgCtx(null)}/>);
      })()}
    </div>
  );
}