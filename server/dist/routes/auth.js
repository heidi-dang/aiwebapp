import jwt from 'jsonwebtoken';
export default async function authRoutes(fastify) {
    fastify.post('/auth/login', async (request, reply) => {
        const { username, password } = request.body;
        // Replace this with your actual user validation logic
        if (username === 'admin' && password === 'password') {
            const token = jwt.sign({ username }, process.env.JWT_SECRET || 'default_secret', {
                expiresIn: '1h',
            });
            return reply.send({ token });
        }
        else {
            return reply.code(401).send({ error: 'Invalid username or password' });
        }
    });
}
