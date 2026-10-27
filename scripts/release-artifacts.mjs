import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkDemoTemplate} from './sync-demo-template.mjs';
import {createReleaseArtifacts,validatePreparedWebModule} from './lib/release-artifacts.mjs';

try {
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const {product,artifacts}=await createReleaseArtifacts(root);
  await validatePreparedWebModule(root);
  checkDemoTemplate();
  console.log(`Release paketleri doğrulandı: ${product.version} / Android ${product.androidVersionCode}`);
  for(const artifact of artifacts)console.log(`${artifact.label}: ${artifact.name} (${artifact.size} bytes) SHA-256 ${artifact.sha256}`);
} catch(error) {
  console.error(error instanceof Error?error.message:'Release paketi doğrulanamadı.');
  process.exitCode=1;
}
