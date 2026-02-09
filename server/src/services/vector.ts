
import { ChromaClient, Collection } from 'chromadb';
import { getEmbedding } from '../llm.js';

export class VectorService {
  private client: ChromaClient;
  private collection: Collection | null = null;
  private collectionName = 'codebase_knowledge';

  constructor() {
    const chromaUrl = process.env.CHROMA_URL || 'http://localhost:8000';
    this.client = new ChromaClient({ path: chromaUrl });
    this.init();
  }

  private async init() {
    try {
      this.collection = await this.client.getOrCreateCollection({
        name: this.collectionName,
      });
      console.log(`VectorService: Connected to collection '${this.collectionName}'`);
    } catch (err) {
      console.error('VectorService: Failed to connect to ChromaDB', err);
    }
  }

  async addDocument(id: string, text: string, metadata: Record<string, any> = {}) {
    if (!this.collection) await this.init();
    if (!this.collection) throw new Error('Vector store not initialized');

    try {
      const embedding = await getEmbedding(text);
      await this.collection.add({
        ids: [id],
        embeddings: [embedding],
        metadatas: [metadata],
        documents: [text],
      });
      return true;
    } catch (err) {
      console.error(`VectorService: Failed to add document ${id}`, err);
      throw err;
    }
  }

  async query(text: string, limit: number = 5) {
    if (!this.collection) await this.init();
    if (!this.collection) throw new Error('Vector store not initialized');

    try {
      const embedding = await getEmbedding(text);
      const results = await this.collection.query({
        queryEmbeddings: [embedding],
        nResults: limit,
      });

      // Format results
      const items = [];
      if (results.ids.length > 0) {
        for (let i = 0; i < results.ids[0].length; i++) {
          items.push({
            id: results.ids[0][i],
            text: results.documents[0][i],
            metadata: results.metadatas[0][i],
            score: results.distances ? results.distances[0][i] : null
          });
        }
      }
      return items;
    } catch (err) {
      console.error('VectorService: Query failed', err);
      throw err;
    }
  }

  async deleteDocument(id: string) {
    if (!this.collection) await this.init();
    if (!this.collection) return;
    
    await this.collection.delete({
      ids: [id]
    });
  }
}

export const vectorService = new VectorService();
