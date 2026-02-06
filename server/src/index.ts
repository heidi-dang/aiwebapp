import dotenv from 'dotenv'
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import express, { Request, Response } from 'express';

const PORT = Number(process.env.PORT ?? 7777)
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3000'
const EXTRA_ORIGINS = [
  'https://heidiai.com.au',
  'https://www.heidiai.com.au',
  'https://api.heidiai.com.au'
]

async function main() {
  const app = express();

  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  app.listen(PORT, '127.0.0.1', () => {
    console.log(`Express server listening on http://127.0.0.1:${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
