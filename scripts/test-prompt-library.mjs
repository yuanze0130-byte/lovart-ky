import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-tests', 'prompt-library');
const sourcePath = path.join(root, 'src', 'lib', 'prompt-library.ts');
const outputPath = path.join(tempDir, 'prompt-library.mjs');
await mkdir(tempDir, { recursive: true });

const source = await readFile(sourcePath, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath,
});
await writeFile(outputPath, transpiled.outputText, 'utf8');

try {
  const library = await import(`${pathToFileURL(outputPath).href}?v=${Date.now()}`);
  const expectedLabels = [
    '九宫格分镜脚本', '高清放大', 'GPT噪点消除', '糊图变高清', '产品转线稿',
    '风格复刻', '产品融图', '杂物消失', '精修产品', '情绪版', '分镜版', '角色板',
    '电影级角色身份板', '电影级场景身份板', '画板提示词',
  ];

  assert.equal(library.PROMPT_LIBRARY_ITEMS.length, expectedLabels.length);
  assert.deepEqual(library.PROMPT_LIBRARY_ITEMS.map((item) => item.label), expectedLabels);
  assert.equal(new Set(library.PROMPT_LIBRARY_ITEMS.map((item) => item.id)).size, expectedLabels.length);
  assert.equal(library.PROMPT_LIBRARY_ITEMS.every((item) => item.prompt.length >= 40), true);
  assert.equal(library.PROMPT_LIBRARY_ITEMS.every((item) => library.PROMPT_LIBRARY_CATEGORIES.includes(item.category)), true);
  assert.equal(library.getPromptLibraryItem('storyboard-default')?.label, '分镜版');
  assert.equal(library.getPromptLibraryItem('missing'), undefined);
  console.log('Prompt library tests passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
