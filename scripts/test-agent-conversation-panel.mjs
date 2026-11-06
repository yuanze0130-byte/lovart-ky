import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import { indexedDB } from '../../.analysis/canvas-regression/node_modules/fake-indexeddb/build/esm/index.js';
const require = createRequire(new URL('../../.analysis/canvas-regression/package.json', import.meta.url));
const React = require('react');
const { create, act } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const cache = new Map();
const windowMock = new EventTarget();
windowMock.confirm = () => true;
let failCompletion = false;
let failAppend = false;
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, indexedDB, structuredClone, crypto: webcrypto, window: windowMock, Error,
    require: id => {
      if (id === 'react' || id === 'react/jsx-runtime') return require(id);
      if (id === 'lucide-react') return new Proxy({}, { get: () => () => null });
      if (id === './AgentWorkflowPanel') return { AgentWorkflowPanel: () => null };
      if (id === '@/lib/ai-tool-pricing') return { AI_TOOL_CREDIT_COSTS: { agentChat: 1 } };
      if (id === '@/hooks/useAgentConversation') return load('src/hooks/useAgentConversation.ts');
      if (id === '@/lib/agent/context-controls') return load('src/lib/agent/context-controls.ts');
      if (id === '@/lib/agent/conversation-store') {
        const real = load('src/lib/agent/conversation-store.ts');
        return { ...real, conversationStore: async (scope, mutation) => {
          if (failAppend && mutation?.kind === 'append') { failAppend = false; throw new Error('simulated initial save failure'); }
          if (failCompletion && mutation?.kind === 'complete') { failCompletion = false; throw new Error('simulated storage failure'); }
          return real.conversationStore(scope, mutation);
        } };
      }
      throw Error(`Unexpected dependency: ${id}`);
    },
  }, { filename: file });
  return exports;
}
const { AgentPanel } = load('src/components/lovart/AgentPanel.tsx');
const { conversationStore } = load('src/lib/agent/conversation-store.ts');
let renderer, calls = 0, resolveReply, insertions = 0;
const scope = { owner: 'panel-user', projectId: 'a' };
const props = projectId => ({ key: projectId, owner: scope.owner, context: { page: 'canvas', projectId }, visible: true,
  isRunning: false, onClose() {}, onCancel() {}, onApplyPlan() { insertions++; },
  onSubmit: async () => { calls++; return new Promise(resolve => { resolveReply = resolve; }); },
});
const wait = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };
const text = () => JSON.stringify(renderer.toJSON());
const sendButton = () => renderer.root.findAllByType('button').find(button => button.children.includes('发送'));
const input = () => renderer.root.findAllByType('textarea').find(t => t.props.placeholder?.includes('描述任务'));
async function mount(projectId = 'a') { await act(async () => { renderer = create(React.createElement(AgentPanel, props(projectId))); }); await act(wait); }
async function begin(message) {
  await act(async () => input().props.onChange({ target: { value: message } }));
  await act(async () => { sendButton().props.onClick(); sendButton().props.onClick(); await wait(); });
}
await mount();
await begin('saved question');
assert.equal(calls, 1, 'rapid repeated clicks submit once');
assert.equal((await conversationStore(scope)).entries[0].pending, true, 'persist before API completion');
await act(async () => { resolveReply({ kind: 'chat', reply: 'saved answer', plan: { title: 'idea' } }); await wait(); });
assert.match(text(), /saved answer/);
await act(async () => renderer.unmount());
await mount();
assert.match(text(), /saved question/); assert.match(text(), /saved answer/); assert.equal(calls, 1, 'mount never replays AI');
await act(async () => { renderer.root.findAllByType('button').find(b => b.children.includes('将方案放到画布')).props.onClick(); await wait(); });
assert.equal(insertions, 1);
await act(async () => renderer.unmount()); await mount();
assert.match(text(), /已放到画布/); assert.equal(insertions, 1, 'restore never applies plans');

await begin('late question');
await act(async () => { renderer.update(React.createElement(AgentPanel, props('b'))); await wait(); });
await act(async () => { resolveReply({ kind: 'chat', reply: 'late answer belongs to A' }); await wait(); });
assert.doesNotMatch(text(), /late question|saved answer|late answer/);
assert.equal((await conversationStore(scope)).entries.at(-1).content, 'late answer belongs to A');
assert.equal((await conversationStore({ ...scope, projectId: 'b' })).entries.length, 0);

failCompletion = true;
await begin('save failure question');
await act(async () => { resolveReply({ kind: 'chat', reply: 'keep unsaved answer visible' }); await wait(); });
assert.match(text(), /simulated storage failure/); assert.match(text(), /keep unsaved answer visible/);
assert.equal(sendButton().props.disabled, true);
const callsBeforeRetry = calls;
await act(async () => { renderer.root.findAllByType('button').find(b => b.children.includes('重试保存/读取')).props.onClick(); await wait(); });
assert.equal(calls, callsBeforeRetry, 'save retry never repeats paid request');
assert.equal((await conversationStore({ ...scope, projectId: 'b' })).entries.at(-1).content, 'keep unsaved answer visible');
await act(async () => { renderer.root.findAllByType('button').find(b => b.props.title === '清空对话').props.onClick(); await wait(); });
await act(async () => renderer.unmount()); await mount('b');
assert.doesNotMatch(text(), /save failure question|keep unsaved answer/);
assert.equal((await conversationStore(scope)).entries.length, 4, 'clear affects only the current project');
await act(async () => renderer.unmount());
await conversationStore({ ...scope, projectId: 'interrupted' }, { kind: 'append', epoch: 0, entry: { id: 'interrupted:user', turnId: 'interrupted', role: 'user', content: 'interrupted request', pending: true } });
const beforeRestore = calls;
await mount('interrupted');
assert.match(text(), /此消息尚未记录回复/); assert.equal(calls, beforeRestore);
await act(async () => renderer.unmount());
await mount('save-before-submit');
failAppend = true;
await begin('never submitted');
assert.equal(calls, beforeRestore, 'failed initial persistence prevents paid submission');
await act(async () => { renderer.root.findAllByType('button').find(b => b.children.includes('重试保存/读取')).props.onClick(); await wait(); });
assert.equal(calls, beforeRestore, 'retrying initial save also never sends');
await act(async () => renderer.unmount());
console.log('PASS actual AgentPanel: remount restores history, click dedup, plan no replay, project switch isolates late response, failed save preserves reply, retry only saves, clear persists. AI fully mocked.');
