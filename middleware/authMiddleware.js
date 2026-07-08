const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return res.status(401).json({ message: 'Utilisateur non trouvé' });
      }

      return next();
    } catch (error) {
      console.error(error);
      return res.status(401).json({ message: 'Non autorisé, échec de la validation du token' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Non autorisé, aucun token fourni' });
  }
};

// Version "douce" du middleware protect : ne bloque JAMAIS la requête.
// Si un token valide est fourni, req.user est peuplé (comme protect).
// Sinon (pas de token, token invalide, utilisateur supprimé), req.user reste undefined
// et la requête continue normalement. Utile pour les routes publiques qui doivent
// quand même savoir "qui" fait la requête pour adapter la réponse (ex: getCourseById).
const optionalAuth = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
    } catch (error) {
      // Token invalide/expiré : on ignore silencieusement, req.user reste undefined
      req.user = undefined;
    }
  }

  next();
};

// Accorder l'accès à des rôles spécifiques
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Accès refusé pour le rôle : ${req.user ? req.user.role : 'non défini'}`,
      });
    }
    next();
  };
};

module.exports = { protect, optionalAuth, authorize };