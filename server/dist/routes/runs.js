import { requireOptionalBearerAuth } from '../auth.js';
import { RunEvent } from '../types.js';
function nowSeconds() {
    return Math.floor(Date.now() / 1000);
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function writeChunk(replyRaw, chunk) {
    // Ensure chunks are newline-delimited so downstream stream parsers
    // can split and parse individual JSON objects incrementally.
    replyRaw.write(JSON.stringify(chunk) + '\n');
}
function requireEnv(name) {
    const v = process.env[name];
    if (!v)
        throw new Error(`Missing required env var: ${name}`);
    return v;
}
export async function registerRunRoutes(app, store) {
    const RUNNER_URL = requireEnv('RUNNER_URL');
    const RUNNER_TOKEN = process.env.RUNNER_TOKEN ?? 'change_me';
    app.post('/agents/:agentId/runs', async (req, reply) => {
        requireOptionalBearerAuth(req, reply);
        if (reply.sent)
            return;
        const { agentId } = req.params;
        const agent = store.agents.find((a) => a.id === agentId);
        if (!agent || !agent.db_id) {
            reply.code(404);
            return { detail: 'Agent not found' };
        }
        let message = '';
        let sessionId = '';
        for await (const part of req.parts()) {
            if (part.type === 'field') {
                if (part.fieldname === 'message')
                    message = String(part.value ?? '');
                if (part.fieldname === 'session_id')
                    sessionId = String(part.value ?? '');
            }
            else {
                // Drain any file streams (MVP ignores file uploads)
                await part.toBuffer();
            }
        }
        const created = await store.getOrCreateSession({
            dbId: agent.db_id,
            entityType: 'agent',
            componentId: agentId,
            sessionId,
            sessionName: message || 'New session'
        });
        const origin = req.headers.origin;
        if (origin) {
            reply.raw.setHeader('Access-Control-Allow-Origin', origin);
            reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
        }
        reply.raw.setHeader('Content-Type', 'application/json; charset=utf-8');
        reply.raw.setHeader('Cache-Control', 'no-cache');
        reply.raw.setHeader('Connection', 'keep-alive');
        reply.raw.flushHeaders();
        // Call runner to create job
        const runnerRes = await fetch(`${RUNNER_URL}/api/jobs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RUNNER_TOKEN}`
            },
            body: JSON.stringify({
                input: {
                    message,
                    session_id: created.sessionId,
                    provider: 'copilotapi',
                    model: 'gpt-4o'
                }
            })
        });
        if (!runnerRes.ok) {
            const text = await runnerRes.text();
            reply.code(500);
            return { detail: `Runner error: ${runnerRes.status} ${text}` };
        }
        const job = await runnerRes.json();
        const jobId = job.id;
        // Stream events from runner
        const eventsRes = await fetch(`${RUNNER_URL}/api/jobs/${jobId}/events`, {
            headers: {
                'Authorization': `Bearer ${RUNNER_TOKEN}`
            }
        });
        if (!eventsRes.ok) {
            const text = await eventsRes.text();
            reply.code(500);
            return { detail: `Events error: ${eventsRes.status} ${text}` };
        }
        const reader = eventsRes.body?.getReader();
        if (!reader) {
            reply.code(500);
            return { detail: 'No reader for events' };
        }
        const decoder = new TextDecoder();
        let buffer = '';
        let finalContent = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        try {
                            const event = JSON.parse(data);
                            let chunk = null;
                            if (event.type === 'job.started') {
                                chunk = {
                                    event: RunEvent.RunStarted,
                                    content_type: 'text',
                                    created_at: nowSeconds(),
                                    session_id: created.sessionId,
                                    agent_id: agentId,
                                    content: ''
                                };
                            }
                            else if (event.type === 'tool.output' && typeof event.data?.output === 'string') {
                                const output = event.data.output;
                                finalContent += output;
                                chunk = {
                                    event: RunEvent.RunContent,
                                    content_type: 'text',
                                    created_at: nowSeconds(),
                                    session_id: created.sessionId,
                                    agent_id: agentId,
                                    content: output
                                };
                            }
                            else if (event.type === 'done') {
                                chunk = {
                                    event: RunEvent.RunCompleted,
                                    content_type: 'text',
                                    created_at: nowSeconds(),
                                    session_id: created.sessionId,
                                    agent_id: agentId,
                                    content: finalContent
                                };
                            }
                            if (chunk) {
                                writeChunk(reply.raw, chunk);
                            }
                        }
                        catch (e) {
                            // ignore parse errors
                        }
                    }
                }
            }
        }
        finally {
            reader.releaseLock();
        }
        await store.appendRun({
            dbId: agent.db_id,
            entityType: 'agent',
            componentId: agentId,
            sessionId: created.sessionId,
            run: {
                run_input: message,
                content: finalContent,
                created_at: nowSeconds()
            }
        });
        reply.raw.end();
    });
    app.post('/teams/:teamId/runs', async (req, reply) => {
        requireOptionalBearerAuth(req, reply);
        if (reply.sent)
            return;
        const { teamId } = req.params;
        const team = store.teams.find((t) => t.id === teamId);
        if (!team || !team.db_id) {
            reply.code(404);
            return { detail: 'Team not found' };
        }
        let message = '';
        let sessionId = '';
        for await (const part of req.parts()) {
            if (part.type === 'field') {
                if (part.fieldname === 'message')
                    message = String(part.value ?? '');
                if (part.fieldname === 'session_id')
                    sessionId = String(part.value ?? '');
            }
            else {
                // Drain any file streams (MVP ignores file uploads)
                await part.toBuffer();
            }
        }
        const created = await store.getOrCreateSession({
            dbId: team.db_id,
            entityType: 'team',
            componentId: teamId,
            sessionId,
            sessionName: message || 'New session'
        });
        const origin = req.headers.origin;
        if (origin) {
            reply.raw.setHeader('Access-Control-Allow-Origin', origin);
            reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
        }
        reply.raw.setHeader('Content-Type', 'application/json; charset=utf-8');
        reply.raw.setHeader('Cache-Control', 'no-cache');
        reply.raw.setHeader('Connection', 'keep-alive');
        reply.raw.flushHeaders();
        const started = {
            event: RunEvent.TeamRunStarted,
            content_type: 'text',
            created_at: nowSeconds(),
            session_id: created.sessionId,
            team_id: teamId,
            content: ''
        };
        writeChunk(reply.raw, started);
        const finalText = `Echo: ${message}`;
        let current = '';
        const steps = Math.min(5, Math.max(2, Math.ceil(finalText.length / 12)));
        for (let i = 1; i <= steps; i++) {
            const sliceLen = Math.ceil((finalText.length * i) / steps);
            current = finalText.slice(0, sliceLen);
            const chunk = {
                event: RunEvent.TeamRunContent,
                content_type: 'text',
                created_at: nowSeconds(),
                session_id: created.sessionId,
                team_id: teamId,
                content: current
            };
            writeChunk(reply.raw, chunk);
            await sleep(60);
        }
        const completed = {
            event: RunEvent.TeamRunCompleted,
            content_type: 'text',
            created_at: nowSeconds(),
            session_id: created.sessionId,
            team_id: teamId,
            content: finalText
        };
        writeChunk(reply.raw, completed);
        await store.appendRun({
            dbId: team.db_id,
            entityType: 'team',
            componentId: teamId,
            sessionId: created.sessionId,
            run: {
                run_input: message,
                content: finalText,
                created_at: completed.created_at
            }
        });
        reply.raw.end();
    });
}
