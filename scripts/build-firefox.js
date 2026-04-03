#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist-firefox');

console.log('Building Firefox extension...');

// 1. Copy Firefox manifest
const manifestSrc = path.join(rootDir, 'firefox', 'manifest.json');
const manifestDest = path.join(distDir, 'manifest.json');
fs.copyFileSync(manifestSrc, manifestDest);
console.log('Copied Firefox manifest');

// 2. Copy icons
const iconsSrcDir = path.join(rootDir, 'public', 'icons');
const iconsDestDir = path.join(distDir, 'icons');
if (!fs.existsSync(iconsDestDir)) {
  fs.mkdirSync(iconsDestDir, { recursive: true });
}
fs.readdirSync(iconsSrcDir).forEach(file => {
  fs.copyFileSync(
    path.join(iconsSrcDir, file),
    path.join(iconsDestDir, file)
  );
});
console.log('Copied icons');

// 3. Fix index.html - add missing modulepreload and remove crossorigin
const indexFile = path.join(distDir, 'index.html');
if (fs.existsSync(indexFile)) {
  let html = fs.readFileSync(indexFile, 'utf-8');

  // Remove crossorigin attributes
  html = html.replace(/\s*crossorigin/g, '');

  // Find all JS files in assets
  const assetsDir = path.join(distDir, 'assets');
  const jsFiles = fs.readdirSync(assetsDir)
    .filter(f => f.endsWith('.js') && f !== 'main.js' && f !== 'background.js' && f !== 'content.js');

  // Add missing modulepreload links
  const existingPreloads = html.match(/modulepreload[^>]+>/g) || [];
  const existingFiles = existingPreloads.map(p => p.match(/href="\.\/assets\/([^"]+)"/)?.[1]).filter(Boolean);

  for (const jsFile of jsFiles) {
    if (!existingFiles.includes(jsFile)) {
      // Add modulepreload for this file
      const preload = `<link rel="modulepreload" href="./assets/${jsFile}">`;
      html = html.replace('</head>', `  ${preload}\n  </head>`);
      console.log(`Added modulepreload for ${jsFile}`);
    }
  }

  fs.writeFileSync(indexFile, html);
  console.log('Fixed index.html');
}

// 4. Process content script - inline dependencies
const assetsDir = path.join(distDir, 'assets');
if (fs.existsSync(assetsDir)) {
  const contentFile = path.join(assetsDir, 'content.js');
  if (fs.existsSync(contentFile)) {
    let content = fs.readFileSync(contentFile, 'utf-8');

    // Find and inline ES module imports
    const importRegex = /import\s*\{([^}]+)\}\s*from\s*["']\.\/([^"']+)["'];?/g;
    let match;
    const importedChunks = [];

    while ((match = importRegex.exec(content)) !== null) {
      const [, imports, chunkPath] = match;
      const chunkFile = path.join(assetsDir, chunkPath);
      if (fs.existsSync(chunkFile)) {
        const chunkContent = fs.readFileSync(chunkFile, 'utf-8');
        importedChunks.push({ imports, chunkPath, chunkContent, original: match[0] });
      }
    }

    // Inline the imports by creating a self-contained script
    if (importedChunks.length > 0) {
      let inlinedContent = '// Firefox content script with inlined dependencies\n';
      inlinedContent += '(function() {\n';

      for (const chunk of importedChunks) {
        let chunkCode = chunk.chunkContent;
        chunkCode = chunkCode.replace(/export\s*\{[^}]+\}\s*;?/g, '');
        inlinedContent += chunkCode + '\n';
      }

      let modifiedContent = content;
      for (const chunk of importedChunks) {
        modifiedContent = modifiedContent.replace(chunk.original, '');
      }

      // Replace r.Readability with se (the actual Readability class)
      modifiedContent = modifiedContent.replace(/r\.Readability/g, 'se');

      inlinedContent += '\n// Content script main code\n';
      inlinedContent += modifiedContent;
      inlinedContent += '\n})();\n';

      fs.writeFileSync(contentFile, inlinedContent);
      console.log('Inlined content script dependencies');
    }
  }

  // 5. Process background script
  const bgFile = path.join(assetsDir, 'background.js');
  if (fs.existsSync(bgFile)) {
    console.log('Background script ready (browser detection at runtime)');
  }
}

console.log('Firefox extension build complete!');
console.log(`Output: ${distDir}`);
