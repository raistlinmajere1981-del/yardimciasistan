const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const os=require("node:os");
const {createRequire}=require("node:module");
const {runInNewContext}=require("node:vm");
const {DatabaseSync}=require("node:sqlite");
const {app,nativeImage}=require("electron");
const {transferImageOwner}=require("../../dist-electron/data-transfer-images.js");
const {encodeTransferFile,transferHash,imageMime,parseTransferFile}=require("../../dist-electron/data-transfer-format.js");
const {DEFAULT_TRANSFER_PREFERENCES:P}=require("../../dist-electron/data-transfer-contract.js");
const {cleanupOrphanProductImages}=require("../../dist-electron/product-data-service.js");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"transfer-native-"));
app.setPath("userData",path.join(root,"electron"));
app.whenReady().then(async()=>{
 const databasePath=path.join(root,"fixture.sqlite"),db=new DatabaseSync(databasePath);
 try{
  db.exec(fs.readFileSync("apps/desktop-app/db/schema.sql","utf8"));db.exec("INSERT INTO business(id,name,display_name,profile_id,created_at,updated_at) VALUES('b','Test','Test','market','t','t')");
  for(const c of ["core.customers","commerce.catalog","channel.online_sales"])db.prepare("INSERT INTO business_capabilities(business_id,capability_id,is_enabled,created_at,updated_at) VALUES('b',?,1,'t','t')").run(c);
  const images=[nativeImage.createFromBitmap(Buffer.from([10,20,30,255]),{width:1,height:1}).toPNG(),nativeImage.createFromBitmap(Buffer.from([50,60,70,255]),{width:1,height:1}).toPNG()];
  const assets=Object.fromEntries(images.map((bytes,i)=>[`assets/${i}.png`,bytes]));
  const manifest=images.map((bytes,i)=>({path:`assets/${i}.png`,hash:transferHash(bytes),format:imageMime(bytes),productId:"",sku:"IMG"}));
  const archive=await encodeTransferFile("zip","products",["name","sku","image"],[{name:"Görselli ürün",sku:"IMG",image:"assets/0.png"}],assets,manifest);
  const handlers=new Map(),ipcFile=path.resolve("apps/desktop-app/dist-electron/ipc/data-transfer-ipc.js"),compiledRequire=createRequire(ipcFile),exports={};
  let unlocked=true,mutations=0,lockOnSave=false;
  runInNewContext(fs.readFileSync(ipcFile,"utf8"),{exports,require:name=>name==="electron"?{ipcMain:{handle:(channel,fn)=>handlers.set(channel,fn)},dialog:{showSaveDialog:async()=>{if(lockOnSave)unlocked=false;return {canceled:false,filePath:path.join(root,"export.zip")};}}}:compiledRequire(name),setTimeout,clearTimeout,Buffer,console});
  exports.registerDataTransferIpc({databasePath:()=>databasePath,assertUnlocked:()=>{if(!unlocked)throw new Error("session locked");},onMutation:()=>mutations++});
  const event={sender:{id:1,isDestroyed:()=>false,send:()=>{}}},other={sender:{...event.sender,id:2}};
  const invoke=(channel,...args)=>handlers.get(`dataTransfer:${channel}`)(event,...args);
  unlocked=false;await assert.rejects(()=>invoke("upload","products","test.zip",archive),/session locked/);unlocked=true;
  const uploaded=await invoke("upload","products","test.zip",archive);
  assert.throws(()=>handlers.get("dataTransfer:rows")(other,uploaded.token,"all",0),/oturumu/);
  const preview=await invoke("preview",uploaded.token,uploaded.mapping,{...P});assert.equal(preview.counts.new,1);
  await assert.rejects(()=>invoke("apply",uploaded.token,"wrong-revision"),/Önizleme/);
  const pending=invoke("apply",uploaded.token,preview.revision);await assert.rejects(()=>invoke("apply",uploaded.token,preview.revision),/sürüyor/);const result=await pending;assert.equal(result.added,1);
  assert.equal((await invoke("apply",uploaded.token,preview.revision)).added,1);assert.equal(mutations,1);
  const product=db.prepare("SELECT * FROM catalog_products WHERE sku='IMG'").get(),originals=JSON.parse(product.image_original_assets_json);assert.equal(originals.length,2);
  for(const [i,item]of originals.entries()){const stored=fs.readFileSync(path.join(root,item.assetPath));assert.equal(transferHash(stored),transferHash(images[i]));}
  cleanupOrphanProductImages(databasePath);for(const item of originals)assert(fs.existsSync(path.join(root,item.assetPath)));
  const exported=await invoke("export",{entity:"products",format:"zip",scope:"all",includeImages:true,includeIdentity:false});assert.equal(exported.images,2);const roundtrip=await parseTransferFile("roundtrip.zip",fs.readFileSync(exported.path),"products");assert.equal(Object.keys(roundtrip.assets).length,2);
  const before=fs.readFileSync(exported.path);lockOnSave=true;await assert.rejects(()=>invoke("export",{entity:"products",format:"csv",scope:"all",includeImages:false,includeIdentity:false}),/session locked/);assert.deepEqual(fs.readFileSync(exported.path),before);unlocked=true;lockOnSave=false;
  // WebP must pass actual decoding even where nativeImage only accepts PNG/JPEG.
  const {Transformer}=require("@napi-rs/image");
  const webp=new Transformer(images[0]).webpLosslessSync();
  transferImageOwner.validate(webp);
  const preparedWebp=await transferImageOwner.prepare(databasePath,product.id,webp,[webp]);
  assert(preparedWebp.assetPath.endsWith(".jpg"));
  assert.equal(preparedWebp.originalAssets[0].format,"image/webp");
  assert.equal(transferHash(fs.readFileSync(path.join(root,preparedWebp.originalAssets[0].assetPath))),transferHash(webp));
  assert.throws(()=>transferImageOwner.validate(Buffer.from("RIFF1234WEBPbad-data")),/WEBP.*çözümlenemedi/);
  transferImageOwner.validate(images[0]);assert.throws(()=>transferImageOwner.validate(Buffer.from([0xff,0xd8,0xff,0,0,0])),/çözümlenemedi/);
  const pilotManifest="/home/raistlin/teknikel_catalog_prep/image-manifest.json";
  if(process.argv.includes("--external-pilots") && fs.existsSync(pilotManifest))for(const item of JSON.parse(fs.readFileSync(pilotManifest,"utf8")).images)transferImageOwner.validate(fs.readFileSync(`/home/raistlin/teknikel_catalog_prep/images-original/${item.archive_filename}`));
  console.log(`${process.env.PRODUCT_PHOTO_NODE_CODEC === "1" ? "data-transfer-node-codec-service-ok (Electron encoder unproved)" : "data-transfer-native-smoke-ok"}: decoder/original archives, IPC lock/owner/revision/busy/retry guards, local save gate`);
 }finally{db.close();fs.rmSync(root,{recursive:true,force:true});}
}).then(()=>app.exit(0)).catch(error=>{console.error(error);app.exit(1);});
