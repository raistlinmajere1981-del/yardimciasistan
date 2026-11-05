// stdout is a redacted, deterministic version target; stdin is public API JSON only.
import {readFileSync} from 'node:fs';
import {assertBackendVersion, readVersions} from './lib/site-release-policy.mjs';
const mode=process.argv[2];
if(process.argv.length!==3 || !['--expected','--verify-backend'].includes(mode)) throw Error('Use --expected|--verify-backend');
if(mode==='--expected') console.log(JSON.stringify(readVersions()));
else console.log(assertBackendVersion(JSON.parse(readFileSync(0,'utf8'))));
