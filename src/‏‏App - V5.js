import { useState, useEffect, useRef, useCallback } from "react";

/* ── City → Province map ── */
const CITY_PROVINCE_MAP = {
  "Langfang":"Hebei","Bazhou":"Hebei","Anji":"Zhejiang","Foshan":"Guangdong",
  "Huizhou":"Guangdong","Shenzhen":"Guangdong","Luoyang":"Henan","Shuyang":"Jiangsu",
  "Suzhou":"Jiangsu","Qingdao":"Shandong","Dezhou":"Shandong","Tianjin":"Tianjin",
  "Fuding":"Fujian","Zhangzhou":"Fujian","Fuzhou":"Fujian","Ganzhou":"Jiangxi"
};
const CITIES = Object.keys(CITY_PROVINCE_MAP);
const PROVINCES = ["Hebei","Zhejiang","Guangdong","Shandong","Henan","Jiangsu","Jiangxi","Fujian","Tianjin","Sichuan","אחר"];
const FIELDS_OF_WORK = ["פלסטיק","עץ","ברזל","מרופדים","אחר"];

/* ── Helpers ── */
function fileToBase64(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(file);});}
function todayStr(){return new Date().toISOString().slice(0,10);}
function todayKey(){return new Date().toISOString().slice(0,10);}

async function callClaude(prompt,b64,mt){
  const content=[];
  if(b64) content.push({type:"image",source:{type:"base64",media_type:mt||"image/jpeg",data:b64}});
  content.push({type:"text",text:prompt});
  const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content}]})});
  const d=await res.json();
  return (d.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n");
}

/* ── Stars ── */
function Stars({value,onChange}){
  const [hover,setHover]=useState(0);
  return(<div style={{display:"flex",gap:3}}>{[1,2,3,4,5].map(i=>(
    <span key={i} onClick={()=>onChange&&onChange(i)} onMouseEnter={()=>onChange&&setHover(i)} onMouseLeave={()=>onChange&&setHover(0)}
      style={{fontSize:24,cursor:onChange?"pointer":"default",color:(hover||value)>=i?"#f59e0b":"#d1d5db",lineHeight:1,userSelect:"none"}}>★</span>
  ))}</div>);
}

/* ── City autocomplete ── */
function CityInput({value,onChange,onCitySelect}){
  const [show,setShow]=useState(false);
  const [q,setQ]=useState(value||"");
  useEffect(()=>setQ(value||""),[value]);
  const matches=q.length>0?CITIES.filter(c=>c.toLowerCase().includes(q.toLowerCase())):[];
  return(
    <div style={{position:"relative"}}>
      <input value={q} onChange={e=>{setQ(e.target.value);onChange(e.target.value);setShow(true);}}
        onBlur={()=>setTimeout(()=>setShow(false),150)}
        style={{width:"100%",boxSizing:"border-box",padding:"9px 11px",fontSize:14,border:"none",outline:"none",background:"transparent",color:"#111",fontFamily:"inherit"}}
        placeholder="הקלד או בחר עיר"/>
      {show&&matches.length>0&&(
        <div style={{position:"absolute",top:"100%",right:0,left:0,background:"#fff",border:"1.5px solid rgba(0,0,0,0.14)",borderRadius:8,zIndex:100,maxHeight:160,overflowY:"auto",boxShadow:"0 4px 12px rgba(0,0,0,0.1)"}}>
          {matches.map(c=>(
            <div key={c} onClick={()=>{setQ(c);setShow(false);onCitySelect(c);}}
              style={{padding:"8px 12px",cursor:"pointer",fontSize:14,borderBottom:"0.5px solid rgba(0,0,0,0.07)"}}
              onMouseEnter={e=>e.currentTarget.style.background="#f0f7ff"}
              onMouseLeave={e=>e.currentTarget.style.background=""}>
              {c} <span style={{fontSize:12,color:"#888"}}>· {CITY_PROVINCE_MAP[c]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── MultiSelect with "אחר" free text ── */
function MultiSelect({options,value=[],onChange}){
  const [otherText,setOtherText]=useState(()=>{
    const found=value.find(v=>!options.slice(0,-1).includes(v)&&v!=="אחר");
    return found||"";
  });
  const hasOther=value.includes("אחר")||value.some(v=>!options.includes(v));
  const toggle=opt=>{
    if(opt==="אחר"){
      if(hasOther){onChange(value.filter(v=>options.slice(0,-1).includes(v)));setOtherText("");}
      else onChange([...value.filter(v=>options.slice(0,-1).includes(v)),"אחר"]);
    } else {
      if(value.includes(opt)) onChange(value.filter(v=>v!==opt));
      else onChange([...value.filter(v=>v!=="אחר"&&!(!options.includes(v))),opt,...(hasOther?["אחר"]:[])]);
    }
  };
  const coreSelected=v=>options.slice(0,-1).includes(v)&&value.includes(v);
  return(
    <div style={{padding:"10px"}}>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:hasOther?10:0}}>
        {options.map(opt=>{
          const sel=opt==="אחר"?hasOther:coreSelected(opt);
          return(<button key={opt} onClick={()=>toggle(opt)}
            style={{padding:"6px 14px",borderRadius:20,border:"1.5px solid",borderColor:sel?"#1d4ed8":"rgba(0,0,0,0.18)",background:sel?"#1d4ed8":"#fff",color:sel?"#fff":"#444",fontSize:13,cursor:"pointer",fontWeight:sel?500:400}}>{opt}</button>);
        })}
      </div>
      {hasOther&&(
        <input value={otherText} onChange={e=>{setOtherText(e.target.value);onChange([...value.filter(v=>options.slice(0,-1).includes(v)),"אחר",e.target.value].filter((v,i,a)=>v!=="אחר"||i===a.indexOf("אחר")));}}
          placeholder="הקלד תחום..." style={{width:"100%",boxSizing:"border-box",marginTop:6,padding:"7px 10px",fontSize:13,borderRadius:8,border:"1.5px solid rgba(0,0,0,0.18)",outline:"none",background:"#f8f8f8"}}/>
      )}
    </div>
  );
}

/* ── Province select with free text for אחר ── */
function ProvinceSelect({value,onChange}){
  const isOther=value&&!PROVINCES.slice(0,-1).includes(value);
  const [otherText,setOtherText]=useState(isOther?value:"");
  const selVal=isOther?"אחר":value;
  return(
    <div>
      <select value={selVal} onChange={e=>{if(e.target.value==="אחר"){onChange("אחר");}else{onChange(e.target.value);setOtherText("");}}}
        style={{width:"100%",boxSizing:"border-box",padding:"9px 11px",fontSize:14,border:"none",outline:"none",background:"transparent",color:"#111",fontFamily:"inherit"}}>
        <option value="">-- בחר מחוז --</option>
        {PROVINCES.map(p=><option key={p} value={p}>{p}</option>)}
      </select>
      {selVal==="אחר"&&(
        <input value={otherText} onChange={e=>{setOtherText(e.target.value);onChange(e.target.value);}}
          placeholder="הקלד מחוז..." style={{width:"100%",boxSizing:"border-box",padding:"8px 11px",fontSize:13,border:"none",borderTop:"1px solid rgba(0,0,0,0.1)",outline:"none",background:"#f8f8f8",color:"#111"}}/>
      )}
    </div>
  );
}

/* ── File/Camera button ── */
function MediaButton({label,accept,capture,onFile,style={}}){
  const uid=useRef("f"+Math.random().toString(36).slice(2));
  return(
    <label htmlFor={uid.current} style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:13,padding:"8px 14px",borderRadius:8,border:"1.5px solid rgba(0,0,0,0.18)",background:"#fff",cursor:"pointer",color:"#333",fontWeight:500,...style}}>
      {label}
      <input id={uid.current} type="file" accept={accept} capture={capture||undefined} style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)onFile(f);e.target.value="";}}/>
    </label>
  );
}

/* ── Field wrapper ── */
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

/* ── Overlay ── */
function Overlay({children,onClose}){
  return(
    <div onClick={e=>{if(e.target===e.currentTarget)onClose();}}
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
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
  const doRedraw=useCallback((removeBg)=>{if(origRef.current)redrawImg(origRef.current,rotate,brightness,contrast,saturation,removeBg);},[rotate,brightness,contrast,saturation]);
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
  const handleSave=()=>{const cvs=canvasRef.current;onSave(cvs.toDataURL("image/png").split(",")[1],"image/png");};
  const slRow=(lbl,val,set)=>(
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
      <span style={{width:70,fontSize:13,color:"#555",flexShrink:0}}>{lbl}</span>
      <input type="range" min={0} max={200} value={val} onChange={e=>set(+e.target.value)} style={{flex:1}}/>
      <span style={{width:36,fontSize:12,textAlign:"right",color:"#666"}}>{val}%</span>
    </div>
  );
  return(
    <Overlay onClose={onClose}>
      <div style={{fontWeight:600,fontSize:16,marginBottom:14,color:"#222"}}>עריכת תמונה</div>
      <canvas ref={canvasRef} style={{width:"100%",borderRadius:10,border:"1px solid rgba(0,0,0,0.12)",marginBottom:14,display:"block",background:"repeating-conic-gradient(#ccc 0% 25%,#fff 0% 50%) 0 0/16px 16px"}}/>
      {slRow("בהירות",brightness,setBrightness)}{slRow("ניגודיות",contrast,setContrast)}{slRow("רוויה",saturation,setSaturation)}
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontSize:13,color:"#555"}}>סיבוב:</span>
        {[0,90,180,270].map(r=>(
          <button key={r} onClick={()=>{setRotate(r);setTimeout(()=>redrawImg(origRef.current,r,brightness,contrast,saturation,bgRemoved),0);}}
            style={{padding:"5px 10px",borderRadius:7,border:"1.5px solid",borderColor:rotate===r?"#3b82f6":"rgba(0,0,0,0.2)",background:rotate===r?"#eff6ff":"transparent",color:rotate===r?"#1d4ed8":"#444",cursor:"pointer",fontSize:13}}>{r}°</button>
        ))}
      </div>
      <button onClick={handleRemoveBg} disabled={removing||bgRemoved}
        style={{width:"100%",padding:"9px",borderRadius:9,border:"1.5px solid rgba(0,0,0,0.15)",background:"#fff",cursor:"pointer",fontSize:13,marginBottom:10,color:"#333",fontWeight:500}}>
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
    const req=indexedDB.open("suppliers_db_v6",1);
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

const EMPTY_FORM={name:"",contact:"",email:"",city:"",province:"",fields:[],description:"",rating:0,cardImage:"",cardImageType:"",source:"",date:todayStr()};
const EMPTY_PROD={description:"",images:[],rating:0};

/* ── Image strip (multi-image) ── */
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

export default function App(){
  const db=useDB();
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
  const [editImgCtx,setEditImgCtx]=useState(null); // {target:"card"|"prod", idx?:number}
  const [defaultSource,setDefaultSource]=useState("");
  const [importMsg,setImportMsg]=useState("");
  const importSupRef=useRef();
  const importImgRef=useRef();

  const loadAll=useCallback(async()=>{
    if(!db.ready)return;
    setSuppliers(await db.getAllSuppliers());
    const srcMeta=await db.getMeta("defaultSource_"+todayKey()).catch(()=>null);
    if(srcMeta?.value)setDefaultSource(srcMeta.value);
  },[db.ready]);

  useEffect(()=>{loadAll();},[loadAll]);
  const loadProducts=async sid=>{if(db.ready&&sid)setProducts(await db.getProductsBySupplier(sid));};
  const sf=(k,v)=>setForm(f=>({...f,[k]:v}));

  const saveDefaultSource=async val=>{
    setDefaultSource(val);
    await db.setMeta("defaultSource_"+todayKey(),val);
  };

  const handleCardFile=async file=>{
    setExtracting(true);
    try{
      const b64=await fileToBase64(file),mt=file.type;
      setForm(f=>({...f,cardImage:b64,cardImageType:mt}));
      const txt=await callClaude("Business card image. Extract: name (company), contact (person name), email, city, province (Chinese province in English). Return ONLY valid JSON, no markdown.",b64,mt);
      try{
        const p=JSON.parse(txt.replace(/```json|```/g,"").trim());
        const city=p.city?.trim()||"";
        const autoProvince=CITY_PROVINCE_MAP[city]||"";
        const finalProv=autoProvince||(p.province?.trim()||"");
        setForm(f=>({...f,name:p.name||f.name,contact:p.contact||f.contact,email:p.email||f.email,city:city||f.city,province:finalProv||f.province}));
      }catch(_){}
    }catch(e){console.error(e);}
    setExtracting(false);
  };

  const validate=()=>{const e={};if(!form.name.trim())e.name="שם ספק הוא שדה חובה";setErrors(e);return!Object.keys(e).length;};

  const handleSave=async()=>{
    if(!validate())return;
    setSaving(true);
    try{
      if(form.source)await saveDefaultSource(form.source);
      if(selSup)await db.updateSupplier({...form,id:selSup.id});
      else{
        const id=await db.addSupplier(form);
        const all=await db.getAllSuppliers();
        const n=all.find(s=>s.id===id)||all[all.length-1];
        setSelSup(n);await loadProducts(n?.id);
      }
      await loadAll();
      if(selSup)await loadProducts(selSup.id);
    }catch(e){console.error(e);}
    setSaving(false);
  };

  const openEdit=async s=>{
    setSelSup(s);
    setForm({name:s.name||"",contact:s.contact||"",email:s.email||"",city:s.city||"",province:s.province||"",fields:s.fields||[],description:s.description||"",rating:s.rating||0,cardImage:s.cardImage||"",cardImageType:s.cardImageType||"",source:s.source||"",date:s.date||todayStr()});
    setErrors({});await loadProducts(s.id);setView("form");
  };

  const handleDelSup=async id=>{if(!confirm("למחוק ספק זה?"))return;await db.deleteSupplier(id);await loadAll();if(selSup?.id===id){setView("list");setSelSup(null);}};
  const openProdModal=p=>{setEditProd(p||null);setProdForm(p?{description:p.description||"",images:p.images||[],rating:p.rating||0}:{...EMPTY_PROD,images:[]});setProdModal(true);};
  const handleSaveProd=async()=>{
    const sid=selSup?.id;if(!sid)return;
    const data={...prodForm,supplierId:sid};
    if(editProd)await db.updateProduct({...data,id:editProd.id});
    else await db.addProduct(data);
    await loadProducts(sid);setProdModal(false);
  };
  const handleDelProd=async id=>{if(!confirm("למחוק מוצר זה?"))return;await db.deleteProduct(id);await loadProducts(selSup.id);};

  /* ── Export CSV ── */
  const exportCSV=async()=>{
    const allS=await db.getAllSuppliers(),allP=await db.getAllProducts();
    let csv="\uFEFFאינדקס,שם ספק,מקור,תאריך,איש קשר,אימייל,עיר,מחוז,תחום עיסוק,תיאור,דירוג\n";
    allS.forEach(s=>{csv+=[s.id,`"${(s.name||"").replace(/"/g,'""')}"`,`"${(s.source||"").replace(/"/g,'""')}"`,s.date||"",`"${(s.contact||"").replace(/"/g,'""')}"`,s.email||"",s.city||"",s.province||"",`"${(s.fields||[]).join(", ")}"`,`"${(s.description||"").replace(/"/g,'""')}"`,s.rating||0].join(",")+"\n";});
    csv+="\n\nמוצרים\nאינדקס מוצר,ספק ID,תיאור,דירוג\n";
    allP.forEach(p=>{csv+=[p.id,p.supplierId,`"${(p.description||"").replace(/"/g,'""')}"`,p.rating||0].join(",")+"\n";});
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}));a.download="suppliers.csv";a.click();
  };

  /* ── Download all images as ZIP-like blob ── */
  const downloadImages=async()=>{
    const allS=await db.getAllSuppliers();
    const allP=await db.getAllProducts();
    // collect all images
    const links=[];
    allS.forEach(s=>{
      if(s.cardImage){
        const ext=s.cardImageType?.includes("png")?"png":"jpg";
        links.push({name:`${s.id}.card.${ext}`,data:s.cardImage,type:s.cardImageType||"image/jpeg"});
      }
    });
    allP.forEach(p=>{
      (p.images||[]).forEach((img,i)=>{
        const ext=img.type?.includes("png")?"png":"jpg";
        links.push({name:`${p.supplierId}.${p.id}.${i+1}.${ext}`,data:img.data,type:img.type||"image/jpeg"});
      });
    });
    if(links.length===0){alert("אין תמונות להורדה");return;}
    // download sequentially
    for(const lnk of links){
      await new Promise(res=>{
        const a=document.createElement("a");
        a.href=`data:${lnk.type};base64,${lnk.data}`;
        a.download=lnk.name;a.click();
        setTimeout(res,200);
      });
    }
  };

  /* ── Import suppliers from CSV/Excel ── */
  const importSuppliers=async file=>{
    setImportMsg("טוען...");
    try{
      const text=await file.text();
      const lines=text.split("\n").filter(l=>l.trim());
      let start=0;
      for(let i=0;i<lines.length;i++){if(lines[i].includes("אינדקס")||lines[i].includes("index")||lines[i].toLowerCase().includes("name")){start=i+1;break;}}
      let count=0;
      for(let i=start;i<lines.length;i++){
        const cols=lines[i].match(/(".*?"|[^,]+)(?=,|$)/g)||[];
        const clean=cols.map(c=>c.replace(/^"|"$/g,"").trim());
        if(clean.length<2||!clean[1])continue;
        await db.addSupplier({name:clean[1]||"",source:clean[2]||"",date:clean[3]||todayStr(),contact:clean[4]||"",email:clean[5]||"",city:clean[6]||"",province:clean[7]||"",fields:(clean[8]||"").split(",").map(s=>s.trim()).filter(Boolean),description:clean[9]||"",rating:parseInt(clean[10])||0,cardImage:"",cardImageType:""});
        count++;
      }
      await loadAll();
      setImportMsg(`יובאו ${count} ספקים בהצלחה`);
    }catch(e){setImportMsg("שגיאה בייבוא: "+e.message);}
    setTimeout(()=>setImportMsg(""),4000);
  };

  /* ── Import images by naming convention supplierId.productId.imgIdx ── */
  const importImages=async files=>{
    setImportMsg("מייבא תמונות...");
    let count=0;
    for(const file of Array.from(files)){
      const name=file.name.replace(/\.[^.]+$/,""); // strip extension
      const parts=name.split(".");
      if(parts.length===1){
        // card image: supplierId
        const sid=parseInt(parts[0]);
        if(!isNaN(sid)){
          const all=await db.getAllSuppliers();
          const sup=all.find(s=>s.id===sid);
          if(sup){const b64=await fileToBase64(file);await db.updateSupplier({...sup,cardImage:b64,cardImageType:file.type});count++;}
        }
      } else if(parts.length>=2){
        const sid=parseInt(parts[0]),pid=parseInt(parts[1]);
        if(!isNaN(sid)&&!isNaN(pid)){
          const allP=await db.getAllProducts();
          const prod=allP.find(p=>p.id===pid&&p.supplierId===sid);
          if(prod){
            const b64=await fileToBase64(file);
            const imgs=[...(prod.images||[]),{data:b64,type:file.type}];
            await db.updateProduct({...prod,images:imgs});count++;
          }
        }
      }
    }
    await loadAll();
    setImportMsg(`יובאו ${count} תמונות`);
    setTimeout(()=>setImportMsg(""),4000);
  };

  const filtered=suppliers.filter(s=>{
    const q=search.toLowerCase();
    const matchSearch=!q||s.name?.toLowerCase().includes(q)||s.contact?.toLowerCase().includes(q);
    const matchProv=!filterProvince||s.province===filterProvince;
    const matchField=!filterField||(s.fields||[]).includes(filterField);
    return matchSearch&&matchProv&&matchField;
  });

  const allUsedProvinces=[...new Set(suppliers.map(s=>s.province).filter(Boolean))].sort();
  const allUsedFields=[...new Set(suppliers.flatMap(s=>s.fields||[]))].sort();

  const card={background:"#fff",borderRadius:14,border:"1px solid rgba(0,0,0,0.1)",padding:"1.25rem",marginBottom:14};
  const btnPrimary={padding:"10px",borderRadius:9,border:"none",background:"#1d4ed8",cursor:"pointer",fontSize:14,fontWeight:500,color:"#fff"};
  const btnOut={padding:"7px 13px",borderRadius:8,border:"1.5px solid rgba(0,0,0,0.15)",background:"#fff",cursor:"pointer",color:"#333",fontWeight:500,fontSize:13};

  if(!db.ready)return <div style={{padding:"2rem",textAlign:"center",color:"#888"}}>טוען...</div>;

  return(
    <div dir="rtl" style={{fontFamily:"var(--font-sans)",padding:"0.75rem",maxWidth:560,margin:"0 auto",background:"var(--color-background-tertiary)",minHeight:"100vh"}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,paddingTop:4}}>
        {view!=="list"
          ?<button onClick={()=>{setView("list");setSelSup(null);}} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#555",padding:0,fontWeight:500}}>← רשימת ספקים</button>
          :<span style={{fontSize:19,fontWeight:600}}>ניהול ספקים</span>}
        {view==="list"&&(
          <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
            <button onClick={exportCSV} style={btnOut}>ייצוא CSV</button>
            <button onClick={downloadImages} style={btnOut}>הורד תמונות</button>
            <button onClick={()=>importSupRef.current.click()} style={btnOut}>ייבוא CSV</button>
            <button onClick={()=>importImgRef.current.click()} style={btnOut}>ייבוא תמונות</button>
            <button onClick={()=>{setForm({...EMPTY_FORM,source:defaultSource,date:todayStr()});setSelSup(null);setErrors({});setView("form");}} style={{...btnPrimary,padding:"7px 13px",fontSize:13}}>+ ספק חדש</button>
          </div>
        )}
      </div>

      <input ref={importSupRef} type="file" accept=".csv,.xlsx,.xls" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)importSuppliers(f);e.target.value="";}}/>
      <input ref={importImgRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>{if(e.target.files?.length)importImages(e.target.files);e.target.value="";}}/>
      {importMsg&&<div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:8,padding:"8px 14px",marginBottom:10,fontSize:13,color:"#1d4ed8",fontWeight:500}}>{importMsg}</div>}

      {/* LIST */}
      {view==="list"&&<>
        <div style={{...card,padding:"12px 14px",marginBottom:12}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="חיפוש לפי שם..."
            style={{width:"100%",border:"none",outline:"none",fontSize:14,background:"transparent",marginBottom:10,display:"block"}}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <select value={filterProvince} onChange={e=>setFilterProvince(e.target.value)}
              style={{fontSize:13,padding:"7px 8px",borderRadius:8,border:"1.5px solid rgba(0,0,0,0.14)",background:"#f8f7f5",color:"#333",outline:"none"}}>
              <option value="">כל המחוזות</option>
              {allUsedProvinces.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            <select value={filterField} onChange={e=>setFilterField(e.target.value)}
              style={{fontSize:13,padding:"7px 8px",borderRadius:8,border:"1.5px solid rgba(0,0,0,0.14)",background:"#f8f7f5",color:"#333",outline:"none"}}>
              <option value="">כל תחומי העיסוק</option>
              {(allUsedFields.length?allUsedFields:FIELDS_OF_WORK).map(f=><option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          {(search||filterProvince||filterField)&&<button onClick={()=>{setSearch("");setFilterProvince("");setFilterField("");}} style={{marginTop:8,fontSize:12,color:"#2563eb",background:"none",border:"none",cursor:"pointer",padding:0,fontWeight:500}}>✕ נקה סינון</button>}
        </div>
        {filtered.length===0&&<div style={{textAlign:"center",color:"#888",padding:"2.5rem",background:"#fff",borderRadius:14,border:"1px solid rgba(0,0,0,0.08)"}}>לא נמצאו ספקים</div>}
        {filtered.map(s=>(
          <div key={s.id} style={{...card,display:"flex",alignItems:"center",gap:12,padding:"12px 14px"}}>
            {s.cardImage
              ?<img src={`data:${s.cardImageType};base64,${s.cardImage}`} style={{width:46,height:46,borderRadius:9,objectFit:"cover",flexShrink:0,border:"1px solid rgba(0,0,0,0.1)"}}/>
              :<div style={{width:46,height:46,borderRadius:9,background:"#dbeafe",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:600,color:"#1d4ed8",flexShrink:0}}>{(s.name||"?")[0]}</div>}
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,fontSize:15,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.name}</div>
              <div style={{fontSize:12,color:"#888",marginBottom:2}}>{[s.contact,s.city,s.province].filter(Boolean).join(" · ")}</div>
              {(s.fields||[]).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:3,marginBottom:2}}>{s.fields.map(f=><span key={f} style={{fontSize:11,padding:"2px 7px",borderRadius:20,background:"#eff6ff",color:"#1d4ed8",fontWeight:500}}>{f}</span>)}</div>}
              <Stars value={s.rating}/>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0}}>
              <button onClick={()=>openEdit(s)} style={btnOut}>עריכה</button>
              <button onClick={()=>handleDelSup(s.id)} style={{...btnOut,borderColor:"rgba(220,38,38,0.3)",color:"#dc2626"}}>מחק</button>
            </div>
          </div>
        ))}
      </>}

      {/* FORM */}
      {view==="form"&&<>
        <div style={card}>
          <div style={{fontSize:16,fontWeight:600,marginBottom:16,paddingBottom:12,borderBottom:"1px solid rgba(0,0,0,0.08)"}}>{selSup?"עריכת ספק":"ספק חדש"}</div>

          {/* 1. כרטיס ביקור */}
          <div style={{marginBottom:18}}>
            <label style={{fontSize:12,fontWeight:500,color:"#666",display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.04em"}}>כרטיס ביקור</label>
            <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",padding:"12px",background:"#f8f7f5",borderRadius:10,border:"1.5px dashed rgba(0,0,0,0.15)"}}>
              {form.cardImage&&(
                <div style={{position:"relative",flexShrink:0}}>
                  <img src={`data:${form.cardImageType};base64,${form.cardImage}`} style={{width:80,height:56,objectFit:"cover",borderRadius:8,border:"1px solid rgba(0,0,0,0.1)",display:"block"}}/>
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

          {/* 2. מקור ספק */}
          <Field label="מקור ספק">
            <input style={IS} value={form.source} onChange={e=>{sf("source",e.target.value);}} onBlur={e=>{if(e.target.value)saveDefaultSource(e.target.value);}} placeholder="מאיפה הגיע הספק?"/>
          </Field>

          {/* 3. תאריך */}
          <Field label="תאריך">
            <input type="date" style={IS} value={form.date} onChange={e=>sf("date",e.target.value)}/>
          </Field>

          <Field label="שם ספק *" error={errors.name}>
            <input style={IS} value={form.name} onChange={e=>sf("name",e.target.value)} placeholder="שם החברה או הספק"/>
          </Field>
          <Field label="שם איש קשר">
            <input style={IS} value={form.contact} onChange={e=>sf("contact",e.target.value)} placeholder="שם מלא"/>
          </Field>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Field label="אימייל">
              <input style={IS} value={form.email} onChange={e=>sf("email",e.target.value)} placeholder="email@example.com" type="email"/>
            </Field>
            <Field label="עיר">
              <CityInput value={form.city} onChange={v=>sf("city",v)} onCitySelect={c=>{sf("city",c);const p=CITY_PROVINCE_MAP[c];if(p)sf("province",p);}}/>
            </Field>
          </div>
          <Field label="מחוז">
            <ProvinceSelect value={form.province} onChange={v=>sf("province",v)}/>
          </Field>
          <Field label="תחום עיסוק (בחירה מרובה)">
            <MultiSelect options={FIELDS_OF_WORK} value={form.fields||[]} onChange={v=>sf("fields",v)}/>
          </Field>
          <Field label="תיאור">
            <textarea style={{...IS,minHeight:80,resize:"vertical"}} value={form.description} onChange={e=>sf("description",e.target.value)} placeholder="תיאור כללי של הספק"/>
          </Field>
          <div style={{marginBottom:18}}>
            <label style={{fontSize:12,fontWeight:500,color:"#666",display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.04em"}}>דירוג ספק</label>
            <Stars value={form.rating} onChange={v=>sf("rating",v)}/>
          </div>
          <button onClick={handleSave} disabled={saving} style={{...btnPrimary,width:"100%"}}>{saving?"שומר...":"שמור ספק"}</button>
        </div>

        {/* Products */}
        {selSup&&(
          <div style={card}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,paddingBottom:12,borderBottom:"1px solid rgba(0,0,0,0.08)"}}>
              <span style={{fontSize:16,fontWeight:600}}>מוצרים של הספק</span>
              <button onClick={()=>openProdModal()} style={{...btnPrimary,fontSize:13,padding:"7px 14px"}}>+ הוסף מוצר</button>
            </div>
            {products.length===0&&<div style={{textAlign:"center",color:"#aaa",fontSize:14,padding:"1.5rem",background:"#f8f7f5",borderRadius:10}}>אין מוצרים עדיין</div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {products.map((p,pi)=>{
                const firstImg=p.images?.[0];
                return(
                  <div key={p.id} style={{border:"1px solid rgba(0,0,0,0.1)",borderRadius:12,overflow:"hidden",background:"#fafaf9"}}>
                    {firstImg
                      ?<img src={`data:${firstImg.type};base64,${firstImg.data}`} style={{width:"100%",height:110,objectFit:"cover",display:"block"}}/>
                      :<div style={{height:70,background:"#f0eeec",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#bbb"}}>אין תמונה</div>}
                    <div style={{padding:"10px"}}>
                      <div style={{fontSize:11,color:"#aaa",marginBottom:2}}>#{p.id} · {p.images?.length||0} תמונות</div>
                      <div style={{fontSize:13,marginBottom:6,minHeight:28,lineHeight:1.4}}>{p.description||"ללא תיאור"}</div>
                      <div style={{marginBottom:8,transform:"scale(0.82)",transformOrigin:"right"}}><Stars value={p.rating||0}/></div>
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

      {/* Product Modal */}
      {prodModal&&(
        <Overlay onClose={()=>setProdModal(false)}>
          <div style={{fontWeight:600,fontSize:16,marginBottom:18,paddingBottom:12,borderBottom:"1px solid rgba(0,0,0,0.08)",color:"#111"}}>{editProd?"עריכת מוצר":"הוספת מוצר חדש"}</div>
          <div style={{marginBottom:16}}>
            <label style={{fontSize:12,fontWeight:500,color:"#666",display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.04em"}}>תמונות מוצר</label>
            <div style={{padding:"12px",background:"#f0eeec",borderRadius:10,border:"1.5px dashed rgba(0,0,0,0.15)"}}>
              <ImageStrip
                images={prodForm.images||[]}
                onAdd={img=>setProdForm(f=>({...f,images:[...(f.images||[]),img]}))}
                onEdit={idx=>setEditImgCtx({target:"prod",idx})}
                onDelete={idx=>setProdForm(f=>({...f,images:f.images.filter((_,i)=>i!==idx)}))}
              />
            </div>
          </div>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:12,fontWeight:500,color:"#666",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.04em"}}>תיאור מוצר</label>
            <div style={{background:"#fff",borderRadius:10,border:"1.5px solid rgba(0,0,0,0.14)",overflow:"hidden"}}>
              <textarea style={{...IS,minHeight:80,resize:"vertical"}} value={prodForm.description} onChange={e=>setProdForm(f=>({...f,description:e.target.value}))} placeholder="תאר את המוצר..."/>
            </div>
          </div>
          <div style={{marginBottom:20}}>
            <label style={{fontSize:12,fontWeight:500,color:"#666",display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.04em"}}>דירוג מוצר</label>
            <Stars value={prodForm.rating||0} onChange={v=>setProdForm(f=>({...f,rating:v}))}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={handleSaveProd} style={{...btnPrimary,flex:1}}>שמור מוצר</button>
            <button onClick={()=>setProdModal(false)} style={{flex:1,padding:"10px",borderRadius:9,border:"1.5px solid rgba(0,0,0,0.15)",background:"transparent",cursor:"pointer",fontSize:14,color:"#555"}}>ביטול</button>
          </div>
        </Overlay>
      )}

      {/* Image Editor */}
      {editImgCtx?.target==="card"&&form.cardImage&&(
        <ImageEditor src={form.cardImage} type={form.cardImageType}
          onSave={(b64,mt)=>{setForm(f=>({...f,cardImage:b64,cardImageType:mt}));setEditImgCtx(null);}}
          onClose={()=>setEditImgCtx(null)}/>
      )}
      {editImgCtx?.target==="prod"&&(()=>{
        const idx=editImgCtx.idx;
        const img=prodForm.images?.[idx];
        if(!img)return null;
        return(
          <ImageEditor src={img.data} type={img.type}
            onSave={(b64,mt)=>{setProdForm(f=>{const imgs=[...f.images];imgs[idx]={data:b64,type:mt};return{...f,images:imgs};});setEditImgCtx(null);}}
            onClose={()=>setEditImgCtx(null)}/>
        );
      })()}
    </div>
  );
}