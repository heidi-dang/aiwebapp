
import { Store } from '../storage.js';
import { z } from 'zod';
import { vectorService } from '../services/vector.js';

const addDocSchema = z.object({
  title: z.string(),
  content: z.string(),
  metadata: z.record(z.any()).optional()
});

const searchSchema = z.object({
  query: z.string(),
  limit: z.number().optional().default(5)
});

export function registerKnowledgeRoutes(app: any, store: Store) {
  // Add document
  app.post('/knowledge/documents', async (req: any, res: any) => {
    const result = addDocSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Invalid input', details: result.error.errors });
      return;
    }

    const { title, content, metadata } = result.data;

    try {
      // 1. Save document metadata to SQLite
      const docId = await store.addKnowledgeDocument(title, content);

      // 2. Chunk content (simple splitting by newline or length for MVP)
      const chunks = content.split('\n\n').filter((c: string) => c.trim().length > 0);

      // 3. Embed and save chunks to ChromaDB
      let chunkIndex = 0;
      for (const chunk of chunks) {
        if (chunk.trim().length < 10) continue; // Skip very short chunks
        
        const chunkId = `${docId}_${chunkIndex++}`;
        await vectorService.addDocument(chunkId, chunk, {
          docId,
          title,
          index: chunkIndex,
          ...metadata
        });
      }

      res.json({ id: docId, message: 'Document added and indexed' });
    } catch (err: any) {
      console.error('Failed to add document:', err);
      res.status(500).json({ error: 'Internal server error', details: err.message });
    }
  });

  // Search
  app.post('/knowledge/search', async (req: any, res: any) => {
    const result = searchSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Invalid input', details: result.error.errors });
      return;
    }

    const { query, limit } = result.data;

    try {
      const results = await vectorService.query(query, limit);
      res.json({ results });
    } catch (err: any) {
      console.error('Search failed:', err);
      res.status(500).json({ error: 'Internal server error', details: err.message });
    }
  });
}
