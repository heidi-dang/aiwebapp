#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('while(true)') || line.includes('while (true)')) {
      console.error(`Infinite loop detected in ${filePath}:${i + 1}: ${line.trim()}`);
      process.exit(1);
    }
    if (line.includes('for(;;)') || line.includes('for (;;)')) {
      console.error(`Infinite loop detected in ${filePath}:${i + 1}: ${line.trim()}`);
      process.exit(1);
    }
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
      walkDir(filePath);
    } else if (file.endsWith('.js') || file.endsWith('.ts')) {
      checkFile(filePath);
    }
  }
}

walkDir(process.cwd());
console.log('No infinite loops detected.');