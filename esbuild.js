const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');
const root = __dirname;
const outDir = path.join(root, 'out');

async function ensureStaticAssets() {
  fs.mkdirSync(path.join(outDir, 'webview'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'billing'), { recursive: true });
  const stylesIn = path.join(root, 'src', 'webview', 'styles.css');
  const stylesOut = path.join(outDir, 'webview', 'styles.css');
  fs.copyFileSync(
    path.join(root, 'src', 'billing', 'pricing.json'),
    path.join(outDir, 'billing', 'pricing.json')
  );

  if (!production) {
    fs.copyFileSync(stylesIn, stylesOut);
    return;
  }

  const source = fs.readFileSync(stylesIn, 'utf8');
  const result = await esbuild.transform(source, {
    loader: 'css',
    minify: true,
    legalComments: 'none'
  });
  fs.writeFileSync(stylesOut, result.code);
}

async function build() {
  await ensureStaticAssets();

  const common = {
    bundle: true,
    sourcemap: !production,
    minify: production,
    external: ['vscode'],
    logLevel: 'info'
  };

  const extensionBuild = esbuild.build({
    ...common,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    entryPoints: ['src/extension.ts'],
    outfile: 'out/extension.js'
  });

  const webviewBuild = esbuild.build({
    ...common,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    entryPoints: ['src/webview/main.ts'],
    outfile: 'out/webview/main.js'
  });

  if (watch) {
    await Promise.all([extensionBuild, webviewBuild]);
    console.log('Watching is not implemented in this lightweight build script yet.');
    return;
  }

  await Promise.all([extensionBuild, webviewBuild]);
}

build().catch(error => {
  console.error(error);
  process.exitCode = 1;
});