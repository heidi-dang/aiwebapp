import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";

const memorySchema = z.object({
  sessionId: z.string(),
  agentId: z.string(),
  memory: z.any(),
});

export default async function memoryRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/memory",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsedBody = memorySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          error: "Invalid memory data",
          details: parsedBody.error.errors,
        });
      }

      const { sessionId, agentId, memory } = parsedBody.data;
      // Logic to store memory in the database
      reply.send({ success: true });
    }
  );

  fastify.get(
    "/memory/:sessionId",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sessionId } = request.params as { sessionId: string };
      // Logic to retrieve memory from the database
      reply.send({ memory: [] });
    }
  );

  fastify.put(
    "/memory/:sessionId",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sessionId } = request.params as { sessionId: string };
      const { memory } = request.body as { memory: any };
      // Logic to update memory in the database
      reply.send({ success: true, sessionId, updatedMemory: memory });
    }
  );

  fastify.delete(
    "/memory/:sessionId",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sessionId } = request.params as { sessionId: string };
      // Logic to delete memory from the database
      reply.send({ success: true, sessionId });
    }
  );
}