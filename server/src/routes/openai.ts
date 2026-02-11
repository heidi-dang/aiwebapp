import { FastifyInstance } from 'fastify'
import { Store } from '../storage.js'
import { z } from 'zod'
import { requireEnv } from '../util.js'
import { createUserAuthService } from '../user-auth.js'

const RUNNER_URL = requireEnv('RUNNER_URL')

const openaiRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.string(),
    content: z.string()
  })),
  model: z.string(),
  stream: z.boolean().optional()
})

function getBearerToken(authHeader: unknown): string | null {
  if (typeof authHeader !== 'string') return null
  const m = authHeader.match(/^Bearer\s+(.+)$/i)
  return m?.[1] ?? null
}

async function createJob(input: any) {
  const res = await fetch(`${RUNNER_URL}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input })
  })
  if (!res.ok) {
    throw new Error(`Failed to create job: ${res.statusText}`)
  }
  return res.json()
}

async function getJobResult(jobId: string) {
  const res = await fetch(`${RUNNER_URL}/api/jobs/${jobId}/result`)
  if (!res.ok) {
    throw new Error(`Failed to get job result: ${res.statusText}`)
  }
  return res.json()
}

export default function createOpenAIRoutes(store: Store) {
  const auth = createUserAuthService(store)

  return async function registerOpenAIRoutes(app: FastifyInstance) {
    app.post('/v1/chat/completions', async (req, reply) => {
      const token = getBearerToken(req.headers.authorization)
      if (!token) {
        return reply.code(401).send({ error: 'Missing bearer token' })
      }

      const user = await auth.authenticate(token)
      if (!user) {
        return reply.code(401).send({ error: 'Invalid token' })
      }

      const parsed = openaiRequestSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.errors })
      }

      const { messages, model, stream } = parsed.data
      const lastMessage = messages[messages.length - 1]

      try {
        const job = await createJob({
          prompt: lastMessage.content,
          model,
          user_id: user.id
        })

        if (stream) {
          reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          });

          const runnerRes = await fetch(`${RUNNER_URL}/api/jobs/${job.id}/events`);
          if (!runnerRes.ok || !runnerRes.body) {
            throw new Error('Failed to fetch runner events');
          }

          const reader = runnerRes.body.getReader();
          const decoder = new TextDecoder();

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });
              const events = chunk.split('\n\n').filter(Boolean);

              for (const event of events) {
                if (event.startsWith('data:')) {
                  const data = JSON.parse(event.substring(5));
                  const content = data.output || '';
                  const openaiEvent = {
                    choices: [{
                      delta: {
                        content: content
                      }
                    }]
                  };
                  reply.raw.write(`data: ${JSON.stringify(openaiEvent)}\n\n`);
                }
              }
            }
          } finally {
            reader.releaseLock();
            reply.raw.end();
          }
        } else {
          const result = await getJobResult(job.id)
          reply.send({
            choices: [{
              message: {
                role: 'assistant',
                content: result.output
              }
            }]
          })
        }
      } catch (err) {
        reply.code(500).send({ error: (err as Error).message })
      }
    })
  }
}
