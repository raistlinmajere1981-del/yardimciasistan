import { useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { reportAppStatus } from "../../app/runtime-state";
import { ActionButton } from "../ui/ActionButton";

/** Room toolbar entry point; native printer confirmation is owned by main,
 * not a second modal inside the canonical room workspace. */
export function RoomQrPrintAction({roomId,stayId,enabled,disabled}:{
  roomId:string;stayId:string|undefined;enabled:boolean;disabled:boolean;
}) {
  const [available,setAvailable]=useState(false);
  const [printing,setPrinting]=useState(false);
  const inFlight=useRef(false);
  useEffect(()=>{
    let current=true;
    setAvailable(false);
    const read = window.yardimciDesktop?.getQrMenuWebPublication;
    if(!enabled||!stayId||!read)return;
    void read().then(result=>{
      if(current)setAvailable(result.roomOrdersEnabled === true && (result.rooms ?? []).some(room=>room.id===roomId));
    }).catch(()=>{if(current)setAvailable(false);});
    return()=>{current=false;};
  },[roomId,stayId,enabled]);
  async function print() {
    if(inFlight.current||disabled||!available||!window.yardimciDesktop?.printQrCodes)return;
    inFlight.current=true;setPrinting(true);
    try {
      const result=await window.yardimciDesktop.printQrCodes({kind:"qr_room",ids:[roomId]});
      if(!result.ok)reportAppStatus("error",result.message);
      else if(result.value==="accepted")reportAppStatus("success","Oda QR kodu yazıcı kuyruğuna gönderildi.");
      else if(result.value==="unknown")reportAppStatus("error","QR baskı sonucu belirsiz. Yeniden göndermeden önce yazıcı kuyruğunu kontrol edin.");
      else if(result.value==="failed")reportAppStatus("error","Oda QR yazdırma başarısız oldu.");
    }catch{reportAppStatus("error","Oda QR baskısı başlatılamadı.");}
    finally{inFlight.current=false;setPrinting(false);}
  }
  if(!available)return null;
  return <ActionButton variant="secondary" disabled={disabled||printing} busy={printing} onClick={()=>void print()}>
    <Printer size={16} aria-hidden="true"/> Oda QR Yazdır
  </ActionButton>;
}
