const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

// Charger les variables d'environnement
dotenv.config();

// Connexion à la base de données MongoDB & Garantie du compte admin principal
connectDB().then(async () => {
  try {
    const User = require('./models/User');
    const updated = await User.updateOne(
      { email: 'aliou@gmail.com' },
      { $set: { role: 'admin' } }
    );
    if (updated.modifiedCount > 0) {
      console.log('✓ Rôle mis à niveau vers "admin" pour aliou@gmail.com');
    }
  } catch (err) {
    console.error('Erreur migration rôle admin :', err.message);
  }
});

const app = express();

// Middlewares globaux
// Configuration CORS robuste pour accepter Vercel, localhost et les domaines de production
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "https://profsow-front.vercel.app",
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith('.vercel.app') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1')
    ) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes de l'API
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/courses', require('./routes/courseRoutes'));
app.use('/api/subscriptions', require('./routes/subscriptionRoutes'));
app.use('/api/quizzes', require('./routes/quizRoutes'));
app.use('/api/discussions', require('./routes/discussionRoutes'));
app.use('/api/stats', require('./routes/statsRoutes'));
app.use('/api/settings', require('./routes/settingRoutes'));

// Route de test & santé
app.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: "L'API de la plateforme e-learning Profsow fonctionne avec succès.",
    timestamp: new Date().toISOString()
  });
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
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
