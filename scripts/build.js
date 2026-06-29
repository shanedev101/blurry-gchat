import { build } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');
const getPath = (p) => resolve(rootDir, p);

// content.ts and background.ts are built as self-contained IIFE bundles.
// IIFE is required for Chrome content scripts (no ESM support when injected
// into arbitrary pages) and works fine for MV3 service workers.
const IIFE_TARGETS = [
  { name: 'content', entry: 'src/content.ts', output: 'content.js' },
  { name: 'background', entry: 'src/background.ts', output: 'background.js' },
];

async function run() {
  // Step 1 - Build side panel HTML via vite.config.ts.
  // This also copies manifest.json, icons/, and styles.css via viteStaticCopy.
  console.log('Building side panel...');
  await build({ configFile: getPath('vite.config.ts') });

  // Step 2 - Build each content script as a self-contained IIFE bundle.
  for (const target of IIFE_TARGETS) {
    console.log(`Building ${target.name}...`);
    await build({
      configFile: false,
      build: {
        lib: {
          entry: getPath(target.entry),
          name: target.name,
          formats: ['iife'],
          fileName: () => target.output,
        },
        outDir: getPath('dist'),
        emptyOutDir: false,
        sourcemap: false,
        minify: true,
      },
      define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
      },
    });
  }

  // Step 3 - Force pure ASCII in all output JS files.
  // Avoids Chrome Web Store rejections caused by non-ASCII characters in JS.
  const jsFiles = ['popup.js', 'content.js', 'background.js'];
  for (const file of jsFiles) {
    const filePath = getPath(`dist/${file}`);
    if (fs.existsSync(filePath)) {
      console.log(`ASCII-escaping ${file}...`);
      escapeToAscii(filePath);
    }
  }

  console.log('Build complete.');
}

function escapeToAscii(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  let out = '';
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i);
    if (code > 127) {
      out += '\\u' + code.toString(16).padStart(4, '0');
    } else {
      out += content[i];
    }
  }
  fs.writeFileSync(filePath, out, 'utf8');
}

run().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
