import { requireOptionalBearerAuth } from '../auth.js';
import { z } from 'zod';
import { access } from 'fs/promises';
import { constants as fsConstants } from 'fs';
import path from 'node:path';
const modelConfigSchema = z.object({
    name: z.string(),
    model: z.string(),
    provider: z.string(),
    apiKey: z.string().optional()
});
const baseDirSchema = z.object({
    base_dir: z.string().min(1)
});
export async function registerAgentRoutes(app, store) {
    app.get('/agents', async (req, reply) => {
        requireOptionalBearerAuth(req, reply);
        if (reply.sent)
            return;
        console.log('Agents data:', store.agents);
        return store.agents;
    });
    app.put('/agents/:id/base-dir', async (request, reply) => {
        const { id } = request.params;
        const parsed = baseDirSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: 'Invalid base_dir', details: parsed.error.errors });
        }
        try {
            const baseDir = path.resolve(parsed.data.base_dir);
            await access(baseDir, fsConstants.R_OK | fsConstants.W_OK);
            const agent = store.agents.find(a => a.id === id);
            if (!agent) {
                return reply.status(404).send({ error: 'Agent not found' });
            }
            agent.base_dir = baseDir;
            return reply.send({ ok: true, base_dir: baseDir });
        }
        catch (err) {
            return reply.status(400).send({ error: 'base_dir not accessible', details: err instanceof Error ? err.message : String(err) });
        }
    });
    app.post('/agents/:id/configure-model', async (request, reply) => {
        const { id } = request.params;
        const parsedBody = modelConfigSchema.safeParse(request.body);
        if (!parsedBody.success) {
            return reply.status(400).send({ error: 'Invalid model configuration data', details: parsedBody.error.errors });
        }
        await store.saveModelConfig(id, parsedBody.data);
        reply.send({ ok: true });
    });
    app.get('/agents/:id/model-config', async (request, reply) => {
        const { id } = request.params;
        // Retrieve model configuration from the database
        const modelConfig = await store.getModelConfig(id);
        if (!modelConfig) {
            return reply.status(404).send({ error: 'Model configuration not found' });
        }
        reply.send(modelConfig);
    });
    app.get('/model-providers', async (request, reply) => {
        // Simulate retrieving available model providers
        const providers = [
            { id: 'openai', name: 'OpenAI' },
            { id: 'huggingface', name: 'Hugging Face' },
        ];
        reply.send(providers);
    });
    app.post('/agents/:id/validate-model-config', async (request, reply) => {
        const { id } = request.params;
        const parsedBody = modelConfigSchema.safeParse(request.body);
        if (!parsedBody.success) {
            return reply.status(400).send({ error: 'Invalid model configuration data', details: parsedBody.error.errors });
        }
        const isValid = await store.validateModelConfig(parsedBody.data);
        if (!isValid) {
            return reply.status(400).send({ error: 'Invalid provider specified' });
        }
        reply.send({ message: 'Model configuration is valid' });
    });
    app.delete('/agents/:id/model-config', async (request, reply) => {
        const { id } = request.params;
        // Delete model configuration from the database
        await store.deleteModelConfig(id);
        reply.send({ ok: true });
    });
    app.post('/agents/:id/model-config', async (request, reply) => {
        const { id } = request.params;
        const parsedBody = modelConfigSchema.safeParse(request.body);
        if (!parsedBody.success) {
            return reply.status(400).send({ error: 'Invalid model configuration data', details: parsedBody.error.errors });
        }
        await store.saveModelConfig(id, parsedBody.data);
        reply.send({ message: 'Model configuration saved successfully' });
    });
}
