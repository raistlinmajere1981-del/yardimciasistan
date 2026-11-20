import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {canonicalEngineRoot, canonicalProvenance, checkCopy, vendorRoot} from '../web-site-template/tools/sync-effect-engine.mjs';
import {dispatch} from '../apps/admin-control-center/effects-source/scripts/admin-studio.mjs';

const main=resolve(import.meta.dirname,'..');
const admin=join(main,'apps/admin-control-center');
const read=relative=>readFileSync(join(admin,relative),'utf8');

test('Admin cannot edit or deploy the BirDeSenGör object scene',async()=>{
  const projects=await dispatch('list');
  assert.ok(projects.length>0);
  assert.ok(projects.every(project=>project.images.every(image=>image.kind!=='sceneObject')));
  await assert.rejects(dispatch('load',{id:'birdesengor:scene_v2'}),/Kayıtlı hedef bulunamadı/);
  assert.doesNotMatch(read('electron/main.ts'),/admin:effects-birdesengor/);
  assert.doesNotMatch(read('electron/services/deployment-runner.ts'),/birdesengor/);
  assert.doesNotMatch(read('shared/contracts.ts'),/BIRDESENGOR_EFFECT/);
  assert.doesNotMatch(read('src/EffectStudio.tsx'),/birdesengor|scene\.html|isLocalScene/i);
  assert.equal(existsSync(join(admin,'public/effect-studio/scene.html')),false);
});

test('complete photo editor is owned and built inside YardimciAsistan',async()=>{
  assert.ok(canonicalEngineRoot.endsWith('/YardimciAsistan/packages/effect-engine'));
  const expected=await canonicalProvenance(canonicalEngineRoot);
  assert.equal(expected.source,'YardimciAsistan');
  assert.equal(Object.keys(expected.files).length,24);
  checkCopy(vendorRoot,expected);
  assert.ok(readFileSync(join(canonicalEngineRoot,'src/editor/main.mjs'),'utf8').includes('mountPhotoEditor'));
  assert.doesNotMatch(readFileSync(join(canonicalEngineRoot,'src/editor/main.mjs'),'utf8'),/postMessage|window.parent/);
  assert.equal(existsSync(join(admin,'effects-source/index.html')),false);
  assert.equal(existsSync(join(admin,'scripts/sync-effect-studio.mjs')),false);
  assert.doesNotMatch(read('src/EffectStudio.tsx'),/iframe|postMessage|effect-studio\/index.html/);
});
