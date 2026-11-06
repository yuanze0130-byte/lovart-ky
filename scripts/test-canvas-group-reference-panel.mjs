import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(new URL('../../.analysis/canvas-regression/package.json', import.meta.url));
const React = require('react');
const { create, act } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
function load(file, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require: id => {
    if (id in dependencies) return dependencies[id];
    if (id === 'react' || id === 'react/jsx-runtime') return require(id);
    if (id === 'lucide-react') return new Proxy({}, { get: () => () => null });
    throw Error(`Unexpected dependency: ${id}`);
  } });
  return exports;
}
const helpers = load('src/lib/canvas-asset-references.ts');
const { CanvasAssetReferencePicker } = load('src/components/lovart/CanvasAssetReferencePicker.tsx', {
  '@/lib/canvas-asset-references': helpers, './CanvasMedia': { CanvasImageMedia: () => null },
});
const assets = [
  { id: 'target', kind: 'image', label: 'self', content: '/self', groupId: 'g' },
  { id: 'photo', kind: 'image', label: '照片', content: '/photo', groupId: 'g' },
  { id: 'text', kind: 'text', label: '文案', content: 'prompt', groupId: 'g' },
  { id: 'video', kind: 'video', label: '视频', content: '/video', groupId: 'g' },
  { id: 'old', kind: 'image', label: '已有引用', content: '/old' },
];
let selected;
function Harness() {
  const [ids, setIds] = React.useState(['old', 'photo']); selected = ids;
  return React.createElement(CanvasAssetReferencePicker, { assets, excludedId: 'target', acceptedKinds: ['image', 'text'], selectedIds: ids, open: true, onOpenChange() {}, onChange: setIds });
}
const text = item => typeof item === 'string' ? item : item.children.map(text).join('');
let renderer;
await act(async () => { renderer = create(React.createElement(Harness)); });
const groupButton = () => renderer.root.findAllByType('button').find(b => text(b).includes('分组 · 照片'));
assert.match(text(groupButton()), /引用整组 · 2 项/);
await act(async () => groupButton().props.onClick());
assert.deepEqual([...selected], ['old', 'photo', 'text']);
assert.equal(groupButton().props.disabled, true);
await act(async () => renderer.root.findAllByType('button').find(b => b.props['aria-label'] === '移除 @照片').props.onClick());
assert.deepEqual([...selected], ['old', 'text'], 'removing one reference does not disconnect the whole group');
assert.equal(groupButton().props.disabled, false);
await act(async () => groupButton().props.onClick());
assert.deepEqual([...selected], ['old', 'text', 'photo']);
await act(async () => renderer.unmount());
console.log('PASS actual group picker: add eligible group, preserve existing references, exclude target/video, deduplicate, remove individual member, re-add only missing members.');
