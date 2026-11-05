// Local release evidence only. Never reads credentials, environment overrides or network.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync, readFileSync} from 'node:fs';
import {dirname, join, resolve, parse} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inventory} from '../../web-site-template/tools/manifest.mjs';
export const policyRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
export function regular(file) {
 let cursor=resolve(file);
 while(cursor!==parse(cursor).root) {assert.ok(!lstatSync(cursor).isSymbolicLink(),'Release symlink forbidden'); cursor=dirname(cursor);}
 assert.ok(lstatSync(file).isFile(),'Regular release file required');
}
export function readVersions(root=policyRoot) {
 const file=join(root,'product-version.json'); regular(file);
 const p=JSON.parse(readFileSync(file));
 for(const value of [p.version,p.webModuleVersion]) assert.match(value,/^\d+\.\d+\.\d+$/);
 return {product_version:p.version,web_module_version:p.webModuleVersion};
}
export function assertBackendVersion(actual,expected=readVersions()) {
 assert.equal(actual.product_version,expected.product_version,'Backend product version mismatch');
 assert.equal(actual.web_module_version,expected.web_module_version,'Backend module version mismatch');
 return expected.product_version;
}
export function releaseTarget(installed) {
 const source=join(policyRoot,'web-site-template'), file=join(source,'template-manifest.json'); regular(file);
 const m=JSON.parse(readFileSync(file));
 assert.equal(m.format,1); assert.match(m.template_version,/^\d+\.\d+\.\d+$/);
 assert.deepEqual(inventory(source),m.common,'Central source manifest stale');
 const installedFile=join(installed,'template-manifest.json'); regular(installedFile);
 assert.deepEqual(JSON.parse(readFileSync(installedFile)),m,'Installed release differs from central target');
 assert.deepEqual(inventory(installed),m.common,'Installed common files differ');
 const provenance=join(installed,'public/assets/vendor/effect-engine/provenance.json'); regular(provenance);
 return {...readVersions(),template_version:m.template_version,template_manifest_sha256:sha(file),local_installed_manifest_sha256:sha(installedFile),effect_provenance_sha256:sha(provenance)};
}
export function retirementPreview(repo,identity,activeFiles) {
 const file=join(repo,'scripts/retired-paths.json'); regular(file);
 const plan=JSON.parse(readFileSync(file)); assert.equal(plan.identity,identity); assert.equal(plan.format,1);
 for(const [path,hash] of Object.entries(plan.files)) {
  assert.ok(!activeFiles.includes(path),'Active path cannot retire');
  assert.ok(!path.includes('..') && /^(?:inc\/[a-z-]+\.php|assets\/(?:[a-z-]+\.(?:js|mjs)|(?:assistant|js|effect-engine)\/[A-Za-z0-9_./-]+\.(?:js|mjs)))$/.test(path),'Not a legacy code path');
  assert.ok(!/(?:^|\/)(?:secrets?|credentials?|config|data|uploads?|media|scenes?|downloads?)(?:[/.]|$)|\.local\./i.test(path),'Protected retirement path');
  regular(join(repo,path)); assert.equal(sha(join(repo,path)),hash,'Local retirement ownership changed: '+path);
 }
 return plan;
}
