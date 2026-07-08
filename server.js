const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

// Charger les variables d'environnement
dotenv.config();


// --- DEBUG TEMPORAIRE ---
console.log('DEBUG SMTP_USER:', process.env.SMTP_USER);
console.log('DEBUG SMTP_PASS existe:', !!process.env.SMTP_PASS);
// --- FIN DEBUG ---

// Connexion à la base de données MongoDB
connectDB();

const app = express();

// Middlewares globaux
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://profsow-front.vercel.app"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
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
});
