import { createRoot } from "react-dom/client";
import { QrMenuPanel } from "../../apps/desktop-app/src/components/menu/QrMenuPanel";
import { RoomQrPrintAction } from "../../apps/desktop-app/src/components/pension/RoomQrPrintAction";
import "../../apps/desktop-app/src/styles/index.css";

const rooms = Array.from({length:130},(_,i)=>({id:"room_"+(i+1),name:"Oda "+(i+1),number:String(i+1),token:"token"+(i+1)}));
const tables = Array.from({length:65},(_,i)=>({id:"table_"+(i+1),name:"Masa "+(i+1),area:i%2?"Bahçe":"Salon",token:"tabletoken"+(i+1)}));
let printed = [];
let reads = 0;
Object.assign(window, {
  yardimciDesktop: {
    getQrMenuWebPublication: async () => { reads++; return {enabled:true,ordersEnabled:true,roomOrdersEnabled:true,tables:structuredClone(tables),rooms:structuredClone(rooms)}; },
    setQrMenuWebPublication: async (enabled) => ({ok:true,enabled,message:"Kaydedildi"}),
    printQrCodes: async input => { printed.push(input); return {ok:true,value:"accepted"}; },
    openExternal: async () => true
  },
  qrUiFixture: { prints:()=>structuredClone(printed), reads:()=>reads }
});
createRoot(document.getElementById("root")).render(
  <div className="desktop-shell"><aside id="desktop-sidebar"></aside><main className="content">
    <header className="page-header">Menü</header>
    <QrMenuPanel enabled webModuleUrl="https://yardimciasistan.alwaysdata.net/yardimci-asistan/" onPreview={()=>{}}/>
    <RoomQrPrintAction roomId="room_1" stayId="stay_1" enabled disabled={false}/>
  </main></div>
);
