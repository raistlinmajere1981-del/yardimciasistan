import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { dialog, nativeImage } from "electron";
import type { GeneratedImage } from "@yardimci-asistan/ai-core";
import type { MarketingAssetView, MediaAsset } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "../database";
import { desktopLog } from "../desktop-logger";
import { MarketingError } from "./validation";

/** Canonical files follow existing userData/assets storage conventions; metadata uses the facade. */
export class MarketingMediaService {
  constructor(private readonly database:()=>DesktopDatabase, private readonly userDataPath:()=>string) {}
  absolutePath(asset: MediaAsset): string {
    const root=path.resolve(this.userDataPath(),"assets","marketing"),file=path.resolve(root,asset.storageRef);
    if (!file.startsWith(root+path.sep)) throw new MarketingError("invalid_media","Görsel yolu geçersiz."); return file;
  }
  view(asset: MediaAsset): MarketingAssetView {
    const {storageRef:_storage,contentHash:_hash,...publicAsset}=asset;
    let previewUrl="";
    const file=this.absolutePath(asset);
    if (fs.existsSync(file)) { const image=nativeImage.createFromPath(file); if (!image.isEmpty()) previewUrl=image.resize({width:480,quality:"good"}).toDataURL(); }
    return {...publicAsset,previewUrl,...this.database().marketingAssetUsage(asset.id)};
  }
  list(): MarketingAssetView[] { return this.database().listMediaAssets().map(asset=>this.view(asset)); }
  async upload(): Promise<MarketingAssetView[]> {
    const result=await dialog.showOpenDialog({title:"Pazarlama görselleri",properties:["openFile","multiSelections"],filters:[{name:"Görseller",extensions:["png","jpg","jpeg","webp"]}]});
    if (result.canceled) return [];
    if (result.filePaths.length>20) throw new MarketingError("invalid_media","Bir seferde en fazla 20 görsel yükleyin.");
    // Validate the whole selection before persisting, so one bad file cannot leave a hidden partial import.
    const candidates=result.filePaths.map(file=> {
      const stat=fs.statSync(file);
      if (!stat.isFile() || stat.size>30*1024*1024 || !stat.size) throw new MarketingError("invalid_media","Görsel en fazla 30 MB olabilir.");
      return this.validate(fs.readFileSync(file));
    });
    return candidates.map(candidate=>this.store(candidate,"upload"));
  }
  /** Also used by fixture adapters; image bytes never become renderer publication input. */
  importBytes(bytes: Uint8Array, source: "upload" | "ai", metadata?: MediaAsset["aiGenerationMetadata"]): MarketingAssetView {
    return this.store(this.validate(bytes),source,metadata);
  }
  generated(output: GeneratedImage): MarketingAssetView {
    return this.importBytes(output.bytes,"ai",{providerId:output.providerId,modelId:output.modelId,intent:"marketing_image"});
  }
  private validate(bytes: Uint8Array) {
    if (!bytes.length || bytes.length>30*1024*1024) throw new MarketingError("invalid_media","Görsel en fazla 30 MB olabilir.");
    const image=nativeImage.createFromBuffer(Buffer.from(bytes));
    const {width,height}=image.getSize();
    if (image.isEmpty() || width<=0 || height<=0 || width*height>40_000_000) throw new MarketingError("invalid_media","Geçerli PNG/JPG/WebP görseli seçin.");
    // Normalize to PNG to remove metadata and ensure immutable validated publish bytes.
    const normalized=image.toPNG();
    if (normalized.length>30*1024*1024) throw new MarketingError("invalid_media","Görsel dosyası çok büyük.");
    return {bytes:normalized,width,height};
  }
  private store(candidate: {bytes: Buffer;width:number;height:number}, source: "upload" | "ai", metadata?: MediaAsset["aiGenerationMetadata"]): MarketingAssetView {
    const id=`asset_${randomUUID()}`,storageRef=`files/${id}.png`;
    const file=this.absolutePath({storageRef} as MediaAsset);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,candidate.bytes,{flag:"wx"});
    try {
      const asset=this.database().insertMediaAsset({id,kind:"image",source,storageRef,mimeType:"image/png",width:candidate.width,height:candidate.height,fileSize:candidate.bytes.length,
        altText:"",contentHash:createHash("sha256").update(candidate.bytes).digest("hex"),createdAt:new Date().toISOString(),...(metadata?{aiGenerationMetadata:metadata}:{})});
      desktopLog.info({scope:"marketing",event:source==="ai"?"marketing.asset.ai_generated":"marketing.asset.created",message:"Pazarlama görseli kütüphaneye kaydedildi.",meta:{assetId:id,source}});
      return this.view(asset);
    } catch (error) { fs.rmSync(file,{force:true});throw error; }
  }
  manage(id: string, action: "archive" | "delete", altText?: string): void {
    const asset=this.database().getMediaAsset(id);
    this.database().manageMediaAsset(id,action,altText);
    if (action==="delete") fs.rmSync(this.absolutePath(asset),{force:true});
  }
}
