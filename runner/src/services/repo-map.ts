
import { glob } from 'glob';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export class RepoMapper {
  constructor(private cwd: string) {}

  async generateMap(): Promise<string> {
    const files = await this.scanFiles();
    const mapLines: string[] = [];

    for (const file of files) {
      try {
        const content = await fs.readFile(path.join(this.cwd, file), 'utf8');
        const symbols = this.extractSymbols(content, path.extname(file));
        if (symbols.length > 0) {
          mapLines.push(`${file}:`);
          symbols.forEach(s => mapLines.push(`  ${s}`));
        } else {
          mapLines.push(file);
        }
      } catch (err) {
        // Ignore read errors
      }
    }

    return mapLines.join('\n');
  }

  private async scanFiles(): Promise<string[]> {
    return glob('**/*.{ts,js,py,go,java,rs}', {
      cwd: this.cwd,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
      nodir: true
    });
  }

  private extractSymbols(content: string, ext: string): string[] {
    const symbols: string[] = [];
    const lines = content.split('\n');

    if (['.ts', '.js', '.jsx', '.tsx'].includes(ext)) {
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('export class ') || trimmed.startsWith('class ')) {
          symbols.push(trimmed.replace('{', '').trim());
        } else if (trimmed.startsWith('export function ') || trimmed.startsWith('function ')) {
          symbols.push(trimmed.replace('{', '').trim());
        } else if (trimmed.startsWith('export interface ') || trimmed.startsWith('interface ')) {
          symbols.push(trimmed.replace('{', '').trim());
        } else if (trimmed.startsWith('export type ') || trimmed.startsWith('type ')) {
           symbols.push(trimmed.split('=')[0].trim());
        }
      }
    } else if (ext === '.py') {
      for (const line of lines) {
        if (line.startsWith('class ') || line.startsWith('def ')) {
          symbols.push(line.replace(':', '').trim());
        }
      }
    }

    return symbols.slice(0, 20); // Limit symbols per file to avoid bloat
  }
}
