require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sql = require('mssql');

const app = express();
app.use(cors());
app.use(express.json());

// Конфигурация подключения к SQL Server
const dbConfig = {
    user: 'SADSEBOT\SadSebot', // например 'sa'
    password: '',
    server: 'SADSEBOT\\SQLEXPRESS', // ОБРАТИТЕ ВНИМАНИЕ НА ДВОЙНОЙ ОБРАТНЫЙ СЛЭШ
    database: 'diplombaza',
    options: {
      encrypt: false, // Для локального подключения
      trustServerCertificate: true, // Для самоподписанных сертификатов
      connectTimeout: 30000, // увеличим таймаут до 30 секунд
      instanceName: 'SQLEXPRESS' // явно указываем имя экземпляра
    }
  };

// Подключение к базе данных
async function connectToDatabase() {
  try {
    await sql.connect(dbConfig);
    console.log('Connected to SQL Server');
  } catch (err) {
    console.error('Database connection failed:', err);
    process.exit(1);
  }
}

connectToDatabase();

// Пример API endpoint для получения мастеров
app.get('/api/masters', async (req, res) => {
  try {
    const result = await sql.query`SELECT * FROM dbo.zayavki`;
    res.json(result.recordset);
  } catch (err) {
    console.error('SQL error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
const corsOptions = {
    origin: 'http://localhost:4200', // URL вашего Angular приложения
    optionsSuccessStatus: 200
  };
  
  app.use(cors(corsOptions));