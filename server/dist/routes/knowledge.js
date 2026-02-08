import { getEmbedding } from '../llm.js';
import { z } from 'zod';
const addDocSchema = z.object({
    title: z.string(),
    content: z.string(),
});
const searchSchema = z.object({
    query: z.string(),
    limit: z.number().optional().default(5)
});
export function registerKnowledgeRoutes(app, store) {
    // Add document
    app.post('/knowledge/documents', async (req, res) => {
        const result = addDocSchema.safeParse(req.body);
        if (!result.success) {
            res.status(400).json({ error: 'Invalid input', details: result.error.errors });
            return;
        }
        const { title, content } = result.data;
        try {
            // 1. Save document
            const docId = await store.addKnowledgeDocument(title, content);
            // 2. Chunk content (simple splitting by newline or length for MVP)
            const chunks = content.split('\n\n').filter(c => c.trim().length > 0);
            // 3. Embed and save chunks
            for (const chunk of chunks) {
                if (chunk.trim().length < 10)
                    continue; // Skip very short chunks
                const embedding = await getEmbedding(chunk);
                await store.addKnowledgeChunk(docId, chunk, embedding);
            }
            res.json({ id: docId, message: 'Document added and indexed' });
        }
        catch (err) {
            console.error('Failed to add document:', err);
            res.status(500).json({ error: 'Internal server error', details: err.message });
        }
    });
    // Search
    app.post('/knowledge/search', async (req, res) => {
        const result = searchSchema.safeParse(req.body);
        if (!result.success) {
            res.status(400).json({ error: 'Invalid input', details: result.error.errors });
            return;
        }
        const { query, limit } = result.data;
        try {
            const embedding = await getEmbedding(query);
            const results = await store.searchKnowledge(embedding, limit);
            res.json({ results });
        }
        catch (err) {
            console.error('Search failed:', err);
            res.status(500).json({ error: 'Internal server error', details: err.message });
        }
    });
}
