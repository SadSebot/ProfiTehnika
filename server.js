const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const crypto = require('crypto');

const app = express();

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
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
      return res.status(200).end();
  }
  next();
});
// Telegram Bot Token
const TELEGRAM_BOT_TOKEN = 'AAGZ1JrO1lUZCWI6DV88Qx5szzpIWsfOZtc';

// Разрешенные домены
const allowedOrigins = [
  'https://sadsebot.github.io/ProfiTehnikaMiniApp/', // Ваш домен Telegram WebApp
  'http://localhost:4200', // Для разработки
  'http://localhost:3000/api/requests',
  'http://localhost:3000/api/requests/search',
  'http://localhost:3000/api/requests/stats'
];

// Настройка CORS
const corsOptions = {
  origin: function (origin, callback) {
      const allowedOrigins = [
          'https://sadsebot.github.io/ProfiTehnikaMiniApp/',
          'http://localhost:4200' // Для разработки
      ];
      
      if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
      } else {
          callback(new Error('Not allowed by CORS'));
      }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Telegram-Init-Data'],
  credentials: true
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Для preflight запросов
app.use(express.json());

// Создаем пул соединений
const pool = mysql.createPool(dbConfig);

// Middleware для проверки Telegram WebApp данных
function authenticateTelegramRequest(req, res, next) {
  try {
    const initData = req.headers['telegram-init-data'];
    
    // Для тестирования можно временно отключить проверку
    if (process.env.NODE_ENV === 'development' && !initData) {
      console.warn('Внимание: проверка Telegram данных отключена в development');
      return next();
    }
    
    if (!initData) {
      return res.status(401).json({ error: 'Telegram init data missing' });
    }
    
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');
    
    const dataToCheck = Array.from(params.entries())
      .map(([key, value]) => `${key}=${value}`)
      .sort()
      .join('\n');
    
    const secretKey = crypto.createHmac('sha256', 'WebAppData')
      .update(TELEGRAM_BOT_TOKEN)
      .digest();
    
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataToCheck)
      .digest('hex');
      
    if (calculatedHash !== hash) {
      return res.status(401).json({ error: 'Invalid Telegram hash' });
    }
    
    next();
  } catch (err) {
    console.error('Telegram auth error:', err);
    res.status(500).json({ error: 'Authentication error' });
  }
}

// API для получения заявок
app.get('/api/requests', authenticateTelegramRequest, async (req, res) => {
  try {
      const { status, user_id } = req.query;
      let query = 'SELECT * FROM requests';
      const params = [];
    
    if (user_id) {
      query += ' WHERE user_id = ?';
      params.push(user_id);
      
      if (status && status !== 'all') {
        query += ' AND status = ?';
        params.push(status);
      }
    } else if (status && status !== 'all') {
      query += ' WHERE status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('DB Error:', err);
        res.status(500).json({ 
            error: 'Database error',
            message: err.message // Отправляем понятное сообщение
        });
    }
});

// Поиск заявок
app.get('/api/requests/search', authenticateTelegramRequest, async (req, res) => {
  try {
    const { query, user_id } = req.query;
    
    let sql = `SELECT * FROM requests WHERE 
      (name LIKE ? OR phone LIKE ? OR message LIKE ?)`;
    
    const searchParams = [`%${query}%`, `%${query}%`, `%${query}%`];
    
    if (user_id) {
      sql += ' AND user_id = ?';
      searchParams.push(user_id);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    const [rows] = await pool.query(sql, searchParams);
    res.json(rows);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Обновление статуса заявки
app.put('/api/requests/:id', authenticateTelegramRequest, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    await pool.query(
      'UPDATE requests SET status = ? WHERE id = ?',
      [status, id]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error('Update error:', err);
    res.status(500).json({ error: 'Update failed' });
  }
});

// Получение статистики
app.get('/api/requests/stats', authenticateTelegramRequest, async (req, res) => {
  try {
    const { user_id } = req.query;
    
    let query = `SELECT 
      SUM(status = 'new') AS new,
      SUM(status = 'in_progress') AS in_progress,
      SUM(status = 'completed') AS completed
    FROM requests`;
    
    const params = [];
    
    if (user_id) {
      query += ' WHERE user_id = ?';
      params.push(user_id);
    }
    
    const [rows] = await pool.query(query, params);
    res.json(rows[0]);
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Stats failed' });
  }
});

// Проверка работоспособности API
app.get('/api/health', async (req, res) => {
  try {
      const [rows] = await pool.query('SELECT 1 AS status');
      res.json({
          status: 'healthy',
          timestamp: new Date().toISOString()
      });
  } catch (err) {
      res.status(500).json({
          status: 'unhealthy',
          error: err.message
      });
  }
});

// Обработка несуществующих маршрутов
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Маршрут не найден',
    path: req.path,
    method: req.method
  });
});

// Инициализация сервера
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`Разрешенные домены: ${allowedOrigins.join(', ')}`);
});