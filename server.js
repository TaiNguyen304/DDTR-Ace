import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Store room state in memory so reconnected/new clients get current game state
const roomStates = {};

io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);

  socket.on('join_room', (roomName) => {
    socket.join(roomName);
    console.log(`[Socket.IO] Client ${socket.id} joined room: ${roomName}`);
    
    // Send cached room state if available
    if (roomStates[roomName]) {
      socket.emit('game_event', {
        action: 'sync_room_state',
        data: roomStates[roomName]
      });
    }
  });

  socket.on('game_event', (msg) => {
    if (!msg) return;
    const room = msg.topic || msg.room || 'gameshow_money_drop';
    
    // Cache key state elements in roomStates
    if (!roomStates[room]) roomStates[room] = {};
    if (msg.action === 'update_pin') {
      roomStates[room].pin = msg.data?.pin;
    } else if (msg.action === 'sync_bets_to_mc') {
      roomStates[room].bets = msg.data;
    } else if (msg.action === 'change_round') {
      roomStates[room].round = msg.data;
    } else if (msg.action === 'update_content') {
      roomStates[room].question = msg.data;
    } else if (msg.action === 'show_topics') {
      roomStates[room].topics = msg.data;
    }

    // Broadcast to everyone else in the room and broadcast fallback
    socket.to(room).emit('game_event', msg);
    socket.broadcast.emit('game_event', msg);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

// Serve static files from root directory
app.use(express.static(__dirname));

// Helper for serving files with fallback for uppercase/lowercase filenames
const serveFile = (res, fileName) => {
  const filePath = path.join(__dirname, fileName);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, fileName.toLowerCase()), (err2) => {
        if (err2) {
          res.status(404).send('File not found: ' + fileName);
        }
      });
    }
  });
};

// Friendly Route shortcuts
app.get('/', (req, res) => serveFile(res, 'Controller.html'));
app.get('/controller', (req, res) => serveFile(res, 'Controller.html'));
app.get('/host', (req, res) => serveFile(res, 'Host.html'));
app.get('/player', (req, res) => serveFile(res, 'Player.html'));
app.get('/answer', (req, res) => serveFile(res, 'Answer.html'));
app.get('/projector', (req, res) => serveFile(res, 'Projector.html'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', server: 'Money Drop Game Show Server', time: new Date().toISOString() });
});

// Catch-all route
app.get('*', (req, res) => {
  const reqPath = req.path.substring(1);
  if (reqPath && (reqPath.endsWith('.html') || reqPath.endsWith('.png') || reqPath.endsWith('.mp3') || reqPath.endsWith('.wav') || reqPath.endsWith('.otf') || reqPath.endsWith('.ttf') || reqPath.endsWith('.js') || reqPath.endsWith('.css'))) {
    return res.sendFile(path.join(__dirname, reqPath));
  }
  serveFile(res, 'Controller.html');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`================================================`);
  console.log(`🚀 Game Show Server running on port ${PORT}`);
  console.log(`🔗 Local URL: http://localhost:${PORT}`);
  console.log(`🌐 Render Target: https://ddtr-ace.onrender.com`);
  console.log(`================================================`);
});
