import { dialog, ipcMain } from "electron";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { randomUUID } from "node:crypto";
import { BUSINESS_CAPABILITIES as C } from "@yardimci-asistan/shared";
import { assertPersistedBusinessCapability } from "../business-capability-runtime";
import { createTransferPlan, applyTransferPlan, collectTransferExport, createTransferExport, resolveTransferImages, type TransferPlan } from "../data-transfer-service";
import { transferImageOwner } from "../data-transfer-images";
import { parseTransferFile, suggestTransferMapping, MAX_TRANSFER_BYTES, encodeTransferFile, type TransferDocument } from "../data-transfer-format";
import type { TransferEntity, TransferPreferences, TransferExportOptions, TransferResult, TransferStatus, TransferProgress } from "../data-transfer-contract";
export function registerDataTransferIpc(options: { databasePath:()=>string; assertUnlocked:()=>void; onMutation:()=>void }) {
  const sessions = new Map<string,{owner:number;path:string;entity:TransferEntity;document:TransferDocument;plan?:TransferPlan;result?:TransferResult;applying:boolean;expires:number}>();
  const running=new Set<number>();
  const guard=(entity:TransferEntity,path?:string)=>{
    options.assertUnlocked();if(path!==undefined && path!==options.databasePath())throw new Error("Aktif veritabanı değişti.");
    if(!["products","customers","menu"].includes(entity))throw new Error("Aktarım türü geçersiz.");
    assertPersistedBusinessCapability(path ?? options.databasePath(),entity==="customers"?C.CUSTOMERS:C.CATALOG);
    if(entity==="menu")assertPersistedBusinessCapability(path ?? options.databasePath(),C.FOOD_MENU);
  };
  const get=(token:string,owner:number)=>{
    options.assertUnlocked();
    const session=sessions.get(token);if(!session || session.owner!==owner || session.expires<Date.now())throw new Error("Aktarım oturumu sona erdi; dosyayı yeniden seçin.");
    guard(session.entity,session.path);session.expires=Date.now()+30*60*1000;return session;
  };
  const source=async(owner:number,entity:TransferEntity,name:string,bytes:Uint8Array)=>{
    guard(entity);const path=options.databasePath(),document=await parseTransferFile(basename(name),bytes,entity);guard(entity,path);
    for(const [token,s]of sessions)if(s.owner===owner && !s.applying || s.expires<Date.now())sessions.delete(token);
    const token=randomUUID();sessions.set(token,{owner,path,entity,document,applying:false,expires:Date.now()+30*60*1000});
    return {token,name:basename(name),format:document.format,headers:document.headers,mapping:suggestTransferMapping(document.headers,entity),total:document.records.length,warnings:document.warnings};
  };
  ipcMain.handle("dataTransfer:pick",async(event,entity:TransferEntity)=>{
    guard(entity);const path=options.databasePath();
    const chosen=await dialog.showOpenDialog({properties:["openFile"],filters:[{name:"Aktarım dosyaları",extensions:["csv","xlsx","zip"]}]});guard(entity,path);
    if(chosen.canceled || !chosen.filePaths[0])return null;
    if((await stat(chosen.filePaths[0])).size>MAX_TRANSFER_BYTES)throw new Error("Dosya 32 MB sınırını aşıyor.");
    return source(event.sender.id,entity,basename(chosen.filePaths[0]),await readFile(chosen.filePaths[0]));
  });
  ipcMain.handle("dataTransfer:upload",(event,entity:TransferEntity,name:string,bytes:Uint8Array)=>source(event.sender.id,entity,name,bytes));
  ipcMain.handle("dataTransfer:preview",async(event,token:string,mapping:Record<string,string>,preferences:TransferPreferences)=>{
    const s=get(token,event.sender.id);if(s.applying || s.result)throw new Error("Bu oturum zaten uygulandı.");
    if(running.has(event.sender.id))throw new Error("Aktarım zaten sürüyor.");
    running.add(event.sender.id);
    try {
    if(s.entity !== "customers") await resolveTransferImages(s.document,mapping,transferImageOwner,()=>guard(s.entity,s.path),p=>{if(!event.sender.isDestroyed())event.sender.send("dataTransfer:progress",p);});
    guard(s.entity,s.path);
    s.plan=createTransferPlan(s.path,s.entity,s.document,mapping,preferences,transferImageOwner);return s.plan.preview;
    } finally { running.delete(event.sender.id); }
  });
  ipcMain.handle("dataTransfer:rows",(event,token:string,status:TransferStatus|"all",offset:number)=>{
    const s=get(token,event.sender.id);if(!s.plan)throw new Error("Önce analiz edin.");
    const rows=s.result?.rows??s.plan.rows.map(r=>r.view);return rows.filter(r=>status==="all"||r.status===status).slice(Math.max(0,offset),Math.max(0,offset)+50);
  });
  ipcMain.handle("dataTransfer:apply",async(event,token:string,revision:string)=>{
    const s=get(token,event.sender.id);if(s.applying||running.has(event.sender.id))throw new Error("Aktarım zaten sürüyor.");
    if(s.result)return {...s.result,rows:s.result.rows.slice(0,50)};
    if(!s.plan || s.plan.preview.revision!==revision)throw new Error("Önizleme değişti; yeniden onaylayın.");
    const progress=(p:TransferProgress)=>{if(!event.sender.isDestroyed())event.sender.send("dataTransfer:progress",p);};
    s.applying=true;running.add(event.sender.id);
    try {s.result=await applyTransferPlan(s.path,s.plan,transferImageOwner,()=>{get(token,event.sender.id);},progress);if(s.result.added+s.result.updated)options.onMutation();guard(s.entity,s.path);return {...s.result,rows:s.result.rows.slice(0,50)};}
    finally{s.applying=false;running.delete(event.sender.id);}
  });
  ipcMain.handle("dataTransfer:summary",(_event,input:TransferExportOptions)=>{guard(input.entity);const data=collectTransferExport(options.databasePath(),input);return {records:data.records.length,images:data.images};});
  async function saveFile(entity:TransferEntity,name:string,bytes:Uint8Array,path:string) {
    guard(entity,path);const chosen=await dialog.showSaveDialog({defaultPath:name});guard(entity,path);
    if(chosen.canceled || !chosen.filePath)return {path:"",cancelled:true};
    await writeFile(chosen.filePath,bytes,{mode:0o600});return {path:chosen.filePath};
  }
  ipcMain.handle("dataTransfer:export",async(event,input:TransferExportOptions)=>{
    guard(input.entity);if(running.has(event.sender.id))throw new Error("Aktarım zaten sürüyor.");
    running.add(event.sender.id);const path=options.databasePath();
    try {
      const result=await createTransferExport(path,input,transferImageOwner,()=>guard(input.entity,path),p=>{if(!event.sender.isDestroyed())event.sender.send("dataTransfer:progress",p);});
      const name=`yardimci-${input.entity}-${input.template?"sablon":new Date().toISOString().slice(0,10)}.${input.format}`;
      const saved=await saveFile(input.entity,name,result.bytes,path);return {token:"",name,...saved,records:result.records,images:result.images,warnings:result.warnings};
    }finally{running.delete(event.sender.id);}
  });
  ipcMain.handle("dataTransfer:report",async(event,token:string)=>{
    const s=get(token,event.sender.id);if(!s.result)throw new Error("Henüz işlem sonucu yok.");
    const records=s.result.rows.map(r=>({satir:String(r.row),durum:r.status,aciklama:[...r.reasons,...r.warnings].join(" | ")}));
    const bytes=await encodeTransferFile("csv",s.entity,["satir","durum","aciklama"],records),name="aktarim-sonuc-raporu.csv";
    return {token,name,...await saveFile(s.entity,name,bytes,s.path),records:records.length,images:0,warnings:[]};
  });
  ipcMain.handle("dataTransfer:release",(event,token:string)=>{options.assertUnlocked();const s=sessions.get(token);if(s?.owner===event.sender.id&&!s.applying)sessions.delete(token);});
}
