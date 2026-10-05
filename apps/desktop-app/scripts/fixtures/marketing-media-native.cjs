const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { app, nativeImage } = require('electron');
const { DesktopDatabase } = require('../../dist-electron/database.js');
const { MarketingMediaService } = require('../../dist-electron/marketing/media-service.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'marketing-native-'));
fs.mkdirSync(path.join(root,'electron'));app.setPath('userData',path.join(root,'electron'));
app.whenReady().then(() => {
  const db=new DesktopDatabase({appPath:path.resolve('apps/desktop-app'),userDataPath:root});
  try {
    db.initialize();const saved=db.saveInitialSetup({businessName:'Native image fixture',profileId:'market',profileOptions:[],phone:'',whatsapp:'',email:'',address:'',
      webModuleUrl:'https://example.test',syncSecret:'native-fixture-secret',autoSyncEnabled:false,aiEnabled:false,aiProvider:'openai_compatible',aiService:'openai',aiProjectName:'',aiModel:'',aiBaseUrl:'https://api.openai.com/v1',aiTimeoutSeconds:30,
      aiApiKey:'',clearAiApiKey:false,servicePreferences:{whatsapp:false,android:false},initialCounts:{rooms:0,tables:0},tableCategories:[]});assert.equal(saved.ok,true,saved.message);
    const service=new MarketingMediaService(()=>db,()=>root);
    const image=nativeImage.createFromBitmap(Buffer.from([255,0,0,255,0,255,0,255]),{width:2,height:1});
    for(const bytes of [image.toPNG(),image.toJPEG(90)]) {
      const asset=service.importBytes(bytes,'upload');assert.equal(asset.width,2);assert.equal(asset.height,1);assert.equal(asset.mimeType,'image/png');
      const canonical=db.getMediaAsset(asset.id),file=service.absolutePath(canonical);assert.ok(fs.existsSync(file));assert.ok(asset.previewUrl.startsWith('data:image/png'));
      assert.equal(nativeImage.createFromPath(file).getSize().width,2);service.manage(asset.id,'delete');assert.equal(fs.existsSync(file),false);
    }
    const square=service.importBytes(nativeImage.createFromBitmap(Buffer.alloc(4*4*4,255),{width:4,height:4}).toPNG(),'upload');
    const staged=nativeImage.createFromBuffer(service.instagramJpeg(square.id));assert.equal(staged.getSize().width,320);assert.equal(staged.getSize().height,320);assert.equal(db.getMediaAsset(square.id).mimeType,'image/png');
    const wide=service.importBytes(image.toPNG(),'upload');assert.throws(()=>service.instagramJpeg(wide.id),e=>e.code==='instagram_image_ratio');
    assert.throws(()=>service.importBytes(Buffer.from('invalid image'),'upload'),error=>error.code==='invalid_media');
    console.log('D4 real Electron native image validation, PNG/JPEG normalization, dimensions, preview, canonical storage and physical deletion passed.');
  } finally {db.close();fs.rmSync(root,{recursive:true,force:true});}
}).then(()=>app.exit(0)).catch(error=>{console.error(error);app.exit(1);});
