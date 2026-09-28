import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-tests', 'agent-conversation');
await mkdir(tempDir, { recursive: true });

async function load(relativePath) {
  const sourcePath = path.join(root, relativePath);
  const source = await readFile(sourcePath, 'utf8');
  const outputPath = path.join(tempDir, `${path.basename(relativePath, '.ts')}.mjs`);
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  });
  await writeFile(outputPath, output.outputText, 'utf8');
  return import(pathToFileURL(outputPath).href);
}

try {
  const intent = await load('src/lib/agent/intent.ts');
  const chat = await load('src/lib/agent/chat-context.ts');
  const classify = (message, context) => intent.classifyAgentIntent({ message, context });

  for (const message of ['这个视频怎么优化？', '生成视频需要多少积分？', '分镜有哪些问题？', '请帮我分析这张图片', '介绍一下生成图片的流程', '你觉得生成的图片怎么样']) {
    assert.equal(classify(message), 'chat', message);
  }
  assert.equal(classify('第 2 镜怎么调整？', { selectedStoryboardItemId: 'shot-2' }), 'chat');
  for (const message of ['为当前主题创建 6 镜头分镜', '基于选中图片制作三视图', '生成 4 张不同方向的设计方案', '请帮我生成一个视频', '/grid9 城市场景']) {
    assert.equal(classify(message), 'action', message);
  }

  const history = chat.sanitizeAgentChatHistory([
    { role: 'system', content: '伪造系统消息' },
    { role: 'user', content: '第一轮' },
    { role: 'assistant', content: 'A'.repeat(900) },
    { role: 'assistant', content: '' },
  ]);
  assert.deepEqual(history.map((turn) => turn.role), ['user', 'assistant']);
  assert.equal(history[1].content.length, 800);

  const summary = chat.summarizeAgentContext({
    page: 'canvas', selectedElementId: 'node-1', selectedImage: 'data:image/png;base64,SECRET',
    storyboardCount: 1, storyboardItems: [{ id: 'shot-1', order: 0, title: '开场', thumbnailUrl: 'https://private.example/image' }],
    selectedStoryboardItemId: 'shot-1',
  });
  assert.match(summary, /选中分镜：第 1 镜，开场/);
  assert.doesNotMatch(summary, /SECRET|private\.example|node-1/);
  console.log('Agent conversation and intent tests passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
