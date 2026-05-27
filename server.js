const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session configuration
app.use(session({
  secret: 'smart-mirror-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true if using HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Data file paths
const DATA_DIR = path.join(__dirname, 'data');
const ANNOUNCEMENTS_FILE = path.join(DATA_DIR, 'announcements.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

// Initialize announcements file
if (!fs.existsSync(ANNOUNCEMENTS_FILE)) {
  fs.writeFileSync(ANNOUNCEMENTS_FILE, JSON.stringify({
    announcements: [],
    events: []
  }, null, 2));
}

// Initialize users file with default admin
if (!fs.existsSync(USERS_FILE)) {
  const defaultAdmin = {
    username: 'admin',
    password: bcrypt.hashSync('admin123', 10),
    role: 'admin',
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(USERS_FILE, JSON.stringify([defaultAdmin], null, 2));
}

// Helper functions
function loadAnnouncements() {
  try {
    const data = fs.readFileSync(ANNOUNCEMENTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { announcements: [], events: [] };
  }
}

function saveAnnouncements(data) {
  fs.writeFileSync(ANNOUNCEMENTS_FILE, JSON.stringify(data, null, 2));
}

function loadUsers() {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Broadcast to Smart Mirror
function broadcastToMirror(type, data) {
  io.emit('mirror-update', { type, data });
}

// ============ AUTHENTICATION ROUTES ============

// Register new user
app.post('/api/register', async (req, res) => {
  const { username, password, confirmPassword } = req.body;
  
  // Validation
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }
  
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  
  const users = loadUsers();
  
  // Check if username exists
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'Username already exists' });
  }
  
  // Hash password and create user
  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = {
    id: Date.now(),
    username,
    password: hashedPassword,
    role: 'user',
    createdAt: new Date().toISOString()
  };
  
  users.push(newUser);
  saveUsers(users);
  
  res.json({ success: true, message: 'Registration successful! Please login.' });
});

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  const users = loadUsers();
  const user = users.find(u => u.username === username);
  
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  
  const isValidPassword = await bcrypt.compare(password, user.password);
  
  if (!isValidPassword) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  
  // Set session
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role;
  
  res.json({ 
    success: true, 
    user: { 
      username: user.username, 
      role: user.role 
    } 
  });
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Check session
app.get('/api/check-session', (req, res) => {
  if (req.session && req.session.userId) {
    res.json({ 
      authenticated: true, 
      user: { 
        username: req.session.username, 
        role: req.session.role 
      } 
    });
  } else {
    res.json({ authenticated: false });
  }
});

// Change password
app.post('/api/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  const users = loadUsers();
  const user = users.find(u => u.id === req.session.userId);
  
  const isValid = await bcrypt.compare(currentPassword, user.password);
  if (!isValid) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  
  user.password = await bcrypt.hash(newPassword, 10);
  saveUsers(users);
  
  res.json({ success: true, message: 'Password changed successfully' });
});

// ============ API ROUTES (Protected) ============

// Get all announcements
app.get('/api/announcements', requireAuth, (req, res) => {
  const data = loadAnnouncements();
  res.json(data);
});

// Add new announcement
app.post('/api/announcements', requireAuth, (req, res) => {
  const { title, content, date, priority = 'normal' } = req.body;
  const data = loadAnnouncements();
  
  const newAnnouncement = {
    id: Date.now(),
    title,
    content,
    date: date || new Date().toISOString(),
    priority,
    createdBy: req.session.username,
    createdAt: new Date().toISOString()
  };
  
  data.announcements.unshift(newAnnouncement);
  saveAnnouncements(data);
  
  // Broadcast to Smart Mirror
  broadcastToMirror('announcement', newAnnouncement);
  
  res.json({ success: true, announcement: newAnnouncement });
});

// Delete announcement
app.delete('/api/announcements/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const data = loadAnnouncements();
  
  data.announcements = data.announcements.filter(a => a.id !== id);
  saveAnnouncements(data);
  
  broadcastToMirror('delete-announcement', id);
  
  res.json({ success: true });
});

// Update announcement
app.put('/api/announcements/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const { title, content } = req.body;
  const data = loadAnnouncements();
  
  const announcement = data.announcements.find(a => a.id === id);
  if (announcement) {
    announcement.title = title;
    announcement.content = content;
    announcement.updatedBy = req.session.username;
    announcement.updatedAt = new Date().toISOString();
    saveAnnouncements(data);
    
    broadcastToMirror('update-announcement', announcement);
    res.json({ success: true, announcement });
  } else {
    res.status(404).json({ error: 'Announcement not found' });
  }
});

// Add calendar event
app.post('/api/events', requireAuth, (req, res) => {
  const { title, date, description, color = '#c5a059' } = req.body;
  const data = loadAnnouncements();
  
  const newEvent = {
    id: Date.now(),
    title,
    date,
    description,
    color,
    createdBy: req.session.username,
    createdAt: new Date().toISOString()
  };
  
  data.events.push(newEvent);
  saveAnnouncements(data);
  
  broadcastToMirror('event', newEvent);
  
  res.json({ success: true, event: newEvent });
});

// Delete event
app.delete('/api/events/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const data = loadAnnouncements();
  
  data.events = data.events.filter(e => e.id !== id);
  saveAnnouncements(data);
  
  broadcastToMirror('delete-event', id);
  
  res.json({ success: true });
});

// Get all events
app.get('/api/events', requireAuth, (req, res) => {
  const data = loadAnnouncements();
  res.json(data.events);
});

// ============ WEB SOCKET CONNECTION ============
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  // Send initial data to new client
  const data = loadAnnouncements();
  socket.emit('initial-data', data);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ============ START SERVER ============
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log(`🔐 Admin panel: http://localhost:${PORT}`);
  console.log(`📝 Default admin: admin / admin123`);
});