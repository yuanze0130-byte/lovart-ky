import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile('src/lib/speech-pricing.ts', 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const { countSpeechCharacters, getSpeechModel, quoteSpeechCredits, SPEECH_MODELS } = await import(moduleUrl);

assert.equal(SPEECH_MODELS.length, 6);
assert.equal(getSpeechModel('minimax/speech-02-turbo').upstreamModel, 'speech-02-turbo');
assert.equal(getSpeechModel('speech-2.8-hd'), undefined);
assert.equal(countSpeechCharacters('你好🙂'), 3);
assert.equal(quoteSpeechCredits('minimax/speech-02-turbo', 1).credits, 1);
assert.equal(quoteSpeechCredits('minimax/speech-02-turbo', 5_000).credits, 16);
assert.equal(quoteSpeechCredits('minimax/speech-02-turbo', 10_000).credits, 32);
assert.equal(quoteSpeechCredits('minimax/speech-02-hd', 10_000).credits, 56);
assert.throws(() => quoteSpeechCredits('speech-2.8-hd', 100));
assert.throws(() => quoteSpeechCredits('minimax/speech-02-hd', 10_001));

console.log('Speech pricing and model mapping tests passed.');
