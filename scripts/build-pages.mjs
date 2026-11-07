// Build the public dashboard at the GitHub Pages site root.
// Usage: node scripts/build-pages.mjs <empty output directory>
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '..');
const out = path.resolve(process.argv[2] || '_site');
fs.mkdirSync(out, { recursive: true });
if (fs.readdirSync(out).length) throw new Error(`Output directory must be empty: ${out}`);

const parts = [
  ['web', '.', /^(index\.html|app\.js|styles\.css|feed\.js)$/],
  ['web/lib', 'lib', /\.js$/],
  ['web/scene', 'scene', /\.(js|css)$/],
  ['web/ui', 'ui', /\.(js|css)$/],
  ['web/audio', 'audio', /\.(js|m4a)$/],
  ['web/share', 'share', /\.(js|css)$/],
  ['web/data', 'data', /^demo-(state|looks)\.json$/],
  ['assets/blobs', 'assets/blobs', /\.glb$/],
  ['assets/blobs/thumbs', 'assets/blobs/thumbs', /\.png$/],
  ['assets/blobs/lib', 'assets/blobs/lib', /\.(png|json)$/],
  ['assets/office', 'assets/office', /^(office\.glb|baked_chairman_floor\.jpg)$/],
  ['assets/office/night', 'assets/office/night', /\.jpg$/],
  ['assets/brand', 'assets/brand', /\.(png|svg)$/],
  ['assets/earth', 'assets/earth', /^(day|night)\.jpg$/],
  ['.', '.', /^PROMPT\.md$/],
];

for (const [from, to, keep] of parts) {
  const src = path.join(repo, from);
  const dst = path.join(out, to);
  const files = fs.readdirSync(src, { withFileTypes: true }).filter((entry) => entry.isFile() && keep.test(entry.name));
  if (!files.length) throw new Error(`Nothing to copy from ${from}/ (expected ${keep})`);
  fs.mkdirSync(dst, { recursive: true });
  for (const { name } of files) fs.copyFileSync(path.join(src, name), path.join(dst, name));
}

fs.mkdirSync(path.join(out, 'office'), { recursive: true });
fs.writeFileSync(path.join(out, 'office', 'index.html'), `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>OPC Office</title>
<script>location.replace('../' + location.search + location.hash);</script>
<a href="../">Open OPC Office</a>
</html>
`);
console.log(`Built OPC Office in ${out}`);
