import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { indexedDB } from '../../.analysis/canvas-regression/node_modules/fake-indexeddb/build/esm/index.js';
const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/agent/conversation-store.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, indexedDB, structuredClone });
const { conversationStore: store } = exports;
const scope = { owner: 'alice', projectId: 'project-a' };
const user = id => ({ id: `${id}:user`, turnId: id, role: 'user', content: `question ${id}`, pending: true });
const reply = id => ({ id: `${id}:reply`, turnId: id, role: 'assistant', content: 'answer', response: { kind: 'chat', reply: 'answer', plan: { title: 'design' } } });
assert.equal((await store(scope)).entries.length, 0);
// Two tabs append independently: no stale snapshot can erase the other turn.
await Promise.all(['one', 'two'].map(id => store(scope, { kind: 'append', epoch: 0, entry: user(id) })));
assert.equal((await store(scope)).entries.length, 2);
await Promise.all([1, 2].map(() => store(scope, { kind: 'complete', epoch: 0, turnId: 'one', entry: reply('one') })));
let saved = await store(scope);
assert.equal(saved.entries.length, 3);
assert.equal(saved.entries.find(e => e.id === 'one:user').pending, false);
assert.equal(saved.entries.find(e => e.id === 'two:user').pending, true);
assert.equal((await store({ ...scope, owner: 'bob' })).entries.length, 0);
assert.equal((await store({ ...scope, projectId: 'project-b' })).entries.length, 0);
// Context compression never deletes history.
await store(scope, { kind: 'settings', epoch: 0, summary: 'earlier context', contextStart: 1, mode: 'research' });
saved = await store(scope);
assert.equal(saved.entries.length, 3); assert.equal(saved.summary, 'earlier context'); assert.equal(saved.mode, 'research');
const claims = await Promise.allSettled(['a', 'b'].map(claimId => store(scope, { kind: 'claim-plan', epoch: 0, entryId: 'one:reply', claimId })));
assert.equal(claims.filter(r => r.status === 'fulfilled').length, 1);
saved = await store(scope);
const claimId = saved.entries.find(e => e.id === 'one:reply').planClaimId;
assert.equal(saved.entries.find(e => e.id === 'one:reply').planApplied, undefined, 'claim is not a successful canvas insertion');
await store(scope, { kind: 'applied', epoch: 0, entryId: 'one:reply', claimId });
assert.equal((await store(scope)).entries.find(e => e.id === 'one:reply').planApplied, true);
await store(scope, { kind: 'clear', epoch: 0 });
await assert.rejects(store(scope, { kind: 'complete', epoch: 0, turnId: 'two', entry: reply('two') }), /清空/);
assert.equal((await store(scope)).entries.length, 0, 'late reply cannot resurrect a cleared conversation');
await store(scope, { kind: 'append', epoch: 1, entry: user('new') });
assert.equal((await store(scope)).entries.length, 1);
await assert.rejects(store(scope, { kind: 'settings', epoch: 1, contextStart: 999 }), /格式/);
assert.equal((await store(scope)).contextStart, 0, 'invalid write rolls back');
// Unknown schema remains intact, including when a caller tries to write.
const db = await new Promise((resolve, reject) => { const r = indexedDB.open('doodleverse-agent-conversations', 1); r.onsuccess = () => resolve(r.result); r.onerror = reject; });
const corrupt = { owner: 'alice', projectId: 'corrupt' };
await new Promise((resolve, reject) => { const tx = db.transaction('conversations', 'readwrite'); tx.objectStore('conversations').put({ schema: 999, important: 'preserve' }, JSON.stringify(['alice', 'corrupt'])); tx.oncomplete = resolve; tx.onabort = reject; });
await assert.rejects(store(corrupt), /格式/);
await assert.rejects(store(corrupt, { kind: 'clear', epoch: 0 }), /格式/);
const raw = await new Promise(resolve => { const r = db.transaction('conversations').objectStore('conversations').get(JSON.stringify(['alice', 'corrupt'])); r.onsuccess = () => resolve(r.result); });
assert.equal(raw.important, 'preserve'); db.close();
console.log('PASS conversation persistence, account/project isolation, concurrent appends, response dedup, compression, atomic plan claim, clear/late-result protection and corrupt-record preservation. No network.');
