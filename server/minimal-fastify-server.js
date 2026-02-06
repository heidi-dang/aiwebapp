import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get('/test', async (request, reply) => {
  return { message: 'Test endpoint is working!' };
});

const PORT = 8888;

app.listen({ port: PORT }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Server listening at ${address}`);
});