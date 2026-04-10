import { useState, useEffect, useRef, useCallback } from "react";

/* ── Supabase config (env vars) ── */
const SB_URL = process.env.REACT_APP_SUPABASE_URL || "https://wphhfimcbgmnrqfucvlg.supabase.co";
const SB_KEY = process.env.REACT_APP_SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndwaGhmaW1jYmdtbnJxZnVjdmxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTc0MzUsImV4cCI6MjA5MDk5MzQzNX0.24i3JzmK7z6JGWV_k19lIkw6_Z5gq5ufXEXRrpGzFtw";
const BUCKET = "suppliers-files";

/* ── Supabase REST ── */
const sbH = (extra={}) => ({"Content-Type":"application/json","apikey":SB_KEY,"Authorization":`Bearer ${SB_KEY}`,"Prefer":"return=representation",...extra});
const sb = {
  async select(table,query=""){const r=await fetch(`${SB_URL}/rest/v1/${table}?${query}&order=id.asc`,{headers:sbH({"Prefer":""})});if(!r.ok)throw new Error(await r.text());return r.json();},
  async insert(table,data){const r=await fetch(`${SB_URL}/rest/v1/${table}`,{method:"POST",headers:sbH(),body:JSON.stringify(data)});if(!r.ok)throw new Error(await r.text());const d=await r.json();return Array.isArray(d)?d[0]:d;},
  async update(table,id,data){const r=await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`,{method:"PATCH",headers:sbH(),body:JSON.stringify(data)});if(!r.ok)throw new Error(await r.text());const d=await r.json();return Array.isArray(d)?d[0]:d;},
  async delete(table,id){const r=await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`,{method:"DELETE",headers:sbH({"Prefer":""})});if(!r.ok)throw new Error(await r.text());},
  async upsertMeta(key,value){const r=await fetch(`${SB_URL}/rest/v1/app_meta`,{method:"POST",headers:sbH({"Prefer":"resolution=merge-duplicates,return=representation"}),body:JSON.stringify({key,value})});if(!r.ok)throw new Error(await r.text());},
  async getMeta(key){const r=await fetch(`${SB_URL}/rest/v1/app_meta?key=eq.${encodeURIComponent(key)}`,{headers:sbH({"Prefer":""})});if(!r.ok)return null;const d=await r.json();return d?.[0]?.value??null;},
  async uploadFile(path,blob,ct){const r=await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`,{method:"POST",headers:{"apikey":SB_KEY,"Authorization":`Bearer ${SB_KEY}`,"Content-Type":ct||"image/jpeg","x-upsert":"true"},body:blob});if(!r.ok)throw new Error(await r.text());return`${SB_URL}/storage/v1/object/public/${BUCKET}/${path}`;},
  /* ── NEW: delete a single file from storage by its public URL or path ── */
  async deleteFile(urlOrPath){
    try{
      const path = urlOrPath.includes(`/object/public/${BUCKET}/`)
        ? urlOrPath.split(`/object/public/${BUCKET}/`)[1]
        : urlOrPath;
      await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`,{
        method:"DELETE",
        headers:{"apikey":SB_KEY,"Authorization":`Bearer ${SB_KEY}`}
      });
    }catch(e){console.warn("deleteFile failed:",urlOrPath,e);}
  },
};

/* ── Constants ── */
const CPM={"Langfang":"Hebei","Bazhou":"Hebei","Anji":"Zhejiang","Foshan":"Guangdong","Huizhou":"Guangdong","Shenzhen":"Guangdong","Luoyang":"Henan","Shuyang":"Jiangsu","Suzhou":"Jiangsu","Qingdao":"Shandong","Dezhou":"Shandong","Tianjin":"Tianjin","Fuding":"Fujian","Zhangzhou":"Fujian","Fuzhou":"Fujian","Ganzhou":"Jiangxi","Chongqing":"Chongqing"};
const CITIES=Object.keys(CPM);
const PROVINCES=["Hebei","Zhejiang","Guangdong","Shandong","Henan","Jiangsu","Jiangxi","Fujian","Tianjin","Sichuan","אחר"];
const FIELDS_OF_WORK=["פלסטיק","עץ","ברזל","שולחנות","ריהוט ביתי","מרופדים","אחר"];

/* ── Helpers ── */
function getProvince(city){if(!city)return"";const k=CITIES.find(c=>c.toLowerCase()===city.trim().toLowerCase());return k?CPM[k]:"";}
function fileToBase64(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(file);});}
function base64ToBlob(b64,type){const b=atob(b64),arr=new Uint8Array(b.length);for(let i=0;i<b.length;i++)arr[i]=b.charCodeAt(i);return new Blob([arr],{type});}
function todayStr(){return new Date().toISOString().slice(0,10);}
function nowISO(){return new Date().toISOString();}
function dtLabel(){const n=new Date();return`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}_${String(n.getHours()).padStart(2,"0")}-${String(n.getMinutes()).padStart(2,"0")}`;}
function sanitize(s){return(s||"").replace(/[^a-zA-Z0-9א-ת\s\-_]/g,"").trim().replace(/\s+/g,"_").slice(0,40);}
function similarity(a,b){a=a.toLowerCase();b=b.toLowerCase();if(a===b)return 1;if(a.includes(b)||b.includes(a))return 0.9;return 0;}
function addPageNumber(doc, pageWidth, pageHeight) {
  const pageNum = doc.internal.getNumberOfPages();
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text(String(pageNum), pageWidth / 2, pageHeight - 6, { align: "center" });
}
function isHebrewText(text) {
  return /[\u0590-\u05FF]/.test(String(text || ""));
}
function rtl(text) {
  return String(text || "").split("").reverse().join("");
}
function formatFieldValue(label, value) {
  const str = String(value || "");
  const forceLtrLabels = ["טלפון", "אימייל", "תאריך", "מקור"];
  if (forceLtrLabels.includes(label)) return str;
  return isHebrewText(str) ? rtl(str) : str;
}

const PROVINCE_LABELS_HE = {
  Hebei:"חביי",Zhejiang:"ג׳ג׳יאנג",Guangdong:"גואנגדונג",Shandong:"שאנדונג",
  Henan:"חנאן",Jiangsu:"ג׳יאנגסו",Jiangxi:"ג׳יאנגשי",Fujian:"פוג׳יין",
  Tianjin:"טיינג׳ין",Sichuan:"סצ׳ואן",Chongqing:"צ'ונגצ'ינג","אחר":"אחר"
};
function getProvinceHebrew(province){return PROVINCE_LABELS_HE[province]||province||"אחר";}

const PROVINCE_COLORS = {
  Hebei:[29,78,216],Zhejiang:[5,150,105],Guangdong:[220,38,38],Shandong:[217,119,6],
  Henan:[124,58,237],Jiangsu:[8,145,178],Jiangxi:[190,24,93],Fujian:[22,163,74],
  Tianjin:[75,85,99],Sichuan:[234,88,12],"אחר":[100,116,139],default:[29,78,216]
};
function getProvinceColor(province){return PROVINCE_COLORS[province]||PROVINCE_COLORS.default;}

function loadTesseract(){
  return new Promise((resolve,reject)=>{
    if(window.Tesseract){resolve(window.Tesseract);return;}
    const s=document.createElement("script");
    s.src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    s.onload=()=>resolve(window.Tesseract);s.onerror=reject;document.head.appendChild(s);
  });
}
async function getImageDimensions(dataUrl){
  return new Promise((resolve,reject)=>{
    const img=new Image();img.onload=()=>resolve({width:img.naturalWidth,height:img.naturalHeight});img.onerror=reject;img.src=dataUrl;
  });
}
function fitRect(srcW,srcH,maxW,maxH){const ratio=Math.min(maxW/srcW,maxH/srcH);return{width:srcW*ratio,height:srcH*ratio};}
async function rotateImageDataUrl(dataUrl,angle){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      const sideways=angle%180!==0;
      const canvas=document.createElement("canvas");
      canvas.width=sideways?img.naturalHeight:img.naturalWidth;
      canvas.height=sideways?img.naturalWidth:img.naturalHeight;
      const ctx=canvas.getContext("2d");
      ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate((angle*Math.PI)/180);
      ctx.drawImage(img,-img.naturalWidth/2,-img.naturalHeight/2);
      resolve(canvas.toDataURL("image/jpeg",0.92));
    };
    img.onerror=reject;img.src=dataUrl;
  });
}
async function downscaleForOcr(dataUrl,maxSize=1200){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      let w=img.naturalWidth,h=img.naturalHeight;
      if(w>maxSize){h=Math.round((h*maxSize)/w);w=maxSize;}
      if(h>maxSize){w=Math.round((w*maxSize)/h);h=maxSize;}
      const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
      canvas.getContext("2d").drawImage(img,0,0,w,h);
      resolve(canvas.toDataURL("image/jpeg",0.85));
    };
    img.onerror=reject;img.src=dataUrl;
  });
}
function scoreOcrResult(text,confidence){
  const clean=String(text||"").trim();
  const letters=(clean.match(/[A-Za-z\u0590-\u05FF]/g)||[]).length;
  const digits=(clean.match(/[0-9]/g)||[]).length;
  const words=clean.split(/\s+/).filter(Boolean).length;
  return confidence+letters*1.5+digits*0.5+words*2;
}
async function autoOrientBusinessCard(base64,mimeType="image/jpeg"){
  const Tesseract=await loadTesseract();
  const originalDataUrl=`data:${mimeType};base64,${base64}`;
  const angles=[0,90,180,270];
  let best={angle:0,score:-Infinity,dataUrl:originalDataUrl,confidence:0,text:""};
  for(const angle of angles){
    try{
      const rotatedDataUrl=angle===0?originalDataUrl:await rotateImageDataUrl(originalDataUrl,angle);
      const ocrInput=await downscaleForOcr(rotatedDataUrl,1200);
      const result=await Tesseract.recognize(ocrInput,"eng");
      const text=result?.data?.text||"";
      const confidence=result?.data?.confidence||0;
      const score=scoreOcrResult(text,confidence);
      if(score>best.score)best={angle,score,dataUrl:rotatedDataUrl,confidence,text};
    }catch(_){}
  }
  return{angle:best.angle,base64:best.dataUrl.split(",")[1],mimeType:"image/jpeg",confidence:best.confidence,text:best.text};
}

/* ── Compress ── */
function compressImage(b64,srcType,quality=0.72){
  return new Promise(res=>{
    const img=new Image();
    img.onload=()=>{
      const MAX=1600;let w=img.naturalWidth,h=img.naturalHeight;
      if(w>MAX){h=Math.round(h*MAX/w);w=MAX;}if(h>MAX){w=Math.round(w*MAX/h);h=MAX;}
      const cvs=document.createElement("canvas");cvs.width=w;cvs.height=h;
      cvs.getContext("2d").drawImage(img,0,0,w,h);
      const data=cvs.toDataURL("image/jpeg",quality).split(",")[1];
      res({data,blob:base64ToBlob(data,"image/jpeg")});
    };
    img.src=`data:${srcType||"image/jpeg"};base64,${b64}`;
  });
}

/* ── Gemini ── */
async function callGemini(prompt,b64,mt,apiKey){
  const preferred=["gemini-2.5-flash","gemini-flash-latest","gemini-2.0-flash-lite","gemini-2.0-flash"];
  const listRes=await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  const listData=await listRes.json();
  if(listData.error)throw new Error(listData.error.message);
  const available=(listData.models||[]).filter(m=>(m.supportedGenerationMethods||[]).includes("generateContent")).map(m=>m.name.replace("models/",""));
  const model=preferred.find(p=>available.includes(p))||available.find(m=>m.includes("flash"))||available[0];
  if(!model)throw new Error("לא נמצאו מודלים");
  const parts=[];
  if(b64)parts.push({inline_data:{mime_type:mt||"image/jpeg",data:b64}});
  parts.push({text:prompt});
  const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts}]})});
  const d=await res.json();
  if(d.error)throw new Error(d.error.message);
  return d.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("\n")||"";
}

/* ── Load libs ── */
function loadJSZip(){return new Promise((res,rej)=>{if(window.JSZip){res(window.JSZip);return;}const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";s.onload=()=>res(window.JSZip);s.onerror=rej;document.head.appendChild(s);});}
function loadJsPDF(){
  return new Promise((res,rej)=>{
    if(window.jspdf){res(window.jspdf.jsPDF);return;}
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload=()=>res(window.jspdf.jsPDF);s.onerror=rej;document.head.appendChild(s);
  });
}
async function fetchFontAsBase64(url){
  const res=await fetch(url);
  if(!res.ok)throw new Error("לא ניתן לטעון את הפונט");
  const buf=await res.arrayBuffer();
  const bytes=new Uint8Array(buf);
  const chunkSize=0x8000;let binary="";
  for(let i=0;i<bytes.length;i+=chunkSize)binary+=String.fromCharCode(...bytes.subarray(i,i+chunkSize));
  return btoa(binary);
}
async function ensureHebrewFont(doc){
  if(doc.__hebrewFontLoaded)return;
  const fontBase64=await fetchFontAsBase64("/fonts/NotoSansHebrew-Regular.ttf");
  doc.addFileToVFS("NotoSansHebrew-Regular.ttf",fontBase64);
  doc.addFont("NotoSansHebrew-Regular.ttf","NotoSansHebrew","normal");
  doc.__hebrewFontLoaded=true;
}

/* ── UI helpers ── */
function Stars({value,onChange}){
  const [hover,setHover]=useState(0);
  return(<div style={{display:"flex",gap:3}}>{[1,2,3,4,5].map(i=>(
    <span key={i} onClick={()=>onChange&&onChange(i)} onMouseEnter={()=>onChange&&setHover(i)} onMouseLeave={()=>onChange&&setHover(0)}
      style={{fontSize:24,cursor:onChange?"pointer":"default",color:(hover||value)>=i?"#f59e0b":"#d1d5db",lineHeight:1,userSelect:"none"}}>★</span>
  ))}</div>);
}

function CityInput({value,onChange,onCitySelect}){
  const [v,setV]=useState(value||"");
  const lid=useRef("cl_"+Math.random().toString(36).slice(2));
  const prev=useRef(value||"");
  useEffect(()=>{setV(value||"");prev.current=value||"";},[value]);
  function handle(e){
    const val=e.target.value;setV(val);onChange(val);
    const m=CITIES.find(c=>c.toLowerCase()===val.trim().toLowerCase());
    if(m&&m!==prev.current){prev.current=m;onCitySelect(m);}
  }
  return(<div>
    <input value={v} list={lid.current} onChange={handle} onInput={handle} placeholder="הקלד שם עיר..." autoComplete="off"
      style={{width:"100%",boxSizing:"border-box",padding:"9px 11px",fontSize:14,border:"none",outline:"none",background:"transparent",color:"#111",fontFamily:"inherit"}}/>
    <datalist id={lid.current}>{CITIES.map(c=><option key={c} value={c}>{c} – {CPM[c]}</option>)}</datalist>
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
      <option value="">-- בחר מחוז --</option>{PROVINCES.map(p=><option key={p} value={p}>{p}</option>)}
    </select>
    {selVal==="אחר"&&<input value={isCustom?value:""} onChange={e=>onChange(e.target.value)} placeholder="הקלד מחוז..." style={{width:"100%",boxSizing:"border-box",padding:"8px 11px",fontSize:13,border:"none",borderTop:"1px solid rgba(0,0,0,0.1)",outline:"none",background:"#f8f8f8",color:"#111"}}/>}
  </div>);
}

function MediaButton({label,accept,capture,onFile,style={}}){
  const uid=useRef("f"+Math.random().toString(36).slice(2));
  return(<label htmlFor={uid.current} style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:13,padding:"7px 12px",borderRadius:8,border:"1.5px solid rgba(0,0,0,0.18)",background:"#fff",cursor:"pointer",color:"#333",fontWeight:500,...style}}>
    {label}<input id={uid.current} type="file" accept={accept} capture={capture||undefined} style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)onFile(f);e.target.value="";}}/>
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

function DupModal({existing,onUpdate,onNew,onClose}){
  return(<Overlay onClose={onClose}>
    <div style={{textAlign:"center"}}>
      <div style={{fontSize:32,marginBottom:10}}>⚠️</div>
      <div style={{fontSize:16,fontWeight:600,marginBottom:8}}>הספק כבר קיים</div>
      <div style={{fontSize:13,color:"#666",marginBottom:20}}>נמצא ספק בשם דומה: <strong>{existing.name}</strong><br/>האם ברצונך לעדכן אותו או להקים ספק חדש?</div>
      <div style={{display:"flex",gap:10,justifyContent:"center"}}>
        <button onClick={onUpdate} style={{padding:"9px 20px",borderRadius:9,border:"none",background:"#1d4ed8",cursor:"pointer",fontSize:14,fontWeight:500,color:"#fff"}}>עדכן ספק קיים</button>
        <button onClick={onNew} style={{padding:"9px 20px",borderRadius:9,border:"1.5px solid rgba(0,0,0,0.2)",background:"#fff",cursor:"pointer",fontSize:14,color:"#333"}}>הקם ספק חדש</button>
      </div>
    </div>
  </Overlay>);
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
    if(rb)rmBg(cvs);
  }
  const doRedraw=useCallback((rb)=>{if(origRef.current)draw(origRef.current,rotate,brightness,contrast,saturation,rb);},[rotate,brightness,contrast,saturation]);
  useEffect(()=>{doRedraw(bgRemoved);},[rotate,brightness,contrast,saturation]);
  function rmBg(cvs){
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
        <img src={img.url||`data:${img.type};base64,${img.data}`}
          style={{width:72,height:72,objectFit:"contain",borderRadius:8,border:"1px solid rgba(0,0,0,0.12)",display:"block",background:"#fff"}}/>
        <div style={{position:"absolute",bottom:2,right:2,display:"flex",gap:2}}>
          {onEdit&&img.data&&<button onClick={()=>onEdit(i)} style={{background:"rgba(0,0,0,0.65)",border:"none",borderRadius:4,color:"#fff",fontSize:10,padding:"2px 4px",cursor:"pointer"}}>✏</button>}
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
  return(<button onClick={onClick} disabled={disabled} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"10px 14px",borderRadius:10,border:"1.5px solid rgba(0,0,0,0.14)",background:disabled?"#f3f4f6":bg||"#fff",cursor:disabled?"not-allowed":"pointer",color:disabled?"#aaa":color||"#333",fontWeight:500,fontSize:12,minWidth:72,opacity:disabled?0.6:1}}>
  <span style={{fontSize:20}}>{icon}</span><span>{label}</span>
</button>);
}

function LoginScreen({onLogin}){
  const [name,setName]=useState("");
  const [key,setKey]=useState("");
  const [exhibition,setExhibition]=useState("");
  const [showKey,setShowKey]=useState(false);
  const valid=name.trim()&&key.trim().length>10&&exhibition.trim();
  return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f1f5f9",fontFamily:"sans-serif"}}>
    <div style={{background:"#fff",borderRadius:18,border:"1px solid rgba(0,0,0,0.1)",padding:"2rem",width:320,direction:"rtl"}}>
      <div style={{textAlign:"center",marginBottom:20}}><div style={{fontSize:36,marginBottom:6}}>🏭</div><div style={{fontSize:20,fontWeight:700,marginBottom:4}}>ניהול ספקים</div></div>
      <label style={{fontSize:12,fontWeight:500,color:"#666",display:"block",marginBottom:5}}>שם משתמש</label>
      <input value={name} onChange={e=>setName(e.target.value)} placeholder="השם שלך..." style={{width:"100%",boxSizing:"border-box",padding:"9px 12px",fontSize:14,borderRadius:9,border:"1.5px solid rgba(0,0,0,0.18)",outline:"none",marginBottom:14,textAlign:"right"}}/>
      <label style={{fontSize:12,fontWeight:500,color:"#666",display:"block",marginBottom:5}}>תערוכה</label>
      <input value={exhibition} onChange={e=>setExhibition(e.target.value)} placeholder="שם התערוכה..." style={{width:"100%",boxSizing:"border-box",padding:"9px 12px",fontSize:14,borderRadius:9,border:"1.5px solid rgba(0,0,0,0.18)",outline:"none",marginBottom:14,textAlign:"right"}}/>
      <label style={{fontSize:12,fontWeight:500,color:"#666",display:"block",marginBottom:5}}>Gemini API Key <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{fontSize:11,color:"#2563eb",marginRight:6,fontWeight:400}}>קבל key חינמי ←</a></label>
      <div style={{position:"relative",marginBottom:16}}>
        <input value={key} onChange={e=>setKey(e.target.value)} type={showKey?"text":"password"} placeholder="AIza..." style={{width:"100%",boxSizing:"border-box",padding:"9px 12px",paddingLeft:36,fontSize:13,borderRadius:9,border:"1.5px solid rgba(0,0,0,0.18)",outline:"none",textAlign:"left",direction:"ltr"}}/>
        <button onClick={()=>setShowKey(v=>!v)} style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:16,color:"#888"}}>{showKey?"🙈":"👁"}</button>
      </div>
      <div style={{fontSize:11,color:"#aaa",marginBottom:16}}>ה-key נשמר רק במכשיר שלך</div>
      <button onClick={()=>valid&&onLogin(name.trim(),key.trim(),exhibition.trim())} disabled={!valid} style={{width:"100%",padding:"11px",borderRadius:10,border:"none",background:valid?"#1d4ed8":"#93c5fd",cursor:valid?"pointer":"default",fontSize:15,fontWeight:600,color:"#fff"}}>כניסה</button>
    </div>
  </div>);
}

/* ══════════════ MAIN APP ══════════════ */
const EMPTY_FORM={name:"",contact:"",phone:"",email:"",city:"",province:"",fields:[],description:"",rating:0,cardImageUrl:"",_cardPreview:null,_cardPreviewType:null,source:"",date:todayStr()};
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
  const [filterExhibition,setFilterExhibition]=useState("");
  const [errors,setErrors]=useState({});
  const [editImgCtx,setEditImgCtx]=useState(null);
  const [msg,setMsg]=useState("");
  const [msgOk,setMsgOk]=useState(true);
  const [exporting,setExporting]=useState(false);
  const [dupModal,setDupModal]=useState(null);
  const importSupRef=useRef();

  const showMsg=(text,ok=true)=>{setMsg(text);setMsgOk(ok);setTimeout(()=>setMsg(""),5000);};
  const userName=user?.name||"user";

  const loadSuppliers=useCallback(async()=>{
    try{const data=await sb.select("suppliers","select=*");setSuppliers(data||[]);}
    catch(e){showMsg("שגיאה בטעינה: "+e.message,false);}
    setLoading(false);
  },[]);

  useEffect(()=>{
    const saved=localStorage.getItem("supplier_user");
    if(saved)try{setUser(JSON.parse(saved));}catch(_){}
    loadSuppliers();
  },[loadSuppliers]);

  function handleLogin(name,key,exhibition){const u={name,key,exhibition};setUser(u);localStorage.setItem("supplier_user",JSON.stringify(u));}
  function handleLogout(){setUser(null);localStorage.removeItem("supplier_user");}

  const loadProducts=async sid=>{if(!sid)return;const d=await sb.select("products",`supplier_id=eq.${sid}&select=*`);setProducts(d||[]);};
  const sf=(k,v)=>setForm(f=>({...f,[k]:v}));

  async function uploadImg(b64,type,path){
    const c=await compressImage(b64,type);
    return sb.uploadFile(path,c.blob,"image/jpeg");
  }

  const handleCardFile=async(file)=>{
    setExtracting(true);
    try{
      const raw=await fileToBase64(file);
      const oriented=await autoOrientBusinessCard(raw,file.type);
      setForm(f=>({...f,_cardPreview:oriented.base64,_cardPreviewType:oriented.mimeType}));
      if(!user?.key){showMsg("אין Gemini API key",false);setExtracting(false);return;}
      const txt=await callGemini(
        "Business card image. Extract: name (company/supplier), contact (person name), email, phone, city (English city name only). Return ONLY valid JSON: {name,contact,email,phone,city}. No markdown.",
        oriented.base64,oriented.mimeType,user.key
      );
      try{
        const p=JSON.parse(txt.replace(/```json|```/g,"").trim());
        const rawCity=(p.city||"").trim();
        const matched=CITIES.find(c=>c.toLowerCase()===rawCity.toLowerCase())||rawCity;
        setForm(f=>({...f,_cardPreview:oriented.base64,_cardPreviewType:oriented.mimeType,
          name:p.name||f.name,contact:p.contact||f.contact,phone:p.phone||f.phone,
          email:p.email||f.email,city:matched||f.city,province:getProvince(matched)||f.province}));
        showMsg(`פרטים חולצו ✓ (סיבוב ${oriented.angle}°)`,true);
      }catch(_){showMsg(`התמונה סובבה (${oriented.angle}°), לא ניתן לפרסר`,false);}
    }catch(e){showMsg("שגיאה: "+e.message,false);}
    setExtracting(false);
  };

  const validate=()=>{const e={};if(!form.name.trim())e.name="שם ספק חובה";setErrors(e);return!Object.keys(e).length;};
  function findDuplicate(name){return suppliers.find(s=>s.id!==selSup?.id&&similarity(s.name,name.trim())>0.8);}

  const doSave=async(forceNew=false)=>{
    setSaving(true);const now=nowISO();
    try{
      let cardUrl=form.cardImageUrl||"";
      if(form._cardPreview){
        const path=`cards/${selSup?.id||"new"}_${Date.now()}.jpg`;
        cardUrl=await uploadImg(form._cardPreview,form._cardPreviewType||"image/jpeg",path);
      }
      const payload={name:form.name,contact:form.contact,phone:form.phone,email:form.email,
        city:form.city,province:form.province,fields:form.fields,description:form.description,
        rating:form.rating,        source:form.source||user?.exhibition||"",date:form.date||todayStr(),
        card_image_url:cardUrl,updated_at:now,updated_by:userName};
      if(selSup&&!forceNew){
        await sb.update("suppliers",selSup.id,payload);
        setSelSup(s=>({...s,...payload,id:selSup.id}));
      }else{
        const created=await sb.insert("suppliers",{...payload,created_at:now,created_by:userName});
        setSelSup(created);await loadProducts(created.id);
      }
      await loadSuppliers();
      if(selSup&&!forceNew)await loadProducts(selSup.id);
      setForm(f=>({...f,_cardPreview:null,_cardPreviewType:null,cardImageUrl:cardUrl}));
      showMsg("נשמר ✓",true);
    }catch(e){showMsg("שגיאה: "+e.message,false);}
    setSaving(false);
  };

  const handleSave=async()=>{
    if(!validate())return;
    if(!selSup){const dup=findDuplicate(form.name);if(dup){setDupModal({existing:dup});return;}}
    await doSave();
  };

  const openEdit=async s=>{
    setSelSup(s);
    setForm({name:s.name||"",contact:s.contact||"",phone:s.phone||"",email:s.email||"",
      city:s.city||"",province:s.province||"",fields:s.fields||[],description:s.description||"",
      rating:s.rating||0,cardImageUrl:s.card_image_url||"",_cardPreview:null,_cardPreviewType:null,
      source:s.source||"",date:s.date||todayStr()});
    setErrors({});await loadProducts(s.id);setView("form");
  };

  /* ── DELETE SUPPLIER + all storage files ── */
  const handleDelSup=async id=>{
    if(!window.confirm("למחוק ספק זה? כל התמונות שלו יימחקו גם מהאחסון."))return;
    try{
      const sup=suppliers.find(s=>s.id===id);
      // collect all file URLs
      const urls=[];
      if(sup?.card_image_url)urls.push(sup.card_image_url);
      const prods=await sb.select("products",`supplier_id=eq.${id}&select=*`);
      for(const p of prods)for(const img of(p.images||[]))if(img.url)urls.push(img.url);
      // delete files from storage
      for(const url of urls)await sb.deleteFile(url);
      // delete from DB (products cascade via FK)
      await sb.delete("suppliers",id);
      await loadSuppliers();
      if(selSup?.id===id){setView("list");setSelSup(null);}
      showMsg("הספק נמחק ✓",true);
    }catch(e){showMsg("שגיאה במחיקה: "+e.message,false);}
  };

  const openProdModal=p=>{setEditProd(p||null);setProdForm(p?{description:p.description||"",images:p.images||[],rating:p.rating||0}:{...EMPTY_PROD,images:[]});setProdModal(true);};

  const handleSaveProd=async()=>{
    const sid=selSup?.id;if(!sid)return;const now=nowISO();
    const uploaded=[];
    for(let i=0;i<prodForm.images.length;i++){
      const img=prodForm.images[i];
      if(img.url){uploaded.push(img);continue;}
      const path=`products/${sid}_${editProd?.id||"new"}_${i}_${Date.now()}.jpg`;
      const url=await uploadImg(img.data,img.type,path);
      uploaded.push({url,path});
    }
    const payload={description:prodForm.description,rating:prodForm.rating,images:uploaded,supplier_id:sid,updated_at:now,updated_by:userName};
    if(editProd)await sb.update("products",editProd.id,payload);
    else await sb.insert("products",{...payload,created_at:now,created_by:userName});
    await loadProducts(sid);setProdModal(false);
  };

  /* ── DELETE PRODUCT + its storage files ── */
  const handleDelProd=async id=>{
    if(!window.confirm("למחוק מוצר זה? התמונות שלו יימחקו גם מהאחסון."))return;
    try{
      const prod=products.find(p=>p.id===id);
      for(const img of(prod?.images||[]))if(img.url)await sb.deleteFile(img.url);
      await sb.delete("products",id);
      await loadProducts(selSup.id);
      showMsg("המוצר נמחק ✓",true);
    }catch(e){showMsg("שגיאה: "+e.message,false);}
  };

  /* ── Sorted + filtered ── */
  const sorted=[...suppliers].sort((a,b)=>{
    const pc=(a.province||"").localeCompare(b.province||"");
    return pc!==0?pc:(a.name||"").localeCompare(b.name||"");
  });
  const filtered=sorted.filter(s=>{
    const q=search.toLowerCase();
    const eq=filterExhibition.toLowerCase();
    return(!q||s.name?.toLowerCase().includes(q)||s.contact?.toLowerCase().includes(q))&&
      (!filterProvince||s.province===filterProvince)&&
      (!filterField||(s.fields||[]).includes(filterField))&&
      (!eq||(s.source||"").toLowerCase().includes(eq));
  });

  /* ── CSV ── */
  function buildCSV(allS,allP){
    let c="\uFEFFאינדקס,שם ספק,מקור,תאריך,איש קשר,טלפון,אימייל,עיר,מחוז,תחום עיסוק,תיאור,דירוג,נוצר,נוצר ע\"י,עודכן,עודכן ע\"י\n";
    allS.forEach(s=>{c+=[s.id,`"${(s.name||"").replace(/"/g,'""')}"`,`"${(s.source||"").replace(/"/g,'""')}"`,s.date||"",`"${(s.contact||"").replace(/"/g,'""')}"`,s.phone||"",s.email||"",s.city||"",s.province||"",`"${(s.fields||[]).join(", ")}"`,`"${(s.description||"").replace(/"/g,'""')}"`,s.rating||0,s.created_at||"",s.created_by||"",s.updated_at||"",s.updated_by||""].join(",")+"\n";});
    c+="\n\nמוצרים\nאינדקס,ספק ID,תיאור,דירוג,נוצר,נוצר ע\"י,עודכן,עודכן ע\"י\n";
    allP.forEach(p=>{c+=[p.id,p.supplier_id,`"${(p.description||"").replace(/"/g,'""')}"`,p.rating||0,p.created_at||"",p.created_by||"",p.updated_at||"",p.updated_by||""].join(",")+"\n";});
    return c;
  }

  /* ── ZIP ── */
  const downloadZip=async()=>{
    setExporting(true);showMsg("מכין ZIP...",true);
    try{
      const JSZip=await loadJSZip();const zip=new JSZip();const label=dtLabel();
      const allS=await sb.select("suppliers","select=*");
      const allP=await sb.select("products","select=*");
      zip.file(`${label}/suppliers_${label}.csv`,buildCSV(allS,allP));
      for(const s of allS){
        const prov=sanitize(s.province||"no_province");
        const sName=sanitize(s.name||`supplier_${s.id}`);
        const folder=`${label}/${prov}/${sName}/`;
        if(s.card_image_url){try{const r=await fetch(s.card_image_url);zip.file(`${folder}${s.id}.card.jpg`,await r.arrayBuffer());}catch(_){}}
        const prods=allP.filter(p=>p.supplier_id===s.id);
        for(const p of prods)for(let i=0;i<(p.images||[]).length;i++){
          const img=p.images[i];if(img.url){try{const r=await fetch(img.url);zip.file(`${folder}${s.id}.${p.id}.${i+1}.jpg`,await r.arrayBuffer());}catch(_){}}
        }
      }
      const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}});
      const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`suppliers_${label}.zip`;a.click();
      showMsg(`✓ הורד: suppliers_${label}.zip`,true);
    }catch(e){showMsg("שגיאה ZIP: "+e.message,false);}
    setExporting(false);
  };

  /* ── PDF – מוצר אחד בשורה, כל התמונות ── */
  const downloadPDF=async()=>{
    setExporting(true);showMsg("מייצר PDF...",true);
    try{
      const JsPDF=await loadJsPDF();
      const doc=new JsPDF({orientation:"p",unit:"mm",format:"a4"});
      await ensureHebrewFont(doc);
      doc.setFont("NotoSansHebrew","normal");

      const pageWidth=210,pageHeight=297,margin=12,contentWidth=pageWidth-margin*2;
      const labelColWidth=34,gap=4;
      const valueColX=margin,valueColWidth=contentWidth-labelColWidth-gap;
      const labelColX=pageWidth-margin;
      let y=margin;

      const allSRaw=await sb.select("suppliers","select=*");
      const allP=await sb.select("products","select=*");
      const allS=[...allSRaw].sort((a,b)=>{
        const pc=(a.province||"").localeCompare(b.province||"");
        return pc!==0?pc:(a.name||"").localeCompare(b.name||"");
      });

      const chkPage=(need=10)=>{
        if(y+need>pageHeight-margin){addPageNumber(doc,pageWidth,pageHeight);doc.addPage();doc.setFont("NotoSansHebrew","normal");y=margin;}
      };
      const fetchDataUrl=async url=>{
        try{const r=await fetch(url);const blob=await r.blob();return await new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.readAsDataURL(blob);});}
        catch{return null;}
      };

      // ── Cover page ──
      doc.setFontSize(20);doc.setTextColor(29,78,216);
      doc.text(rtl("דוח ספקים"),pageWidth-margin,28,{align:"right"});
      doc.setFontSize(11);doc.setTextColor(80,80,80);
      doc.text(rtl("תאריך הפקה:"),pageWidth-margin,40,{align:"right"});
      doc.text(new Date().toLocaleDateString("he-IL"),valueColX,40,{align:"left"});
      doc.text(rtl("מספר ספקים:"),pageWidth-margin,48,{align:"right"});
      doc.text(String(allS.length),valueColX,48,{align:"left"});
      y=65;
      const provinces=[...new Set(allS.map(s=>s.province||"אחר"))];
      doc.setFontSize(12);doc.setTextColor(29,78,216);
      doc.text(rtl("מחוזות כלולים"),pageWidth-margin,y,{align:"right"});y+=10;
      doc.setFontSize(10);doc.setTextColor(50,50,50);
      for(const p of provinces){
        chkPage(7);
        doc.text(rtl(getProvinceHebrew(p)),pageWidth-margin,y,{align:"right"});
        doc.text(p,valueColX,y,{align:"left"});y+=6;
      }
      addPageNumber(doc,pageWidth,pageHeight);doc.addPage();y=margin;

      let currentProvince=null;

      for(let si=0;si<allS.length;si++){
        const s=allS[si];
        const prods=allP.filter(p=>p.supplier_id===s.id);
        const province=s.province||"אחר";
        const provinceHe=getProvinceHebrew(province);
        const provinceColor=getProvinceColor(province);

        // Province divider
        if(province!==currentProvince){
          if(currentProvince!==null){addPageNumber(doc,pageWidth,pageHeight);doc.addPage();doc.setFont("NotoSansHebrew","normal");y=margin;}
          currentProvince=province;
          doc.setFillColor(...provinceColor);doc.roundedRect(margin,y,contentWidth,16,2,2,"F");
          doc.setTextColor(255,255,255);doc.setFontSize(12);
          doc.text(rtl("מחוז"),pageWidth-margin-3,y+6,{align:"right"});
          doc.setFontSize(11);
          doc.text(rtl(provinceHe),pageWidth-margin-3,y+12,{align:"right"});
          doc.text(province,margin+3,y+12,{align:"left"});
          y+=22;
        }

        chkPage(90);

        // Supplier header
        doc.setFillColor(...provinceColor);doc.roundedRect(margin,y,contentWidth,10,2,2,"F");
        doc.setTextColor(255,255,255);doc.setFontSize(12);
        if(isHebrewText(s.name||""))doc.text(rtl(`#${s.id}  ${s.name||""}`),pageWidth-margin-3,y+6.8,{align:"right"});
        else doc.text(`${s.name||""}  #${s.id}`,margin+3,y+6.8,{align:"left"});
        y+=14;
        doc.setTextColor(20,20,20);doc.setFontSize(10);

        // Info rows
        const rows=[
          ["מקור",s.source],["תאריך",s.date],["איש קשר",s.contact],
          ["טלפון",s.phone],["אימייל",s.email],["עיר",s.city],
          ["מחוז",s.province],["תחומים",(s.fields||[]).join(", ")],
          ["דירוג",s.rating?"★".repeat(s.rating):""],["תיאור",s.description],
        ].filter(([,v])=>v);
        for(const [label,value] of rows){
          chkPage(8);
          doc.setTextColor(...provinceColor);doc.text(rtl(`${label}:`),labelColX,y,{align:"right"});
          doc.setTextColor(30,30,30);
          const pv=formatFieldValue(label,value);
          const lines=doc.splitTextToSize(pv,valueColWidth);
          doc.text(lines,valueColX,y,{align:"left"});
          y+=Math.max(6,lines.length*5);
        }

        // Card image
        if(s.card_image_url){
          const dataUrl=await fetchDataUrl(s.card_image_url);
          if(dataUrl){
            try{
              const dims=await getImageDimensions(dataUrl);
              const frameW=50,frameH=33;
              const fitted=fitRect(dims.width,dims.height,frameW,frameH);
              chkPage(frameH+8);
              doc.setFillColor(255,255,255);doc.setDrawColor(220,220,220);
              doc.roundedRect(margin,y,frameW,frameH,1.5,1.5,"FD");
              doc.addImage(dataUrl,"JPEG",margin+(frameW-fitted.width)/2,y+(frameH-fitted.height)/2,fitted.width,fitted.height);
              y+=frameH+5;
            }catch(_){}
          }
        }

        if(s.updated_at){
          chkPage(8);doc.setFontSize(8);doc.setTextColor(120,120,120);
          doc.text(`Updated by ${s.updated_by||""} · ${new Date(s.updated_at).toLocaleString("he-IL")}`,valueColX,y,{align:"left"});
          y+=8;
        }

        // Products – smart layout: 2-per-row if ≤3 images, else 1-per-row
        if(prods.length>0){
          chkPage(10);
          doc.setFontSize(11);doc.setTextColor(...provinceColor);
          doc.text(rtl(`מוצרים (${prods.length})`),labelColX,y,{align:"right"});
          y+=8;

          // pre-fetch all image dataUrls so we can decide layout
          const prodDataUrls=[];
          for(const p of prods){
            const urls=[];
            for(const img of(p.images||[])){
              if(!img.url){urls.push(null);continue;}
              urls.push(await fetchDataUrl(img.url));
            }
            prodDataUrls.push(urls);
          }

          // IMG sizing constants
          const IMG_W_SINGLE=34, IMG_H_SINGLE=26, IMG_GAP=3;
          const COL_GAP=6;
          const colW=(contentWidth-COL_GAP)/2;  // width of one 2-up column

          // how many images fit in a single column (2-up layout)
          const imgsPerRow2up=Math.floor((colW-4+IMG_GAP)/(IMG_W_SINGLE+IMG_GAP)); // ~3
          const THRESHOLD=imgsPerRow2up; // if more images than this → go 1-up

          // draw one product card
          const drawProduct=async(p,dataUrls,xBase,cardW,startY)=>{
            let iy=startY;
            const innerW=cardW-6;

            // header
            doc.setFillColor(245,247,250);doc.setDrawColor(...provinceColor);
            doc.roundedRect(xBase,iy,cardW,7,1,1,"FD");
            doc.setFontSize(9);doc.setTextColor(...provinceColor);
            doc.text(rtl(`מוצר #${p.id}`),xBase+cardW-3,iy+5,{align:"right"});
            if(p.rating){doc.setTextColor(180,120,0);doc.text("★".repeat(p.rating),xBase+3,iy+5,{align:"left"});}
            iy+=9;

            // description
            doc.setTextColor(30,30,30);doc.setFontSize(9);
            const desc=isHebrewText(p.description||"")?rtl(p.description||"ללא תיאור"):(p.description||"ללא תיאור");
            const descLines=doc.splitTextToSize(desc,innerW);
            doc.text(descLines,xBase+3,iy,{align:"left"});
            iy+=descLines.length*4+2;

            // images
            const validImgs=dataUrls.filter(Boolean);
            if(validImgs.length>0){
              let ix=xBase+3;
              let rowY=iy;
              for(let vi=0;vi<validImgs.length;vi++){
                const dataUrl=validImgs[vi];
                if(ix+IMG_W_SINGLE>xBase+cardW-3){
                  rowY+=IMG_H_SINGLE+IMG_GAP;ix=xBase+3;
                }
                try{
                  const dims=await getImageDimensions(dataUrl);
                  const fitted=fitRect(dims.width,dims.height,IMG_W_SINGLE,IMG_H_SINGLE);
                  doc.setFillColor(255,255,255);doc.setDrawColor(220,220,220);
                  doc.roundedRect(ix,rowY,IMG_W_SINGLE,IMG_H_SINGLE,1,1,"FD");
                  doc.addImage(dataUrl,"JPEG",ix+(IMG_W_SINGLE-fitted.width)/2,rowY+(IMG_H_SINGLE-fitted.height)/2,fitted.width,fitted.height);
                }catch(_){}
                ix+=IMG_W_SINGLE+IMG_GAP;
              }
              iy=rowY+IMG_H_SINGLE+3;
            }

            // timestamp
            if(p.updated_at){
              doc.setFontSize(7);doc.setTextColor(120,120,120);
              doc.text(`Updated by ${p.updated_by||""} · ${new Date(p.updated_at).toLocaleString("he-IL")}`,xBase+3,iy,{align:"left"});
              iy+=4;
            }
            return iy-startY; // height used
          };

          // estimate card height (without drawing) for page-break decisions
          const estimateH=(p,dataUrls)=>{
            let h=9; // header
            const desc=isHebrewText(p.description||"")?rtl(p.description||""):( p.description||"");
            const lines=doc.splitTextToSize(desc,(contentWidth-6)/2);
            h+=lines.length*4+2;
            const n=dataUrls.filter(Boolean).length;
            if(n>0){
              const cols=Math.floor(((contentWidth/2)-6+IMG_GAP)/(IMG_W_SINGLE+IMG_GAP));
              h+=Math.ceil(n/Math.max(cols,1))*(IMG_H_SINGLE+IMG_GAP);
            }
            if(p.updated_at)h+=4;
            return h+2;
          };

          // process products in pairs (2-up) or singles (1-up)
          let pi=0;
          while(pi<prods.length){
            const p=prods[pi];
            const urls=prodDataUrls[pi];
            const imgCount=(p.images||[]).length;
            const use1up=imgCount>THRESHOLD;

            if(use1up){
              // 1-up: full width
              const eh=estimateH(p,urls)+6;
              chkPage(eh);
              const used=await drawProduct(p,urls,margin,contentWidth,y);
              y+=used+4;
              pi++;
            } else {
              // 2-up: pair this product with the next (if next also fits 2-up)
              const p2=prods[pi+1];
              const urls2=p2?prodDataUrls[pi+1]:null;
              const next2up=p2&&(p2.images||[]).length<=THRESHOLD;

              if(next2up){
                const eh=Math.max(estimateH(p,urls),estimateH(p2,urls2))+6;
                chkPage(eh);
                const leftX=margin+colW+COL_GAP; // RTL: first product on right
                const rightX=margin;
                const [h1,h2]=await Promise.all([
                  drawProduct(p,urls,leftX,colW,y),
                  drawProduct(p2,urls2,rightX,colW,y)
                ]);
                y+=Math.max(h1,h2)+4;
                pi+=2;
              } else {
                // last product, no pair – draw full width
                const eh=estimateH(p,urls)+6;
                chkPage(eh);
                const used=await drawProduct(p,urls,margin,contentWidth,y);
                y+=used+4;
                pi++;
              }
            }
          }
        }
        y+=4;
      }

      addPageNumber(doc,pageWidth,pageHeight);
      doc.save(`suppliers_${dtLabel()}.pdf`);
      showMsg("✓ PDF הורד",true);
    }catch(e){showMsg("שגיאה PDF: "+e.message,false);}
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

  const allUsedProvinces=[...new Set(suppliers.map(s=>s.province).filter(Boolean))].sort();
  const allUsedFields=[...new Set(suppliers.flatMap(s=>s.fields||[]))].sort();
  const CS={background:"#fff",borderRadius:14,border:"1px solid rgba(0,0,0,0.1)",padding:"1.25rem",marginBottom:14};
  const BP={padding:"10px",borderRadius:9,border:"none",background:"#1d4ed8",cursor:"pointer",fontSize:14,fontWeight:500,color:"#fff"};

  if(!user)return<LoginScreen onLogin={handleLogin}/>;
  if(loading)return<div style={{padding:"2rem",textAlign:"center",color:"#888"}}>טוען נתונים...</div>;

  return(<div dir="rtl" style={{fontFamily:"var(--font-sans)",padding:"0.75rem",maxWidth:560,margin:"0 auto",background:"var(--color-background-tertiary)",minHeight:"100vh"}}>
    <input ref={importSupRef} type="file" accept=".csv" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)importCSV(f);e.target.value="";}}/>

    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,paddingTop:4}}>
      {view!=="list"
        ?<button onClick={()=>{setView("list");setSelSup(null);}} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#555",padding:0,fontWeight:500}}>← רשימה</button>
        :<span style={{fontSize:18,fontWeight:700}}>ניהול ספקים</span>}
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:12,color:"#666",background:"#f1f5f9",padding:"4px 10px",borderRadius:20}}>👤 {userName}</span>
        {view==="list"&&<button onClick={()=>{    setForm({...EMPTY_FORM,source:user?.exhibition||"",date:todayStr()});setSelSup(null);setErrors({});setView("form");}} style={{...BP,padding:"7px 14px",fontSize:13}}>+ ספק חדש</button>}
        <button onClick={handleLogout} style={{fontSize:12,padding:"4px 10px",borderRadius:20,border:"1px solid rgba(0,0,0,0.15)",background:"#fff",cursor:"pointer",color:"#888"}}>יציאה</button>
      </div>
    </div>

    {msg&&<div style={{borderRadius:8,padding:"8px 14px",marginBottom:10,fontSize:13,fontWeight:500,background:msgOk?"#f0fdf4":"#fef2f2",border:`1px solid ${msgOk?"#bbf7d0":"#fecaca"}`,color:msgOk?"#065f46":"#dc2626"}}>{msg}</div>}

    {dupModal&&<DupModal existing={dupModal.existing}
      onUpdate={async()=>{setDupModal(null);await openEdit(dupModal.existing);}}
      onNew={async()=>{setDupModal(null);await doSave(true);}}
      onClose={()=>setDupModal(null)}/>}

    {view==="list"&&<>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <Section title="ייצוא נתונים" icon="📤" accent="#0f766e">
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            <ActBtn icon="📦" label="ZIP" bg="#f0fdf4" color="#065f46" onClick={downloadZip} disabled={exporting}/>
            <ActBtn icon="📄" label="PDF" bg="#fff7ed" color="#c2410c" onClick={downloadPDF} disabled={exporting}/>
          </div>
          <div style={{fontSize:11,color:"#888",marginTop:8}}>ZIP: תיקיות מחוז/ספק · PDF: ספקים+תמונות</div>
        </Section>
        <Section title="ייבוא נתונים" icon="📥" accent="#7c3aed">
          <div style={{display:"flex",gap:10}}>
            <ActBtn icon="📊" label="ייבוא CSV" bg="#faf5ff" color="#5b21b6" onClick={()=>importSupRef.current.click()}/>
          </div>
        </Section>
      </div>

      <Section title="סינון" icon="🔎" accent="#2563eb">
        <div style={{padding:0}}>
          <input value={filterExhibition} onChange={e=>setFilterExhibition(e.target.value)} placeholder="סינון לפי תערוכה..."
            style={{width:"100%",marginBottom:8,fontSize:13,padding:"7px 8px",borderRadius:8,border:"1.5px solid rgba(0,0,0,0.14)",background:"#f8f7f5",color:"#333",outline:"none",boxSizing:"border-box"}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="שם ספק"
            style={{width:"100%",marginBottom:8,fontSize:13,padding:"7px 8px",borderRadius:8,border:"1.5px solid rgba(0,0,0,0.14)",background:"#f8f7f5",color:"#333",outline:"none",boxSizing:"border-box"}}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <select value={filterProvince} onChange={e=>setFilterProvince(e.target.value)} style={{fontSize:13,padding:"7px 8px",borderRadius:8,border:"1.5px solid rgba(0,0,0,0.14)",background:"#f8f7f5",color:"#333",outline:"none"}}>
              <option value="">כל המחוזות</option>{allUsedProvinces.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            <select value={filterField} onChange={e=>setFilterField(e.target.value)} style={{fontSize:13,padding:"7px 8px",borderRadius:8,border:"1.5px solid rgba(0,0,0,0.14)",background:"#f8f7f5",color:"#333",outline:"none"}}>
              <option value="">כל תחומי העיסוק</option>{(allUsedFields.length?allUsedFields:FIELDS_OF_WORK).map(f=><option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          {(search||filterProvince||filterField||filterExhibition)&&
            <button onClick={()=>{setSearch("");setFilterProvince("");setFilterField("");setFilterExhibition("");}} style={{marginTop:8,fontSize:12,color:"#2563eb",background:"none",border:"none",cursor:"pointer",padding:0,fontWeight:500}}>✕ נקה סינון</button>}
        </div>
      </Section>

      <div style={{fontSize:12,color:"#888",marginBottom:8}}>{filtered.length} ספקים</div>
      {filtered.length===0&&<div style={{textAlign:"center",color:"#888",padding:"2.5rem",background:"#fff",borderRadius:14}}>לא נמצאו ספקים</div>}
      {filtered.map(s=>(
        <div key={s.id} style={{...CS,display:"flex",alignItems:"center",gap:12,padding:"12px 14px"}}>
          {s.card_image_url?<img src={s.card_image_url} style={{width:46,height:46,borderRadius:9,objectFit:"cover",flexShrink:0,border:"1px solid rgba(0,0,0,0.1)"}}/>
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
        <div style={{marginBottom:18}}>
          <label style={{fontSize:12,fontWeight:500,color:"#666",display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.04em"}}>כרטיס ביקור</label>
          <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",padding:"12px",background:"#f8f7f5",borderRadius:10,border:"1.5px dashed rgba(0,0,0,0.15)"}}>
            {(form._cardPreview||form.cardImageUrl)&&(
              <div style={{position:"relative",flexShrink:0}}>
                <img src={form._cardPreview?`data:image/jpeg;base64,${form._cardPreview}`:form.cardImageUrl}
                  style={{width:120,height:80,objectFit:"cover",borderRadius:8,border:"1px solid rgba(0,0,0,0.1)",display:"block"}}/>
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
        <Field label="תאריך"><input type="date" style={IS} value={form.date} onChange={e=>sf("date",e.target.value)}/></Field>
        <Field label="מקור / תערוכה"><input style={IS} value={form.source||""} onChange={e=>sf("source",e.target.value)} placeholder="שם התערוכה או המקור"/></Field>
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
          {selSup.created_at&&<span>נוצר ע"י {selSup.created_by} · {new Date(selSup.created_at).toLocaleString("he-IL")} &nbsp;</span>}
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
              {fi?.url
                ?<div style={{width:"100%",aspectRatio:"1/1",display:"flex",alignItems:"center",justifyContent:"center",background:"#fff"}}>
                  <img src={fi.url} style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain",display:"block"}}/>
                </div>
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
        <button onClick={handleSaveProd} style={{...BP,flex:1}}>שמור</button>
        <button onClick={()=>setProdModal(false)} style={{flex:1,padding:"10px",borderRadius:9,border:"1.5px solid rgba(0,0,0,0.15)",background:"transparent",cursor:"pointer",fontSize:14,color:"#555"}}>ביטול</button>
      </div>
    </Overlay>}

    {editImgCtx?.target==="card"&&form._cardPreview&&(
      <ImageEditor src={form._cardPreview} type="image/jpeg"
        onSave={(b64,mt)=>{setForm(f=>({...f,_cardPreview:b64,_cardPreviewType:mt}));setEditImgCtx(null);}}
        onClose={()=>setEditImgCtx(null)}/>
    )}
    {editImgCtx?.target==="prod"&&(()=>{
      const idx=editImgCtx.idx,img=prodForm.images?.[idx];
      if(!img||!img.data)return null;
      return(<ImageEditor src={img.data} type={img.type||"image/jpeg"}
        onSave={(b64,mt)=>{setProdForm(f=>{const imgs=[...f.images];imgs[idx]={data:b64,type:mt};return{...f,images:imgs};});setEditImgCtx(null);}}
        onClose={()=>setEditImgCtx(null)}/>);
    })()}
  </div>);
}