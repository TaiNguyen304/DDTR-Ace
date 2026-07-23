import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
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

  // Store room state & passwords in memory
  const roomStates: Record<string, any> = {};
  const activeRooms: Record<string, { auth: string; created: number }> = {};

  // API endpoints for Room Management
  app.post('/api/create-room', (req, res) => {
    const { roomid, auth } = req.body;
    if (!roomid) return res.status(400).json({ error: 'Missing roomid' });
    activeRooms[roomid] = {
      auth: String(auth || '0000'),
      created: Date.now()
    };
    console.log(`[API] Created room: ${roomid}, auth: ${auth}`);
    res.json({ success: true, roomid, auth });
  });

  app.post('/api/verify-room', (req, res) => {
    const { roomid, auth } = req.body;
    if (!roomid) {
      return res.json({ valid: false, message: 'Thiếu mã phòng chơi!' });
    }
    // Auto-register room if created before server restart or direct connection
    if (!activeRooms[roomid]) {
      if (auth !== undefined && auth !== null) {
        activeRooms[roomid] = { auth: String(auth), created: Date.now() };
      } else {
        return res.json({ valid: false, message: 'Phòng chơi không tồn tại!' });
      }
    }
    if (auth !== undefined && auth !== null) {
      if (String(activeRooms[roomid].auth) !== String(auth)) {
        return res.json({ valid: false, message: 'Mật khẩu phòng chơi không đúng!' });
      }
    }
    res.json({ valid: true, roomid });
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    socket.on('join_room', (data) => {
      const roomName = typeof data === 'string' ? data : data?.room;
      if (!roomName) return;
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
      const room = msg.room || msg.topic || 'gameshow_money_drop';
      
      // Cache key state elements in roomStates
      if (!roomStates[room]) roomStates[room] = {};
      if (msg.action === 'sync_bets_to_mc') {
        roomStates[room].bets = msg.data;
      } else if (msg.action === 'change_round') {
        roomStates[room].round = msg.data;
      } else if (msg.action === 'update_content') {
        roomStates[room].question = msg.data;
      } else if (msg.action === 'show_topics') {
        roomStates[room].topics = msg.data;
      }

      // Broadcast ONLY to sockets in this room
      io.to(room).emit('game_event', msg);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });

  // Serve static files from root
  app.use(express.static(__dirname));

  // Friendly Route shortcuts
  const serveFile = (res: express.Response, fileName: string) => {
    const filePath = path.join(__dirname, fileName);
    res.sendFile(filePath, (err) => {
      if (err) {
        res.sendFile(path.join(__dirname, fileName.toLowerCase()));
      }
    });
  };

  app.get('/login', (req, res) => serveFile(res, 'Login.html'));
  app.get('/player', (req, res) => serveFile(res, 'Player.html'));
  app.get('/answer', (req, res) => serveFile(res, 'Answer.html'));
  app.get('/projector', (req, res) => serveFile(res, 'Projector.html'));
  app.get('/host', (req, res) => serveFile(res, 'Host.html'));
  app.get('/controller', (req, res) => serveFile(res, 'Controller.html'));
  app.get('/', (req, res) => serveFile(res, 'Controller.html'));

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', server: 'Money Drop Game Show Server', time: new Date().toISOString() });
  });

  // Vite middleware in dev or fallback in prod
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      serveFile(res, 'Controller.html');
    });
  }

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`================================================`);
    console.log(`🚀 Game Show Server running on port ${PORT}`);
    console.log(`🔗 Controller: http://localhost:${PORT}/controller`);
    console.log(`🌐 Render Target: https://ddtr-ace.onrender.com`);
    console.log(`================================================`);
  });
}

startServer();
