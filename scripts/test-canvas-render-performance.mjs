import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const source = await readFile(
  path.join(root, 'src', 'components', 'lovart', 'CanvasArea.tsx'),
  'utf8',
);

assert.match(source, /const selectedIdSet = useMemo\(\(\) => new Set\(selectedIds\)/);
assert.match(source, /const selectedGroupIds = useMemo/);
assert.match(source, /const linkedToSelectionIds = useMemo/);
assert.match(source, /const queueConnectionPoint = \(point:/);
assert.match(source, /if \(connectionDraft\) \{\s+queueConnectionPoint\(point\);/);
assert.doesNotMatch(source, /if \(connectionDraft\) \{\s+setConnectionDraft/);

const highlightStart = source.indexOf('{!selectedIdSet.has(el.id) && !isDrawing');
const highlightEnd = source.indexOf('{selectedIdSet.has(el.id) && !isDrawing', highlightStart);
assert.notEqual(highlightStart, -1);
assert.notEqual(highlightEnd, -1);
const highlightBlock = source.slice(highlightStart, highlightEnd);
assert.match(highlightBlock, /linkedToSelectionIds\.has\(el\.id\)/);
assert.match(highlightBlock, /selectedGroupIds\.has\(el\.groupId\)/);
assert.doesNotMatch(highlightBlock, /elements\.find|selectedIds\.some/);

console.log('Canvas render performance tests passed.');
