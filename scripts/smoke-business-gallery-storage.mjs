import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
const root = mkdtempSync(join(tmpdir(), "ya-business-gallery-"));
const source = join(root, "fixture.png");
writeFileSync(source, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==", "base64"));
const electronMock = {
  dialog: { showOpenDialog: async () => ({ canceled:false, filePaths:[source] }) },
  nativeImage: { createFromPath: () => ({ isEmpty:()=>false, resize:()=>({toDataURL:()=> "data:image/png;base64,dGVzdA=="}) }) }
};
const originalLoad=Module._load;
Module._load=function(id,parent,isMain) { return id==="electron" ? electronMock : originalLoad.call(this,id,parent,isMain); };
const require=createRequire(import.meta.url);
try {
  const gallery=require(resolve("apps/desktop-app/dist-electron/business-gallery-service.js"));
  assert.equal(gallery.listBusinessGallery(root).length,0);
  const first=await gallery.addGalleryPhoto(root,null);
  assert.equal(first.ok,true,first.message);
  assert.equal(gallery.galleryDraftState(root).dirty,true);
  assert.equal(first.media.length,1);
  const second=await gallery.addGalleryPhoto(root,null);
  assert.equal(second.ok,true,second.message);
  assert.equal(second.media.length,2);
  assert.equal(second.media[0].previewDataUrl?.startsWith("data:image/png"),true);
  const reversed=gallery.moveGalleryPhoto(root,second.media[1].id,"up");
  assert.equal(reversed.ok,true,reversed.message);
  assert.equal(reversed.media[0].id,second.media[1].id);
  const cover=gallery.updateGalleryPhoto(root,reversed.media[0].id,"cover","Giriş");
  assert.equal(cover.ok,true,cover.message);
  assert.equal(cover.media[0].kind,"cover");
  const commit=gallery.commitGalleryDraft(root);
  assert.equal(commit.ok,true,commit.message);
  assert.equal(gallery.galleryDraftState(root).dirty,false);
  assert.equal(gallery.listBusinessGallery(root)[0].title,"Giriş");
  assert.equal(gallery.pendingGallery(root).length,2);
  for (const item of gallery.pendingGallery(root)) {
    gallery.markGalleryUploaded(root,item.id,"/yardimci-asistan/media/gallery/gallery/"+item.id+".png");
  }
  assert.equal(gallery.pendingGallery(root).length,0);
  assert.equal(gallery.publishedGallery(root).length,2);
  const del=gallery.removeGalleryPhoto(root,reversed.media[0].id);
  assert.equal(del.ok,true);
  assert.equal(gallery.galleryDraftState(root).dirty,true);
  assert.equal(gallery.discardGalleryDraft(root).ok,true);
  assert.equal(gallery.publishedGallery(root).length,2);
  console.log("business-gallery-storage-draft-publish-smoke-ok");
} finally {
  Module._load=originalLoad;
  rmSync(root,{recursive:true,force:true});
}
