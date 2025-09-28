const express = require('express');
const next = require('next');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const server = express();
const port = process.env.PORT || 3002;

// Static files
server.use(express.static(path.join(__dirname, 'public')));

// Health check
server.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Frontend server is running', port: port });
});

// Handle all other routes with Next.js
server.use('*', (req, res) => {
  return handle(req, res);
});

app.prepare().then(() => {
  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`🚀 Next.js server running at http://localhost:${port}`);
  });
});