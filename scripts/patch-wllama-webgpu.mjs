import { readFile, writeFile } from 'node:fs/promises';

const [wasmGluePath] = process.argv.slice(2);
if (!wasmGluePath) {
  throw new Error('Usage: node patch-wllama-webgpu.mjs <wllama.js>');
}

const featureName = 'chromium-experimental-subgroup-matrix';
const featureValue = 0x00050037;
let source = await readFile(wasmGluePath, 'utf8');

if (!source.includes(`${featureValue}:"${featureName}"`)) {
  const anchor = '327729:"chromium-experimental-multi-draw-indirect"';
  if (!source.includes(anchor)) {
    throw new Error('Could not find the Emdawn feature table in wllama.js');
  }
  source = source.replace(anchor, `${anchor},${featureValue}:"${featureName}"`);
  await writeFile(wasmGluePath, source);
}
