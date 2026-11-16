// Builds ../index.html for this scene: concatenates the upstream math.js (unchanged, from source/src),
// the small engine in src/engine.js and the scene in src/scene.js into one self-contained page. No dependencies.
//   node build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => readFileSync(path.join(here, ...p), 'utf8');
const js = [read('..', '..', '..', 'source', 'src', 'math.js'), read('src', 'engine.js'), read('src', 'scene.js'), 'await runScene(SCENE);'].join('\n');
const wrap = `(async()=>{${js}\n})().catch(e=>{console.error(e);document.body.className='l e';document.getElementById('s').textContent=(e.cause?'':'Failed to start: ')+e.message});`;
const html = read('template.html').replace('/*SCRIPT*/', () => wrap);
writeFileSync(path.join(here, '..', 'index.html'), html);
console.log(`index.html: ${(html.length / 1024).toFixed(1)} kB`);
