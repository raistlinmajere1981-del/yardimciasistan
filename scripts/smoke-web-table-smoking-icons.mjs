import assert from 'node:assert/strict';
import {exercisePublicationContracts} from './test-helpers/template-publication-contracts.mjs';

// The retired JS detail renderer is no longer served. Verify the same published
// table through the current HTTP API and canonical/BlackSea PHP views instead.
const checks = await exercisePublicationContracts({tableOnly:true});
assert.ok(checks.length >= 1 && checks.length <= 2);
console.log('web-table-smoking-icons-smoke-ok: '+checks.length+' canonical PHP publication contracts');
