const http = require('http');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello from sellingdubai\n');
});

server.listen(PORT, () => {
  console.log(`Server is listening on http://localhost:${PORT}`);
});
