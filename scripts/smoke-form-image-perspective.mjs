import assert from "node:assert/strict";
import { test, after } from "node:test";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";
const root=mkdtempSync(join(tmpdir(),"form-image-perspective-"));
const target=join(root,"processor.cjs");
writeFileSync(target,ts.transpileModule(readFileSync("apps/desktop-app/src/app/form-image-perspective.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
const {prepareFormImage}=createRequire(import.meta.url)(target);
after(()=>rmSync(root,{recursive:true,force:true}));
const corners=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
const spec=patch=>({corners,pageWidth:1000,pageHeight:1000,...patch});
function image(width,height,pixel=(x,y)=>[x*3,y*3,40,255]) {
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) data.set(pixel(x,y),(y*width+x)*4);
  return {width,height,data};
}
const pixel=(img,x,y)=>Array.from(img.data.subarray((y*img.width+x)*4,(y*img.width+x)*4+4));
const close=(a,b)=>a.forEach((n,i)=>assert.ok(Math.abs(n-b[i])<=1,`${a} != ${b}`));
test("identity preserves every grid pixel, corner colours and original bytes",()=>{
  const source=image(61,61),before=source.data.slice();
  const output=prepareFormImage(source,spec());
  assert.equal(output.width,61);assert.equal(output.height,61);
  assert.deepEqual(output.data,before);assert.deepEqual(source.data,before);assert.notEqual(output.data,source.data);
});
test("true trapezoid rectification: analytic interior grid, all four corners and bilinear sampling",()=>{
  const source=image(61,61);
  const quad=[{x:.25,y:0},{x:.75,y:0},{x:1,y:1},{x:0,y:1}];
  const output=prepareFormImage(source,spec({corners:quad}));
  close(pixel(output,0,0),[45,0,40,255]);close(pixel(output,output.width-1,0),[135,0,40,255]);
  close(pixel(output,output.width-1,output.height-1),[180,180,40,255]);close(pixel(output,0,output.height-1),[0,180,40,255]);
  for(const [x,y] of [[10,20],[30,30],[45,10]]) {
    const u=x/(output.width-1),v=y/(output.height-1);
    // Independently derived map for a trapezoid with top width 1/2 and bottom width 1.
    close(pixel(output,x,y),[180*(.5*u-.25*v+.25)/(1-.5*v),180*.5*v/(1-.5*v),40,255]);
  }
  // At the centre a linear crop would sample y=.5; perspective samples y=1/3.
  close(pixel(output,30,30),[90,60,40,255]);
});
test("asymmetric projective quad maps corners in screen-clockwise order",()=>{
  const source=image(61,61),quad=[{x:.1,y:.2},{x:.8,y:.1},{x:.9,y:.9},{x:.2,y:.7}];
  const output=prepareFormImage(source,spec({corners:quad}));
  for(const [i,x,y] of [[0,0,0],[1,output.width-1,0],[2,output.width-1,output.height-1],[3,0,output.height-1]]) close(pixel(output,x,y),[quad[i].x*180,quad[i].y*180,40,255]);
});
test("rotation follows rectification, clockwise 90/180/270; final template page aspect retained",()=>{
  const source=image(5,3,(x,y)=>[x*40,y*80,0,255]);
  const expected={0:[0,0,0,255],90:[0,160,0,255],180:[160,160,0,255],270:[160,0,0,255]};
  for(const rotation of [0,90,180,270]) {
    const out=prepareFormImage(source,spec({rotation,pageWidth:rotation%180?300:500,pageHeight:rotation%180?500:300}));
    assert.equal(out.width,rotation%180?3:5);assert.equal(out.height,rotation%180?5:3);
    assert.deepEqual(pixel(out,0,0),expected[rotation]);
    for(let y=0;y<out.height;y++) for(let x=0;x<out.width;x++) {
      const sx=rotation===90?y:rotation===180?4-x:rotation===270?4-y:x;
      const sy=rotation===90?2-x:rotation===180?2-y:rotation===270?x:y;
      assert.deepEqual(pixel(out,x,y),pixel(source,sx,sy));
    }
  }
  const page=prepareFormImage(image(301,501),spec({rotation:90,pageWidth:2100,pageHeight:2970}));
  assert.ok(Math.abs(page.width/page.height-210/297)<.005);
});
test("brightness, contrast, grayscale, threshold and transparent white compositing",()=>{
  const source=image(2,2,()=>[100,150,200,255]);
  assert.deepEqual(pixel(prepareFormImage(source,spec({brightness:.2,contrast:2})),0,0),[124,224,255,255]);
  const gray=pixel(prepareFormImage(source,spec({grayscale:true})),0,0);assert.equal(gray[0],gray[1]);assert.equal(gray[1],gray[2]);
  assert.deepEqual(pixel(prepareFormImage(source,spec({threshold:150})),0,0),[0,0,0,255]);
  assert.deepEqual(pixel(prepareFormImage(source,spec({threshold:100})),0,0),[255,255,255,255]);
  assert.deepEqual(pixel(prepareFormImage(image(2,2,()=>[0,10,20,0]),spec()),0,0),[255,255,255,255]);
});
test("invalid, concave, self-crossing, reversed, collapsed and near-singular corners fail",()=>{
  const source=image(2,2);
  const invalid=[[],corners.slice(0,3),[corners[0],corners[3],corners[2],corners[1]],
    [corners[0],corners[2],corners[1],corners[3]],
    [{x:0,y:0},{x:1,y:0},{x:.2,y:.2},{x:0,y:1}],
    [{x:0,y:0},{x:1,y:0},{x:1,y:1e-9},{x:0,y:1e-9}],
    [corners[0],corners[0],corners[2],corners[3]]];
  for(const value of [NaN,Infinity,-.1,1.1,"0",null]) invalid.push([{x:value,y:0},...corners.slice(1)]);
  for(const value of invalid) assert.throws(()=>prepareFormImage(source,spec({corners:value})),/TRANSFORM_INVALID/);
  for(const patch of [{rotation:45},{rotation:null},{brightness:null},{contrast:null},{brightness:2},{contrast:-1},{threshold:256},{grayscale:1},{pageWidth:Infinity},{pageHeight:0}]) assert.throws(()=>prepareFormImage(source,spec(patch)),/TRANSFORM_INVALID/);
});
test("input bounds checked before allocations; output <=2200 side and <=4MP",()=>{
  for(const source of [{width:1e9,height:2,data:new Uint8Array(0)},{width:5001,height:5000,data:new Uint8Array(0)},{width:2,height:2,data:new Uint8Array(15)},{width:2.5,height:2,data:new Uint8Array(20)}]) assert.throws(()=>prepareFormImage(source,spec()),/TRANSFORM_INVALID/);
  const out=prepareFormImage(image(2400,1800,()=>[100,100,100,255]),spec({pageWidth:4000,pageHeight:3000}));
  assert.ok(out.width<=2200&&out.height<=2200);assert.ok(out.width*out.height<=4_000_000);
  assert.ok(Math.abs(out.width/out.height-4/3)<.002);
  // A square independently reaches the area cap before the 2200px side cap.
  const square=prepareFormImage(image(2100,2100,()=>[100,100,100,255]),spec());
  assert.equal(square.width,2000);assert.equal(square.height,2000);
  for(const [pageWidth,pageHeight] of [[5000,200],[200,10000]]) {
    const small=prepareFormImage(image(2,2),spec({pageWidth,pageHeight}));
    assert.ok(Math.abs(small.width-small.height*pageWidth/pageHeight)<=1);
    assert.ok(small.width*small.height<=4_000_000);
  }
});
