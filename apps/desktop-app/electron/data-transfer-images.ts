import { decodeProductImageBytes } from "./product-image-codec";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { imageMime } from "./data-transfer-format";
import { prepareProductImageForSave, prepareOriginalProductImageAssets } from "./product-data-service";
import type { TransferImageOwner } from "./data-transfer-service";
function publicAddress(address: string) {
  if (isIP(address) === 4) {
    const p=address.split(".").map(Number), a=p[0]!,b=p[1]!;
    return !(a===0 || a===10 || a===127 || a===169&&b===254 || a===172&&b>=16&&b<=31 || a===192&&b===168 || a===100&&b>=64&&b<=127 || a>=224 || a===198&&(b===18||b===19));
  }
  // Restrict downloads to IPv4, avoiding mapped/local IPv6 and DNS rebind races.
  return false;
}
export const transferImageOwner: TransferImageOwner = {
  validate(bytes) {
    imageMime(bytes);decodeProductImageBytes(Buffer.from(bytes));
  },
  async prepare(databasePath,productId,bytes,originals) {
    this.validate(bytes);
    const prepared=await prepareProductImageForSave(databasePath,{ id:productId,name:"",manualImageDataUrl:`data:${imageMime(bytes)};base64,${Buffer.from(bytes).toString("base64")}` });
    if (!prepared?.assetPath) throw new Error("Görsel uygulama arşivine alınamadı.");
    prepared.originalAssets=prepareOriginalProductImageAssets(databasePath,productId,(originals?.length?originals:[bytes]).map(original=>({bytes:original,format:imageMime(original)})));
    return prepared;
  },
  async remote(url) {
    // Pin a validated address in the HTTPS connection; no implicit redirects or proxy lookup.
    const { request } = await import("node:https");
    const target=new URL(url);if(target.protocol!=="https:" || target.username || target.password || (target.port && target.port!=="443")) throw new Error("Görsel URL güvenli değil.");
    const addresses=await lookup(target.hostname,{all:true});if(!addresses.length || addresses.some(a=>!publicAddress(a.address))) throw new Error("Görsel adresi genel internete ait olmalı.");
    const address=addresses[0]!;
    const bytes=await new Promise<Buffer>((resolve,reject)=>{
      const requestHandle=request(target,{lookup:(_hostname,_options,callback)=>callback(null,address.address,address.family),headers:{Accept:"image/jpeg,image/png,image/webp"}},response=>{
        if(response.statusCode!==200 || !/^image\/(jpeg|png|webp)(;|$)/i.test(String(response.headers["content-type"]??""))){response.destroy();reject(new Error("Görsel yanıtı geçersiz."));return;}
        const chunks:Buffer[]=[];let size=0;
        response.on("data",(chunk:Buffer)=>{size+=chunk.length;if(size>5*1024*1024){response.destroy(new Error("Görsel boyut sınırı aşıldı."));return;}chunks.push(chunk);});
        response.on("error",reject);response.on("end",()=>resolve(Buffer.concat(chunks)));
      });
      const timer=setTimeout(()=>requestHandle.destroy(new Error("Görsel indirme zaman aşımı.")),10000);
      requestHandle.on("close",()=>clearTimeout(timer));requestHandle.on("error",reject);requestHandle.end();
    });
    this.validate(bytes);return bytes;
  }
};
