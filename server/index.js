const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const OpenIDConnectStrategy = require('passport-openidconnect').Strategy;
const SQLiteStore = require('connect-sqlite3')(session);

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || './data/rust-book.db';
const BOOK_PATH = process.env.BOOK_PATH || path.join(__dirname, 'public');
const SSO_ENABLED = false; // TODO

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Session configuration
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: './data' }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Initialize SQLite database
const db = new Database(DB_PATH);

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT,
    name TEXT,
    picture TEXT,
    provider TEXT,
    last_login DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS quiz_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    quiz_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    answer TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, question_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS highlights (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    page TEXT NOT NULL,
    start_meta TEXT NOT NULL,
    end_meta TEXT NOT NULL,
    text TEXT NOT NULL,
    extra TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reading_positions (
    user_id TEXT PRIMARY KEY,
    page TEXT NOT NULL,
    scroll_position INTEGER DEFAULT 0,
    progress_percent REAL DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_quiz_user ON quiz_responses(user_id);
  CREATE INDEX IF NOT EXISTS idx_quiz_question ON quiz_responses(question_id);
  CREATE INDEX IF NOT EXISTS idx_highlight_user ON highlights(user_id);
  CREATE INDEX IF NOT EXISTS idx_highlight_page ON highlights(page);
  CREATE INDEX IF NOT EXISTS idx_reading_position_timestamp ON reading_positions(timestamp);
`);

// Initialize default user for single-user mode
if (!SSO_ENABLED) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO users (id, email, name, picture, provider, last_login)
    VALUES ('default-user', NULL, 'Default User', NULL, 'local', CURRENT_TIMESTAMP)
  `);
  stmt.run();
  console.log('Single-user mode: default-user initialized');
}

// Helper to get user_id
const getUserId = (req) => {
  // If authenticated via SSO, use the session user
  if (req.user && req.user.id) {
    return req.user.id;
  }
  // In single-user mode (no SSO), use a consistent default user ID
  // This allows the same user to access their data across sessions
  return 'default-user';
};

// Optional authentication middleware
const optionalAuth = (req, res, next) => {
  // Allow both authenticated and anonymous access
  next();
};

// Required authentication middleware
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      loginUrl: '/auth/login'
    });
  }
  next();
};

// API Routes

// Server configuration endpoint
app.get('/api/config', (req, res) => {
  res.json({
    enabled: true,
    ssoEnabled: SSO_ENABLED,
    singleUserMode: !SSO_ENABLED,
    user: req.user ? {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      picture: req.user.picture
    } : null
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    ssoEnabled: SSO_ENABLED,
    authenticated: !!req.user
  });
});

// Get all quiz responses for a user
app.get('/api/quiz-responses', (req, res) => {
  try {
    const userId = getUserId(req);
    const stmt = db.prepare('SELECT * FROM quiz_responses WHERE user_id = ? ORDER BY timestamp DESC');
    const responses = stmt.all(userId);
    res.json(responses);
  } catch (error) {
    console.error('Error fetching quiz responses:', error);
    res.status(500).json({ error: 'Failed to fetch quiz responses' });
  }
});

// Get quiz response for a specific question
app.get('/api/quiz-responses/:questionId', (req, res) => {
  try {
    const userId = getUserId(req);
    const { questionId } = req.params;
    const stmt = db.prepare('SELECT * FROM quiz_responses WHERE user_id = ? AND question_id = ?');
    const response = stmt.get(userId, questionId);
    res.json(response || null);
  } catch (error) {
    console.error('Error fetching quiz response:', error);
    res.status(500).json({ error: 'Failed to fetch quiz response' });
  }
});

// Save quiz response
app.post('/api/quiz-responses', (req, res) => {
  try {
    const userId = getUserId(req);
    const { quiz_id, question_id, answer, is_correct } = req.body;

    if (!quiz_id || !question_id || answer === undefined || is_correct === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const stmt = db.prepare(`
      INSERT INTO quiz_responses (user_id, quiz_id, question_id, answer, is_correct)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, question_id) DO UPDATE SET
        answer = excluded.answer,
        is_correct = excluded.is_correct,
        timestamp = CURRENT_TIMESTAMP
    `);

    const result = stmt.run(userId, quiz_id, question_id, answer, is_correct);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    console.error('Error saving quiz response:', error);
    res.status(500).json({ error: 'Failed to save quiz response' });
  }
});

// Get all highlights for a user
app.get('/api/highlights', (req, res) => {
  try {
    const userId = getUserId(req);
    const page = req.query.page;

    let stmt;
    let highlights;

    if (page) {
      stmt = db.prepare('SELECT * FROM highlights WHERE user_id = ? AND page = ? ORDER BY timestamp DESC');
      highlights = stmt.all(userId, page);
    } else {
      stmt = db.prepare('SELECT * FROM highlights WHERE user_id = ? ORDER BY timestamp DESC');
      highlights = stmt.all(userId);
    }

    res.json(highlights);
  } catch (error) {
    console.error('Error fetching highlights:', error);
    res.status(500).json({ error: 'Failed to fetch highlights' });
  }
});

// Save highlight
app.post('/api/highlights', (req, res) => {
  try {
    const userId = getUserId(req);
    const { id, page, start_meta, end_meta, text, extra } = req.body;

    if (!id || !page || !start_meta || !end_meta || !text) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO highlights (id, user_id, page, start_meta, end_meta, text, extra, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.run(
      id,
      userId,
      page,
      JSON.stringify(start_meta),
      JSON.stringify(end_meta),
      text,
      extra ? JSON.stringify(extra) : null
    );

    res.json({ success: true, id });
  } catch (error) {
    console.error('Error saving highlight:', error);
    res.status(500).json({ error: 'Failed to save highlight' });
  }
});

// Delete highlight
app.delete('/api/highlights/:id', (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const stmt = db.prepare('DELETE FROM highlights WHERE id = ? AND user_id = ?');
    const result = stmt.run(id, userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Highlight not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting highlight:', error);
    res.status(500).json({ error: 'Failed to delete highlight' });
  }
});

// Statistics endpoint (optional)
app.get('/api/stats', (req, res) => {
  try {
    const userId = getUserId(req);

    const quizStats = db.prepare(`
      SELECT 
        COUNT(*) as total_questions,
        SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct_answers
      FROM quiz_responses
      WHERE user_id = ?
    `).get(userId);

    const highlightStats = db.prepare(`
      SELECT COUNT(*) as total_highlights
      FROM highlights
      WHERE user_id = ?
    `).get(userId);

    res.json({
      quiz: quizStats,
      highlights: highlightStats
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Reading position endpoints
app.get('/api/reading-position', (req, res) => {
  try {
    const userId = getUserId(req);
    const stmt = db.prepare('SELECT * FROM reading_positions WHERE user_id = ?');
    const position = stmt.get(userId);
    res.json(position || null);
  } catch (error) {
    console.error('Error fetching reading position:', error);
    res.status(500).json({ error: 'Failed to fetch reading position' });
  }
});

app.post('/api/reading-position', (req, res) => {
  try {
    const userId = getUserId(req);
    const { page, scroll_position, progress_percent } = req.body;

    if (!page) {
      return res.status(400).json({ error: 'Page is required' });
    }

    const stmt = db.prepare(`
      INSERT INTO reading_positions (user_id, page, scroll_position, progress_percent, timestamp)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        page = excluded.page,
        scroll_position = excluded.scroll_position,
        progress_percent = excluded.progress_percent,
        timestamp = CURRENT_TIMESTAMP
    `);

    stmt.run(userId, page, scroll_position || 0, progress_percent || 0);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving reading position:', error);
    res.status(500).json({ error: 'Failed to save reading position' });
  }
});

// Serve static book files
app.use(express.static(BOOK_PATH, {
  setHeaders: (res, filePath) => {
    // Cache static assets
    if (filePath.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// Fallback to index.html for client-side routing
app.get('*', (req, res, next) => {
  // Skip API routes
  if (req.path.startsWith('/api') || req.path.startsWith('/auth')) {
    return next();
  }
  
  res.sendFile(path.join(BOOK_PATH, 'index.html'), (err) => {
    if (err) {
      next();
    }
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing database...');
  db.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing database...');
  db.close();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Rust Book server running on port ${PORT}`);
  console.log(`Serving book from: ${BOOK_PATH}`);
  console.log(`Database path: ${DB_PATH}`);
  console.log(`API available at: /api`);
});
