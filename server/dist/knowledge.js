import { z } from "zod";
const ingestSchema = z.object({
    source: z.string().optional(),
    content: z.string()
});
export default async function knowledgeRoutes(fastify) {
    fastify.post("/knowledge", async (request, reply) => {
        const parsed = ingestSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: 'Invalid knowledge payload', details: parsed.error.errors });
        }
        const { source, content } = parsed.data;
        // Logic to ingest knowledge into the database
        reply.send({ success: true });
    });
    fastify.get("/knowledge", async (request, reply) => {
        // Logic to list knowledge sources
        reply.send({ knowledge: [] });
    });
}
