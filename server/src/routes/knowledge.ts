import { FastifyInstance } from 'fastify';
import { z } from 'zod';

const knowledgeSchema = z.object({
  title: z.string(),
  content: z.string(),
});

async function knowledgeRoutes(fastify: FastifyInstance) {
  // List knowledge items
  fastify.get('/knowledge', async (request, reply) => {
    // Simulate listing knowledge from the database
    reply.send([]);
  });

  // Route to add knowledge
  fastify.post('/knowledge', async (request, reply) => {
    const parsedBody = knowledgeSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: 'Invalid knowledge data', details: parsedBody.error.errors });
    }

    const { title, content } = parsedBody.data;

    // Simulate saving knowledge to the database
    const knowledgeId = Math.random().toString(36).substring(2, 15); // Mock ID generation
    reply.send({ id: knowledgeId, title, content });
  });

  // Route to retrieve knowledge
  fastify.get('/knowledge/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    // Simulate retrieving knowledge from the database
    const knowledge = { id, title: 'Sample Title', content: 'Sample Content' };
    reply.send(knowledge);
  });

  // Route to update knowledge
  fastify.put('/knowledge/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsedBody = knowledgeSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: 'Invalid knowledge data', details: parsedBody.error.errors });
    }

    const { title, content } = parsedBody.data;

    // Simulate updating knowledge in the database
    reply.send({ id, title, content, updated: true });
  });

  // Route to delete knowledge
  fastify.delete('/knowledge/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    // Simulate deleting knowledge from the database
    reply.send({ id, deleted: true });
  });
}

export default knowledgeRoutes;
