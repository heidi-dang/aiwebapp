
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

interface MemoryEntry {
  content: string;
  tags: string[];
  timestamp: string;
}

export class MemoryService {
  private memoryPath: string;

  constructor(baseDir: string) {
    this.memoryPath = path.join(baseDir, '.ai', 'memory.json');
  }

  private async load(): Promise<MemoryEntry[]> {
    try {
      const content = await fs.readFile(this.memoryPath, 'utf8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  async store(content: string, tags: string[] = []): Promise<void> {
    const memories = await this.load();
    memories.push({ content, tags, timestamp: new Date().toISOString() });
    await fs.mkdir(path.dirname(this.memoryPath), { recursive: true });
    await fs.writeFile(this.memoryPath, JSON.stringify(memories, null, 2));
  }

  async search(query: string): Promise<string[]> {
    const memories = await this.load();
    const terms = query.toLowerCase().split(/\s+/);
    // Simple keyword matching: rank by number of matching terms
    return memories
      .map(m => {
        const score = terms.reduce((acc, term) => 
          acc + (m.content.toLowerCase().includes(term) || m.tags.some(tag => tag.includes(term)) ? 1 : 0), 0);
        return { ...m, score };
      })
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(m => m.content)
      .slice(0, 5);
  }
}
