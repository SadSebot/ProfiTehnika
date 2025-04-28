const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const crypto = require('crypto');

const app = express();

// Конфигурация
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Конфигурация базы данных
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '123',
  database: 'diplom',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Telegram Bot Token
const TELEGRAM_BOT_TOKEN = IS_PRODUCTION
  ? 'AAGZ1JrO1lUZCWI6DV88Qx5szzpIWsfOZtc'
  : 'DEV_BOT_TOKEN';

// Разрешенные домены
const allowedOrigins = [
  'https://sadsebot.github.io',
  'https://web.telegram.org',
  'http://localhost:4200'
];

// Настройка CORS
app.use(cors({
  origin: function(origin, callback) {
    if (!origin && !IS_PRODUCTION) return callback(null, true);
    if (allowedOrigins.some(o => origin && origin.startsWith(o))) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Telegram-Init-Data'],
  credentials: true
}));

app.use(express.json());

// Пул соединений с БД
const pool = mysql.createPool({
  ...dbConfig,
  debug: !IS_PRODUCTION
});

// Middleware логирования
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Проверка подписи Telegram
function verifyTelegramInitData(initData, botToken) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');

    const dataToCheck = [...params.entries()]
      .map(([key, value]) => `${key}=${value}`)
      .sort()
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    return crypto.createHmac('sha256', secretKey)
      .update(dataToCheck)
      .digest('hex') === hash;
  } catch (e) {
    console.error('Verify error:', e);
    return false;
  }
}

// Middleware аутентификации
function authenticateTelegramRequest(req, res, next) {
  if (req.path === '/api/health') return next();

  const initData = req.headers['telegram-init-data'];

  if (!IS_PRODUCTION) {
    try {
      req.user = initData 
        ? JSON.parse(new URLSearchParams(initData).get('user'))
        : { id: 123456789 };
      return next();
    } catch (e) {
      console.error('Error parsing initData:', e);
      return next();
    }
  }

  if (!initData) {
    return res.status(401).json({ error: 'Telegram auth required' });
  }

  if (!verifyTelegramInitData(initData, TELEGRAM_BOT_TOKEN)) {
    return res.status(403).json({ error: 'Invalid Telegram auth' });
  }

  next();
}

// API Endpoints

// Получение заявок
app.get('/api/requests', authenticateTelegramRequest, async (req, res) => {
  try {
    const { status, user_id } = req.query;
    const userId = user_id || req.user?.id;

    let query = 'SELECT * FROM requests';
    const params = [];
    const conditions = [];

    if (userId) {
      conditions.push('id = ?');
      params.push(userId);
    }

    if (status && status !== 'all') {
      conditions.push('status = ?');
      params.push(status);
    }

    if (conditions.length) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('DB error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Поиск заявок
app.get('/api/requests/search', authenticateTelegramRequest, async (req, res) => {
  try {
    const { query, user_id } = req.query;
    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Query too short' });
    }

    const searchQuery = `%${query}%`;
    const userId = user_id || req.user?.id;

    let sql = `SELECT * FROM requests 
      WHERE (name LIKE ? OR phone LIKE ? OR message LIKE ?)`;
    const params = [searchQuery, searchQuery, searchQuery];

    if (userId) {
      sql += ' AND id = ?';
      params.push(userId);
    }

    sql += ' ORDER BY created_at DESC';

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Обновление статуса
app.put('/api/requests/:id', authenticateTelegramRequest, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['new', 'in_progress', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    await pool.query(
      'UPDATE requests SET status = ? WHERE id = ?',
      [status, id]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ error: 'Update failed' });
  }
});

// Статистика
app.get('/api/requests/stats', authenticateTelegramRequest, async (req, res) => {
  try {
    const { user_id } = req.query;
    const userId = user_id || req.user?.id;

    const [columns] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'requests' 
      AND COLUMN_NAME = 'status'
    `);

    const hasStatus = columns.length > 0;
    let query = `
      SELECT 
        ${hasStatus ? "COALESCE(SUM(status = 'new'), 0) AS new," : "0 AS new,"}
        ${hasStatus ? "COALESCE(SUM(status = 'in_progress'), 0) AS in_progress," : "0 AS in_progress,"}
        ${hasStatus ? "COALESCE(SUM(status = 'completed'), 0) AS completed," : "0 AS completed,"}
        COUNT(*) AS total
      FROM requests
    `;

    const params = [];
    if (userId) {
      query += ' WHERE id = ?';
      params.push(userId);
    }

    const [rows] = await pool.query(query, params);
    res.json(rows[0] || { new: 0, in_progress: 0, completed: 0, total: 0 });
  } catch (error) {
    console.error('Stats error:', error);
    res.json({ new: 0, in_progress: 0, completed: 0, total: 0 });
  }
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy' });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy' });
  }
});

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running in ${IS_PRODUCTION ? 'production' : 'development'} mode`);
  console.log(`Port: ${PORT}`);
  console.log(`Telegram auth: ${IS_PRODUCTION ? 'enabled' : 'mock'}`);
});