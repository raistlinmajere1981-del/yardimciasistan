// Existing maintenance entry now checks the current guide. Retired TR/EN artwork renderers are not run.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

export function checkGuideImages() {
  const root=resolve('test-site/landing/assets/guide');
  const manifest=JSON.parse(readFileSync(join(root,'sources.json'),'utf8'));
  assert.ok(manifest.images.length>0);
  const paths=manifest.images.map(entry=>{
    assert.match(entry.file,/^[a-zA-Z0-9_-]+\.webp$/);
    assert.ok(typeof entry.source==='string'&&entry.source.length>0,'Source provenance is required');
    assert.ok(typeof entry.capture==='string'&&entry.capture.length>0,'Capture scope must remain explicit');
    const path=join(root,entry.file),bytes=readFileSync(path);
    assert.equal(bytes.length,entry.bytes,entry.file);
    assert.equal(bytes.toString('ascii',8,12),'WEBP',entry.file);
    return path;
  });
  const measured=spawnSync('php',['-r','echo json_encode(array_map(static fn($path)=>getimagesize($path),array_slice($argv,1)));',...paths],{encoding:'utf8'});
  assert.equal(measured.status,0,measured.stderr);
  for(const [index,dimensions] of JSON.parse(measured.stdout).entries()) {
    assert.ok(dimensions,'Screenshot metadata must decode');
    assert.equal(dimensions[0],manifest.images[index].width,manifest.images[index].file);
    assert.equal(dimensions[1],manifest.images[index].height,manifest.images[index].file);
  }
  console.log(`guide-images-provenance-ok: ${paths.length} current screenshots; no generation or image changes`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length,2,'This read-only guide check does not regenerate retired artwork');
  checkGuideImages();
}
