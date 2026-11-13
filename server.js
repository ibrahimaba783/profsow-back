const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

// Charger les variables d'environnement
dotenv.config();

// Connexion à la base de données MongoDB
connectDB();

const app = express();

const envOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((u) => u.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'https://profsow-front.vercel.app',
  ...envOrigins,
]);

const vercelPreviewRegex = /^https:\/\/profsow-front(?:-[a-z0-9-]+)?\.vercel\.app$/i;

// Middlewares globaux
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const cleanOrigin = origin.replace(/\/+$/, '');
    if (allowedOrigins.has(cleanOrigin) || vercelPreviewRegex.test(cleanOrigin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origine non autorisée par CORS : ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Route de réveil / santé pour Render & Vercel
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes de l'API
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/courses', require('./routes/courseRoutes'));
app.use('/api/subscriptions', require('./routes/subscriptionRoutes'));
app.use('/api/quizzes', require('./routes/quizRoutes'));
app.use('/api/exercises', require('./routes/exerciseRoutes'));
app.use('/api/discussions', require('./routes/discussionRoutes'));
app.use('/api/stats', require('./routes/statsRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));
app.use('/api/settings', require('./routes/settingRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

// Route de test
app.get('/', (req, res) => {
  res.send("L'API de la plateforme e-learning Profsow fonctionne avec succès.");
});

// Middleware de capture d'erreurs
app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode).json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Le serveur écoute sur le port ${PORT} en mode développement.`);

  // Auto-ping périodique pour empêcher Render Free Tier de s'endormir (inactivité > 15 min)
  const RENDER_URL = (process.env.RENDER_EXTERNAL_URL || 'https://profsow-back.onrender.com').replace(/\/+$/, '');
  const PING_INTERVAL_MS = 10 * 60 * 1000; // toutes les 10 minutes

  const pingServer = async () => {
    try {
      const res = await fetch(`${RENDER_URL}/api/health`, {
        headers: { 'User-Agent': 'Profsow-KeepAlive/1.0' },
      });
      if (res.ok) {
        console.log(`[Keep-Alive] Ping réussi vers ${RENDER_URL}/api/health (${new Date().toLocaleTimeString('fr-FR')})`);
      }
    } catch (err) {
      console.warn(`[Keep-Alive] Ping notification : ${err.message}`);
    }
  };

  if (process.env.NODE_ENV === 'production' || process.env.RENDER_EXTERNAL_URL || process.env.ENABLE_KEEP_ALIVE === 'true') {
    setTimeout(pingServer, 20000);
    setInterval(pingServer, PING_INTERVAL_MS);
  }
});
