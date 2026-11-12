const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');
const { OAuth2Client } = require('google-auth-library');

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  process.env.VITE_GOOGLE_CLIENT_ID ||
  '176049300703-gc9oe1mq2pqoc2ei59042sc0qqnfchlj.apps.googleusercontent.com';

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '');

const findUserByEmail = (email, withPassword = false) => {
  const clean = normalizeEmail(email);
  if (!clean) return Promise.resolve(null);
  const query = User.findOne({ email: { $regex: `^${escapeRegex(clean)}$`, $options: 'i' } });
  return withPassword ? query.select('+password') : query;
};

const getFrontendUrl = (req) => {
  const origin = req?.headers?.origin;
  if (origin && /^https?:\/\/(localhost:\d+|127\.0\.0\.1:\d+|profsow-front(?:-[a-z0-9-]+)?\.vercel\.app)$/i.test(origin)) {
    return origin.replace(/\/+$/, '');
  }
  const envUrl = (process.env.FRONTEND_URL || '').split(',')[0].trim().replace(/\/+$/, '');
  if (envUrl && !envUrl.includes('localhost')) {
    return envUrl;
  }
  return 'https://profsow-front.vercel.app';
};

// Générer le Token JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @desc    Créer un compte utilisateur (Étudiant)
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const cleanName = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const cleanEmail = normalizeEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!cleanName || !cleanEmail || !password) {
      return res.status(400).json({ message: 'Veuillez remplir tous les champs obligatoires.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 6 caractères.' });
    }

    const userExists = await findUserByEmail(cleanEmail);

    if (userExists) {
      return res.status(400).json({ message: 'Un compte existe déjà avec cet email.' });
    }

    // SÉCURITÉ : l'inscription publique ne crée JAMAIS de compte enseignant,
    // quelle que soit la valeur envoyée par le client. Le rôle est forcé
    // côté serveur pour empêcher qu'une requête API directe (Postman, etc.)
    // ne s'auto-attribue le rôle "teacher". Le compte professeur (unique,
    // M. Aliou Sow) est créé séparément via le script scripts/createTeacher.js.
    const user = await User.create({
      name: cleanName,
      email: cleanEmail,
      password,
      role: 'student',
    });

    if (user) {
      // Envoyer un e-mail de bienvenue
      const subject = 'Bienvenue sur Aliou Sow Academy !';
      const roleText = user.role === 'teacher' ? 'Enseignant' : 'Étudiant';
      const frontendUrl = getFrontendUrl(req);
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #009688; border-radius: 10px; background-color: #fcfcfc;">
          <h2 style="color: #009688; text-align: center; border-bottom: 2px solid #009688; padding-bottom: 10px;">Bienvenue sur Aliou Sow Academy !</h2>
          <p>Bonjour <strong>${user.name}</strong>,</p>
          <p>Nous sommes ravis de vous accueillir en tant qu'<strong>${roleText}</strong> sur notre plateforme éducative dédiée aux matières scientifiques (Mathématiques, Physique-Chimie).</p>
          <p>Grâce à cette plateforme, vous pouvez :</p>
          <ul>
            <li>Accéder à des cours structurés de la 4ème à la Terminale S.</li>
            <li>Télécharger des supports de cours (PDF), regarder les leçons en vidéo et suivre les directs.</li>
            <li>Tester vos connaissances grâce à des quiz interactifs corrigés.</li>
          </ul>
          <table style="width: 100%; background-color: #f3f4f6; border-radius: 5px; padding: 10px; margin: 15px 0;">
            <tr><td><strong>Email :</strong></td><td>${user.email}</td></tr>
            <tr><td><strong>Rôle :</strong></td><td>${roleText}</td></tr>
          </table>
          <div style="text-align: center; margin: 25px 0;">
            <a href="${frontendUrl}/login" style="background-color: #009688; color: white; padding: 12px 25px; text-decoration: none; border-radius: 999px; font-weight: bold; display: inline-block;">Accéder à mon espace</a>
          </div>
          <hr style="border: 0; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 11px; color: #6b7280; text-align: center;">Ce message a été envoyé automatiquement. Veuillez ne pas y répondre directement.</p>
        </div>
      `;

      let emailStatus = 'sent';
      let previewUrl = '';
      try {
        const mailInfo = await sendEmail({ email: user.email, subject, html });
        if (mailInfo && mailInfo.previewUrl) {
          previewUrl = mailInfo.previewUrl;
        }
      } catch (err) {
        console.error("Erreur d'envoi d'e-mail :", err.message);
        emailStatus = 'failed';
      }

      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        bio: user.bio,
        token: generateToken(user._id),
        emailStatus,
        emailPreviewUrl: previewUrl,
      });
    } else {
      res.status(400).json({ message: 'Données utilisateur invalides' });
    }
  } catch (error) {
    console.error('ERREUR REGISTER :', error);
    const status = error.name === 'ValidationError' || error.code === 11000 ? 400 : 500;
    const message = error.code === 11000 ? 'Un compte existe déjà avec cet email.' : error.message;
    res.status(status).json({ message });
  }
};

// @desc    Authentification utilisateur & récupération du token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const cleanEmail = normalizeEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!cleanEmail || !password) {
      return res.status(400).json({ message: 'Veuillez saisir votre email et votre mot de passe.' });
    }

    const user = await findUserByEmail(cleanEmail, true);

    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        bio: user.bio,
        subjects: user.subjects,
        levels: user.levels,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Obtenir le profil de l'utilisateur connecté
// @route   GET /api/auth/profile
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        bio: user.bio,
        subjects: user.subjects,
        levels: user.levels,
      });
    } else {
      res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mettre à jour le profil utilisateur
// @route   PUT /api/auth/profile
// @access  Private
const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      user.name = req.body.name ? req.body.name.trim() : user.name;
      if (req.body.email) {
        user.email = normalizeEmail(req.body.email);
      }
      user.bio = req.body.bio !== undefined ? req.body.bio : user.bio;

      // Si une nouvelle image a été envoyée
      if (req.file) {
        user.avatar = req.file.path; // URL Cloudinary renvoyée par le middleware
      }

      if (user.role === 'teacher') {
        user.subjects = req.body.subjects ? JSON.parse(req.body.subjects) : user.subjects;
        user.levels = req.body.levels ? JSON.parse(req.body.levels) : user.levels;
      }

      if (req.body.password) {
        user.password = req.body.password;
      }

      const updatedUser = await user.save();

      res.json({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        avatar: updatedUser.avatar,
        bio: updatedUser.bio,
        subjects: updatedUser.subjects,
        levels: updatedUser.levels,
        token: generateToken(updatedUser._id),
      });
    } else {
      res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Demander un lien de réinitialisation de mot de passe
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const cleanEmail = normalizeEmail(req.body.email);
    const user = await findUserByEmail(cleanEmail);

    // IMPORTANT : on renvoie toujours le même message, que l'email existe ou
    // non en base, pour éviter l'énumération de comptes.
    const genericResponse = {
      message: "Si un compte existe avec cet email, un lien de réinitialisation vient d'être envoyé.",
    };

    if (!user) {
      return res.status(200).json(genericResponse);
    }

    const resetToken = user.getResetPasswordToken();
    await user.save({ validateBeforeSave: false });

    const frontendUrl = getFrontendUrl(req);
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #009688; border-radius: 10px; background-color: #fcfcfc;">
        <h2 style="color: #009688; text-align: center; border-bottom: 2px solid #009688; padding-bottom: 10px;">Réinitialisation de mot de passe</h2>
        <p>Bonjour <strong>${user.name}</strong>,</p>
        <p>Vous avez demandé la réinitialisation de votre mot de passe sur Aliou Sow Academy. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe. Ce lien est valable <strong>30 minutes</strong>.</p>
        <div style="text-align: center; margin: 25px 0;">
          <a href="${resetUrl}" style="background-color: #009688; color: white; padding: 12px 25px; text-decoration: none; border-radius: 999px; font-weight: bold; display: inline-block;">Réinitialiser mon mot de passe</a>
        </div>
        <p style="font-size: 12px; color: #6b7280;">Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail sans risque : votre mot de passe actuel reste inchangé.</p>
        <hr style="border: 0; border-top: 1px solid #e5e7eb;">
        <p style="font-size: 11px; color: #6b7280; text-align: center;">Ce message a été envoyé automatiquement. Veuillez ne pas y répondre directement.</p>
      </div>
    `;

    try {
      await sendEmail({
        email: user.email,
        subject: 'Réinitialisation de votre mot de passe - Aliou Sow Academy',
        html,
      });
    } catch (err) {
      console.error("Erreur d'envoi de l'e-mail de réinitialisation :", err.message);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });
      return res.status(500).json({ message: "L'e-mail n'a pas pu être envoyé. Réessayez plus tard." });
    }

    res.status(200).json(genericResponse);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Réinitialiser le mot de passe à partir du jeton reçu par e-mail
// @route   PUT /api/auth/reset-password/:token
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 6 caractères' });
    }

    const hashedToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    }).select('+resetPasswordToken +resetPasswordExpire');

    if (!user) {
      return res.status(400).json({ message: 'Ce lien de réinitialisation est invalide ou a expiré' });
    }

    user.password = password; // re-hashé automatiquement par le hook pre('save')
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.status(200).json({ message: 'Mot de passe réinitialisé avec succès' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erreur lors de la réinitialisation du mot de passe' });
  }
};

// @desc    Inscription / connexion avec Google
// @route   POST /api/auth/google
// @access  Public
const googleAuth = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ message: 'Jeton Google manquant' });
    }

    // Vérification du jeton côté serveur
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const { email, name, picture, email_verified } = ticket.getPayload();
    const cleanEmail = normalizeEmail(email);

    if (!cleanEmail || !email_verified) {
      return res.status(400).json({ message: 'Email Google non vérifié' });
    }

    let user = await findUserByEmail(cleanEmail);

    if (!user) {
      // SÉCURITÉ : le rôle est forcé à "student"
      user = await User.create({
        name: name || cleanEmail.split('@')[0],
        email: cleanEmail,
        password: crypto.randomBytes(32).toString('hex'),
        role: 'student',
        ...(picture ? { avatar: picture } : {}),
      });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      bio: user.bio,
      subjects: user.subjects,
      levels: user.levels,
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error('ERREUR GOOGLE AUTH :', error.message);
    res.status(401).json({ message: 'Connexion Google invalide' });
  }
};

module.exports = {
  registerUser,
  loginUser,
  googleAuth,
  getUserProfile,
  updateUserProfile,
  forgotPassword,
  resetPassword,
};
