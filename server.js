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
  ? 'AAGZ1JrO1lUZCWI6DV88Qx5szzpIWsfOZtc' // Продакшен токен
  : 'DEV_BOT_TOKEN'; // Токен для разработки

// Разрешенные домены
const allowedOrigins = [
  'https://sadsebot.github.io',
  'https://web.telegram.org',
  'http://localhost:4200'
];

// Настройка CORS
const corsOptions = {
  origin: function (origin, callback) {
    // В режиме разработки разрешаем все запросы без origin
    if (!IS_PRODUCTION && !origin) {
      return callback(null, true);
    }

    if (allowedOrigins.some(allowed => origin && origin.startsWith(allowed))) {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Telegram-Init-Data'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

// Пул соединений с БД
const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  debug: !IS_PRODUCTION // Включаем логирование запросов в development
});

// Middleware аутентификации Telegram
function authenticateTelegramRequest(req, res, next) {
  console.log('Received headers:', req.headers);
  
  // Пропускаем проверку для health check
  if (req.path === '/api/health') return next();

  const initData = req.headers['telegram-init-data'];
  
  if (!IS_PRODUCTION) {
    console.log('Development mode: Processing initData anyway');
    try {
      if (initData) {
        const params = new URLSearchParams(initData);
        const user = JSON.parse(params.get('user'));
        req.user = user;
        console.log('Authenticated user (dev):', user);
      } else {
        req.user = { id: 123456789 }; // Fallback mock user
      }
      return next();
    } catch (e) {
      console.error('Error parsing initData:', e);
      return next();
    }
  }

  // В продакшене обязательная проверка
  if (!initData) {
    return res.status(401).json({ 
      error: 'Требуется аутентификация Telegram',
      details: 'Missing Telegram-Init-Data header'
    });
  }

  try {
    // Проверка подписи Telegram
    const isValid = verifyTelegramInitData(initData, TELEGRAM_BOT_TOKEN);
    if (!isValid) {
      return res.status(403).json({ 
        error: 'Неверная подпись Telegram',
        details: 'Hash verification failed'
      });
    }

    next();
  } catch (err) {
    console.error('Ошибка аутентификации:', err);
    res.status(500).json({ 
      error: 'Ошибка проверки аутентификации',
      details: err.message
    });
  }
}

// Функция проверки подписи Telegram
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

    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataToCheck)
      .digest('hex');

    return calculatedHash === hash;
  } catch (e) {
    console.error('Verify error:', e);
    return false;
  }
}

// API Endpoints

// Получение заявок
app.get('/api/requests', authenticateTelegramRequest, async (req, res) => {
  try {
    console.log('User making request:', req.user);
    
    const { status, user_id } = req.query;
    const userId = user_id || req.user?.id;
    
    let query = 'SELECT * FROM requests';
    const params = [];
    
    if (userId) {
      query += ' WHERE user_id = ?';
      params.push(userId);
    }
    
    if (status && status !== 'all') {
      query += userId ? ' AND' : ' WHERE';
      query += ' status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY created_at DESC';
    
    console.log('Executing query:', query, 'with params:', params);
    
    const [rows] = await pool.query(query, params);
    
    if (!rows.length) {
      console.log('No requests found for query');
    }
    
    res.json(rows);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ 
      error: 'Database operation failed',
      details: IS_PRODUCTION ? undefined : error.message
    });
  }
});

// Поиск заявок
app.get('/api/requests/search', authenticateTelegramRequest, async (req, res) => {
  try {
    const { query, user_id } = req.query;
    
    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Search query too short' });
    }
    
    let sql = `SELECT * FROM requests WHERE 
      (name LIKE ? OR phone LIKE ? OR message LIKE ?)`;
    
    const searchParams = [`%${query}%`, `%${query}%`, `%${query}%`];
    
    if (user_id) {
      sql += ' AND id = ?';
      searchParams.push(user_id);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    const [rows] = await pool.query(sql, searchParams);
    res.json(rows);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ 
      error: 'Search operation failed',
      details: !IS_PRODUCTION ? err.message : undefined
    });
  }
});

// Обновление статуса
app.put('/api/requests/:id', authenticateTelegramRequest, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['new', 'in_progress', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }
    
    const [result] = await pool.query(
      'UPDATE requests SET status = ? WHERE id = ?',
      [status, id]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error('Update error:', err);
    res.status(500).json({ 
      error: 'Update operation failed',
      details: !IS_PRODUCTION ? err.message : undefined
    });
  }
});

// Статистика
app.get('/api/requests/stats', authenticateTelegramRequest, async (req, res) => {
  try {
    const { user_id } = req.query;
    
    // Проверяем существование столбца status
    const [columns] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'requests' 
      AND COLUMN_NAME = 'status'
    `);
    
    const hasStatusColumn = columns.length > 0;
    
    let query;
    if (hasStatusColumn) {
      query = `
        SELECT 
          COALESCE(SUM(status = 'new'), 0) AS new,
          COALESCE(SUM(status = 'in_progress'), 0) AS in_progress,
          COALESCE(SUM(status = 'completed'), 0) AS completed,
          COUNT(*) AS total
        FROM requests
      `;
    } else {
      query = `
        SELECT 
          0 AS new,
          0 AS in_progress,
          0 AS completed,
          COUNT(*) AS total
        FROM requests
      `;
    }
    
    const params = [];
    
    if (user_id) {
      query += ' WHERE id = ?';
      params.push(user_id);
    }
    
    const [rows] = await pool.query(query, params);
    res.json(rows[0] || { new: 0, in_progress: 0, completed: 0, total: 0 });
  } catch (err) {
    console.error('Stats error:', err);
    res.json({ new: 0, in_progress: 0, completed: 0, total: 0 });
  }
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy' });
  } catch (err) {
    res.status(500).json({ status: 'unhealthy' });
  }
});
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Telegram-Init-Data');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});
// Обработка 404
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен в ${IS_PRODUCTION ? 'production' : 'development'} режиме`);
  console.log(`Порт: ${PORT}`);
  console.log(`Telegram auth: ${IS_PRODUCTION ? 'Включена' : 'Только mock'}`);
});