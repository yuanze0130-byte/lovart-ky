import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile('src/lib/music-pricing.ts', 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const { getMusicVersion, quoteMusicCredits, MUSIC_MODEL, MUSIC_VERSIONS } = await import(moduleUrl);

assert.equal(MUSIC_MODEL.id, 'suno_music');
assert.equal(MUSIC_MODEL.priceUnitsPerRequest, 0.5);
assert.equal(MUSIC_MODEL.defaultVersion, 'chirp-fenix');
assert.equal(MUSIC_VERSIONS.length, 4);
assert.equal(getMusicVersion('chirp-fenix').promptLimit, 5_000);
assert.equal(getMusicVersion('chirp-v3-5'), undefined);
assert.equal(quoteMusicCredits().credits, 8);
assert.equal(quoteMusicCredits().costUnits, 50_000);
assert.throws(() => quoteMusicCredits('unknown'));

console.log('Music pricing and model mapping tests passed.');
