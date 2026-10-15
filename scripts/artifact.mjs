// Turn the single-file Vite build into an artifact page body (the host adds the document skeleton).
import fs from 'node:fs';
const src = fs.readFileSync('dist/index.html', 'utf8');
let out = src
  .replace(/<!doctype html>/i, '')
  .replace(/<html[^>]*>/i, '')
  .replace(/<\/html>/i, '')
  .replace(/<head>/i, '')
  .replace(/<\/head>/i, '')
  .replace(/<body>/i, '')
  .replace(/<\/body>/i, '')
  .replace(/<meta charset="utf-8" \/>/i, '')
  .replace(/<meta name="viewport"[^>]*>/i, '');
// title + viewport-fit meta first so the host finds them in the first 8KB
const title = out.match(/<title>.*?<\/title>/)[0];
const vf = '<meta name="claude:viewport-fit-sides" content="cover">';
out = out.replace(title, '').replace(vf, '');
out = title + '\n' + vf + '\n' + out.trim() + '\n';
fs.mkdirSync('artifact', { recursive: true });
fs.writeFileSync('artifact/long-way-round.html', out);
console.log('artifact bytes', out.length);
