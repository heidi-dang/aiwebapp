import express from 'express';

const app = express();

app.get('/test', (req, res) => {
  res.json({ message: 'Test endpoint is working!' });
});

const PORT = 8888;
app.listen(PORT, () => {
  console.log(`Express server listening on http://127.0.0.1:${PORT}`);
});