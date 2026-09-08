import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const url = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
async function compile(file, imports = {}) {
  let code = ts.transpileModule(await readFile(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const [name, target] of Object.entries(imports)) code = code.replaceAll(`'${name}'`, `'${target}'`);
  return url(code);
}
const guards = await compile('src/lib/ai-tool-request-guards.ts');
const ai = await compile('src/lib/canvas-ai.ts', { './ai-tool-request-guards': guards });
const pricing = await compile('src/lib/ai-tool-pricing.ts');
const catalog = await compile('src/lib/canvas-ai-models.server.ts', { './ai-tool-pricing': pricing });
const tables = await compile('src/lib/table-editor.ts');
const { parseCanvasAiRequest, parseAiTableResult } = await import(ai);
const { getCanvasAiModels } = await import(catalog);
const body = { mode: 'text', model: 'test-model', expectedCredits: 2, instruction: '改写', source: '', images: [] };
assert.equal(parseCanvasAiRequest(body).instruction, '改写');
for (const invalid of [null, [], {}, { ...body, mode: 'unknown' }, { ...body, instruction: '' }, { ...body, source: 'a'.repeat(24001) }, { ...body, systemPrompt: 42 }, { ...body, images: [{}] }, { ...body, images: Array(7).fill({}) }, { ...body, images: [{ dataUrl: 'http://127.0.0.1/secret', label: 'x' }] }, { ...body, mode: 'table' }]) {
  assert.throws(() => parseCanvasAiRequest(invalid));
}
const table = { columns: ['镜号', '画面'], rows: [['1', '远景']] };
assert.deepEqual(parseAiTableResult('```json\n' + JSON.stringify(table) + '\n```'), table);
for (const invalid of ['{}', 'null', '{"columns":["A"],"rows":[]}', '{"columns":["A"],"rows":[[1]]}', '{"columns":["A"],"rows":[["1","2"]]}']) assert.throws(() => parseAiTableResult(invalid));

const envKeys = ['CANVAS_AI_MODELS_JSON', 'XAI_API_KEY', 'CANVAS_TEXT_MODEL', 'XAI_MODEL', 'CANVAS_TEXT_VISION'];
const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
globalThis.__canvasAiTest = { calls: 0, charges: 0, refunds: 0, output: '模型输出' };
const state = globalThis.__canvasAiTest;
const fakeAuth = url(`export async function requireUser(request) { if (request.headers.get('authorization') !== 'Bearer test') throw new Error('AUTH'); return {id:'canvas-ai-test'}; } export const isNotAuthenticatedError = e => e.message === 'AUTH';`);
const fakeMeter = url(`export const isAiSafetyError = e => e.code === 'INSUFFICIENT_CREDITS'; export async function runMeteredAiOperation(p) { const s=globalThis.__canvasAiTest; if(s.noCredits) {const e=new Error('积分不足');e.code='INSUFFICIENT_CREDITS';e.status=402;throw e;} s.charges++;try {return {result:await p.run(),billing:{chargedCredits:p.creditCost}};}catch(e){s.refunds++;throw e;}}`);
const fakeOpenAi = url(`export default class OpenAI {constructor(options){globalThis.__canvasAiTest.options=options;this.chat={completions:{create:async(request)=>{const s=globalThis.__canvasAiTest;s.calls++;s.request=request;if(s.error)throw new Error('secret upstream URL');return {choices:[{finish_reason:s.finish||'stop',message:{content:s.output}}]};}}};}}`);
const fakeNext = url('export const NextResponse = Response;');
const routeUrl = await compile('src/app/api/canvas-ai/route.ts', {
  'next/server': fakeNext, 'openai': fakeOpenAi,
  '@/lib/require-user': fakeAuth, '@/lib/ai-tool-request-guards': guards,
  '@/lib/ai-safety': fakeMeter, '@/lib/canvas-ai': ai,
  '@/lib/canvas-ai-models.server': catalog, '@/lib/table-editor': tables,
});
const { GET, POST } = await import(routeUrl);
const request = (data = body, auth = true) => new Request('http://localhost/api/canvas-ai', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer test' } : {}) }, body: JSON.stringify(data) });
const resetRate = () => globalThis[Symbol.for('doodleverse.aiToolRateLimitBuckets')]?.clear();
try {
  process.env.XAI_API_KEY = 'test-not-a-real-key';
  process.env.CANVAS_AI_MODELS_JSON = JSON.stringify([{ id: 'test-model', label: 'Test', vision: false, credits: 2, estimatedCostMicros: 8000 }]);
  assert.equal(getCanvasAiModels()[0].credits, 2);
  assert.equal((await GET(new Request('http://localhost'))).status, 401);
  const publicCatalog = await (await GET(new Request('http://localhost', { headers: { Authorization: 'Bearer test' } }))).json();
  assert.equal(publicCatalog.models[0].estimatedCostMicros, undefined);
  assert.equal((await POST(request(body, false))).status, 401);
  assert.equal(state.charges, 0);
  assert.equal((await POST(request({ ...body, model: 'expensive-unauthorized-model' }))).status, 400);
  assert.equal((await POST(request({ ...body, images: [{ dataUrl: 'data:image/png;base64,YQ==', label: 'ref' }] }))).status, 400);
  assert.equal(state.charges, 0);
  state.noCredits = true;
  assert.equal((await POST(request({ ...body, expectedCredits: 1 }))).status, 409);
  assert.equal((await POST(request())).status, 402);
  assert.equal(state.calls, 0);
  state.noCredits = false;
  const successful = await POST(request());
  assert.equal(successful.status, 200);
  assert.equal((await successful.json()).text, '模型输出');
  assert.equal(state.options.maxRetries, 0);
  assert.equal(state.request.model, 'test-model');
  assert.equal(state.request.max_tokens, 4096);
  resetRate();
  state.output = JSON.stringify(table);
  const tableResponse = await POST(request({ ...body, mode: 'table', source: '镜头1是远景' }));
  assert.deepEqual((await tableResponse.json()).table, table);
  state.output = '{}';
  assert.equal((await POST(request({ ...body, mode: 'table', source: '镜头1' }))).status, 502);
  assert.equal(state.refunds, 1);
  state.output = '审核完成';
  await POST(request({ ...body, mode: 'agent', systemPrompt: '你是审核员' }));
  assert.equal(state.request.messages[0].content, '你是审核员');
  state.finish = 'length';
  assert.equal((await POST(request())).status, 502);
  state.finish = 'stop'; state.error = true;
  const failed = await POST(request());
  assert.equal(failed.status, 502);
  assert(!JSON.stringify(await failed.json()).includes('secret'));
  assert.equal(state.refunds, 3);
  state.error = false;
  resetRate();
  for (let index = 0; index < 8; index++) await POST(request({ ...body, model: 'not-allowed' }));
  assert.equal((await POST(request())).status, 429);
  const oversized = new Request('http://localhost', { method: 'POST', headers: { 'Content-Length': String(11 * 1024 * 1024) } });
  assert.equal((await POST(oversized)).status, 413);
  process.env.CANVAS_AI_MODELS_JSON = '[{"id":"free"}]';
  assert.throws(getCanvasAiModels);
  console.log('Canvas AI: input validation, model allowlist, authentication, billing boundary, table schema, agent role, failure redaction, limits passed (mock upstream, no real charges).');
} finally {
  for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  delete globalThis.__canvasAiTest;
  resetRate();
}
