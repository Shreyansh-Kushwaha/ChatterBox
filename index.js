const http = require("http");
const express = require("express");
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ROOMS = ['general', 'tech', 'gaming', 'random'];
const MAX_HISTORY = 50;

const users = new Map(); // socketId -> { username, room }
const roomHistory = {};
ROOMS.forEach(r => { roomHistory[r] = []; });

function getRoomUsers(room) {
  const list = [];
  users.forEach(u => { if (u.room === room) list.push(u.username); });
  return list;
}

function broadcastPresence(room) {
  io.to(room).emit('users-list', getRoomUsers(room));
}

io.on('connection', socket => {
  socket.on('join', ({ username, room }) => {
    // Leave any existing room to prevent double-subscription on re-join
    const existing = users.get(socket.id);
    if (existing) socket.leave(existing.room);

    const name = String(username || '').trim().slice(0, 20) || `User${socket.id.slice(0, 4)}`;
    const validRoom = ROOMS.includes(room) ? room : 'general';

    users.set(socket.id, { username: name, room: validRoom });
    socket.join(validRoom);

    socket.emit('joined', { username: name, room: validRoom });
    socket.emit('load-history', roomHistory[validRoom]);

    io.to(validRoom).emit('message', {
      type: 'system',
      text: `${name} joined the chat`,
      timestamp: Date.now()
    });
    broadcastPresence(validRoom);
  });

  socket.on('user-message', text => {
    const user = users.get(socket.id);
    if (!user || !String(text || '').trim()) return;

    const msg = {
      type: 'chat',
      text: String(text).trim().slice(0, 500),
      sender: socket.id,
      username: user.username,
      timestamp: Date.now()
    };

    roomHistory[user.room].push(msg);
    if (roomHistory[user.room].length > MAX_HISTORY) roomHistory[user.room].shift();

    io.to(user.room).emit('message', msg);
  });

  socket.on('typing', isTyping => {
    const user = users.get(socket.id);
    if (!user) return;
    socket.to(user.room).emit('typing', { username: user.username, id: socket.id, typing: Boolean(isTyping) });
  });

  socket.on('switch-room', newRoom => {
    const user = users.get(socket.id);
    if (!user || !ROOMS.includes(newRoom) || user.room === newRoom) return;

    const oldRoom = user.room;
    socket.leave(oldRoom);

    io.to(oldRoom).emit('message', {
      type: 'system',
      text: `${user.username} left`,
      timestamp: Date.now()
    });
    broadcastPresence(oldRoom);

    socket.join(newRoom);  // join before mutating state to close the race window
    user.room = newRoom;

    socket.emit('load-history', roomHistory[newRoom]);

    io.to(newRoom).emit('message', {
      type: 'system',
      text: `${user.username} joined the chat`,
      timestamp: Date.now()
    });
    broadcastPresence(newRoom);
  });

  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (!user) return;
    const { username, room } = user;
    users.delete(socket.id);

    io.to(room).emit('message', {
      type: 'system',
      text: `${username} left the chat`,
      timestamp: Date.now()
    });
    broadcastPresence(room);
  });
});

app.use(express.static(path.resolve('./public')));

server.listen(7000, () => console.log('ChatterBox running on http://localhost:7000'));
