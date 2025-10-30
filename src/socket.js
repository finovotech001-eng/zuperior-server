import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import dbService from './services/db.service.js';

let ioInstance = null;

export function initSocket(server) {
  const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);

  const io = new Server(server, {
    cors: {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes(origin) || origin === 'http://localhost:3000') return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
      },
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    // Client should immediately send { token } after connecting
    socket.on('auth', async ({ token }) => {
      try {
        const JWT_SECRET = process.env.JWT_SECRET || process.env.JWT_TOKEN || 'changeme';
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Look up user from database (same as middleware)
        const user = await dbService.prisma.User.findFirst({
          where: { clientId: decoded.clientId },
        });

        if (!user) {
          socket.emit('auth:error', { message: 'User not found' });
          return;
        }

        // Join room using user.id (database ID)
        socket.join(String(user.id));
        socket.userId = user.id; // Store for later reference
        socket.emit('auth:ok');
      } catch (e) {
        console.error('Socket auth error:', e.message);
        socket.emit('auth:error', { message: 'Invalid token' });
      }
    });
  });

  ioInstance = io;
  return io;
}

export function getIO() {
  if (!ioInstance) throw new Error('Socket.io has not been initialized');
  return ioInstance;
}


