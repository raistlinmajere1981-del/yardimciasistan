import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../runtime/core.js',import.meta.url),'utf8');
vm.runInThisContext(code);const C=globalThis.ImageInspectorCore;
const fixture=JSON.parse(readFileSync(new URL('fixture.json',import.meta.url)));
for(const mode of Object.keys(C.modes))test(`${mode}: exact native-baseline RGBA, immutable original`,()=>{
 const source=new Uint8ClampedArray(fixture.rgba),original=source.slice();
 assert.deepEqual([...C.apply(source,fixture.width,fixture.height,mode)],fixture.expected[mode]);assert.deepEqual(source,original);
});
test('zoom anchors at the finger, clamps pan, supports fit and both rotations',()=>{
 const t=new C.Transform();t.size(400,400,800,800);t.scale(2,100,200);assert.equal(t.x,100);t.pan(10000,-10000);assert.equal(t.x,200);assert.equal(t.y,-200);t.scale(100);assert.equal(t.zoom,8);t.reset();assert.equal(t.zoom,1);
 t.size(400,300,800,400);t.rotate();assert.equal(t.fit(),.375);t.rotate(-1);assert.equal(t.rotation,0);t.size(400,300,800,400,true);t.pan(40,40);assert.equal(t.x,40);
});
test('independent and linked overlay layers, opacity, alignment and history',()=>{
 const s=new C.Session('compare');s.layers.forEach(l=>l.transform.size(400,400,800,800,true));s.layout='overlay';s.active=1;s.move('pan',50,60);assert.equal(s.layers[0].transform.x,0);assert.equal(s.layers[1].transform.x,50);
 s.linked=true;s.move('scale',2);assert.equal(s.layers[0].transform.zoom,2);assert.equal(s.layers[1].transform.zoom,2);s.opacity=.2;s.align();assert.equal(s.opacity,.5);assert.equal(s.layers[1].transform.zoom,1);s.undo();assert.equal(s.opacity,.2);
});
test('filter preserves geometry; photo changes reset geometry and retain filter',()=>{
 const s=new C.Session();s.layers[0].transform.scale(3);s.filter(0,'detail');assert.equal(s.layers[0].transform.zoom,3);s.photo(0,1);assert.equal(s.layers[0].mode,'detail');assert.equal(s.layers[0].transform.zoom,1);assert.equal(s.layers[0].index,1);
});
test('corrupt, unsupported and oversized headers rejected before allocation',()=>{
 assert.throws(()=>C.dimensions(new ArrayBuffer(2)));assert.throws(()=>C.apply(new Uint8ClampedArray(4),9000,9000,'normal'));
 const png=new ArrayBuffer(24),v=new DataView(png);v.setUint32(0,0x89504e47);v.setUint32(4,0x0d0a1a0a);v.setUint32(12,0x49484452);v.setUint32(16,10000);v.setUint32(20,10001);assert.throws(()=>C.dimensions(png));
 v.setUint32(16,1200);v.setUint32(20,800);assert.equal(C.dimensions(png).width,1200);
});
test('cooperative cancellation and unknown modes never return partial output',()=>{
 assert.throws(()=>C.apply(new Uint8ClampedArray(36),3,3,'edge',()=>true),/cancelled/);assert.throws(()=>C.apply(new Uint8ClampedArray(4),1,1,'unknown'));
});

test('bounded EXIF parser preserves swapped dimensions for quarter-turn JPEG resize',()=>{
 const b=new Uint8Array(2+36+13),v=new DataView(b.buffer);b.set([255,216,255,225,0,34,69,120,105,102,0,0,77,77,0,42]);
 v.setUint32(16,8);v.setUint16(20,1);v.setUint16(22,0x112);v.setUint16(24,3);v.setUint32(26,1);v.setUint16(30,6);
 b.set([255,192,0,11,8,2,88,3,32,1,1,0x11,0],38);
 const d=C.dimensions(b.buffer);assert.equal(d.width,800);assert.equal(d.height,600);assert.equal(d.orientation,6);
 v.setUint32(16,0xffffffff);assert.equal(C.dimensions(b.buffer).orientation,1,'invalid EXIF offsets never escape segment bounds');
});
