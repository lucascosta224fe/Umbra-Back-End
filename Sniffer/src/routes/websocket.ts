import { Server } from 'socket.io';
import http from 'http';

const server = http.createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Snnifer Server!');
});

server.listen(3000, () => {
    console.log('Server running at http://localhost:3000/');
});

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log('Frontend conectado');
});

export { io };