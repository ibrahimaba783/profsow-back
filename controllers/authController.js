const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');
const { OAuth2Client } = require('google-auth-library');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Générer le Token JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @desc    Créer un compte utilisateur (Étudiant public)
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Veuillez remplir tous les champs obligatoires' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const userExists = await User.findOne({ email: normalizedEmail });

    if (userExists) {
      return res.status(400).json({ message: 'Cet email est déjà associé à un compte' });
    }

    // Le rôle est forcé à 'student' pour toute inscription publique
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: 'student',
    });

    if (user) {
      const frontendUrl = process.env.FRONTEND_URL || 'https://profsow-front.vercel.app';
      const subject = 'Bienvenue sur la plateforme e-learning de M. Aliou Sow !';
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #00897b; border-radius: 10px; background-color: #fcfcfc;">
          <h2 style="color: #00897b; text-align: center; border-bottom: 2px solid #00897b; padding-bottom: 10px;">Bienvenue sur Aliou Sow Academy !</h2>
          <p>Bonjour <strong>${user.name}</strong>,</p>
          <p>Nous sommes ravis de vous accueillir sur notre plateforme éducative dédiée aux Mathématiques et à la Physique-Chimie.</p>
          <p>Rappel de vos identifiants :</p>
          <table style="width: 100%; background-color: #f3f4f6; border-radius: 5px; padding: 10px; margin: 15px 0;">
            <tr><td><strong>Email :</strong></td><td>${user.email}</td></tr>
            <tr><td><strong>Rôle :</strong></td><td>Étudiant</td></tr>
          </table>
          <div style="text-align: center; margin: 25px 0;">
            <a href="${frontendUrl}/login" style="background-color: #ff9800; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Accéder à mon espace</a>
          </div>
        </div>
      `;

      sendEmail({ email: user.email, subject, html }).catch((err) => {
        console.error("Erreur d'envoi d'e-mail de bienvenue :", err.message);
      });

      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        bio: user.bio,
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: 'Données utilisateur invalides' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Authentification utilisateur & récupération du token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Veuillez saisir votre email et votre mot de passe' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select('+password');

    if (user && (await user.matchPassword(password))) {
      // Sécurité : garantir que le compte principal (aliou@gmail.com) reste admin
      if (normalizedEmail === 'aliou@gmail.com' && user.role !== 'admin') {
        user.role = 'admin';
        await user.save({ validateBeforeSave: false });
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
      res.status(404).json({ message: 'Utilisateur introuvable' });
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
      user.name = req.body.name || user.name;
      user.bio = req.body.bio !== undefined ? req.body.bio : user.bio;

      if (req.body.subjects) {
        user.subjects = Array.isArray(req.body.subjects)
          ? req.body.subjects
          : req.body.subjects.split(',').map((s) => s.trim());
      }
      if (req.body.levels) {
        user.levels = Array.isArray(req.body.levels)
          ? req.body.levels
          : req.body.levels.split(',').map((l) => l.trim());
      }

      if (req.file) {
        user.avatar = req.file.path;
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
      res.status(404).json({ message: 'Utilisateur introuvable' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Demander la réinitialisation du mot de passe
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const genericResponse = {
      message: 'Si un compte existe avec cette adresse email, un lien de réinitialisation vous a été envoyé.',
    };

    if (!email) {
      return res.status(400).json({ message: 'Veuillez renseigner votre adresse e-mail' });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return res.status(200).json(genericResponse);
    }

    const resetToken = user.getResetPasswordToken();
    await user.save({ validateBeforeSave: false });

    const frontendUrl = process.env.FRONTEND_URL || 'https://profsow-front.vercel.app';
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #00897b; border-radius: 10px; background-color: #fcfcfc;">
        <h2 style="color: #00897b; text-align: center; border-bottom: 2px solid #00897b; padding-bottom: 10px;">Réinitialisation de votre mot de passe</h2>
        <p>Bonjour <strong>${user.name}</strong>,</p>
        <p>Vous avez demandé la réinitialisation de votre mot de passe sur Aliou Sow Academy. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe. Ce lien est valable <strong>30 minutes</strong>.</p>
        <div style="text-align: center; margin: 25px 0;">
          <a href="${resetUrl}" style="background-color: #ff9800; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Réinitialiser mon mot de passe</a>
        </div>
      </div>
    `;

    try {
      await sendEmail({
        email: user.email,
        subject: 'Réinitialisation de votre mot de passe - Aliou Sow Academy',
        html,
      });
    } catch (err) {
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

// @desc    Réinitialiser le mot de passe
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

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.status(200).json({ message: 'Mot de passe réinitialisé avec succès' });
  } catch (error) {
    res.status(500).json({ message: error.message });
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

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const { email, name, picture, email_verified } = ticket.getPayload();

    if (!email || !email_verified) {
      return res.status(400).json({ message: 'Email Google non vérifié' });
    }

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name: name || email.split('@')[0],
        email,
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
    res.status(401).json({ message: 'Connexion Google invalide' });
  }
};

// =========================================================================
// GESTION DES UTILISATEURS RBAC (ADMIN SEULEMENT)
// =========================================================================

// @desc    Obtenir la liste de tous les utilisateurs (élèves, profs, admins)
// @route   GET /api/auth/users
// @access  Private/Admin
const getAllUsers = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'Accès refusé. Seul un administrateur peut gérer les utilisateurs.',
      });
    }

    const { role, q } = req.query;
    const filter = {};

    if (role && ['student', 'teacher', 'admin'].includes(role)) {
      filter.role = role;
    }

    if (q && q.trim()) {
      filter.$or = [
        { name: { $regex: q.trim(), $options: 'i' } },
        { email: { $regex: q.trim(), $options: 'i' } },
      ];
    }

    const users = await User.find(filter)
      .select('name email role avatar bio subjects levels createdAt')
      .sort({ createdAt: -1 });

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Créer un utilisateur par l'administrateur (élève, prof ou admin)
// @route   POST /api/auth/users
// @access  Private/Admin
const createUserByAdmin = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'Accès refusé. Seul un administrateur peut créer des comptes avec rôle.',
      });
    }

    const { name, email, password, role, subjects, levels, bio } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Nom, email et mot de passe sont obligatoires' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({ message: 'Cet email est déjà utilisé' });
    }

    const chosenRole = ['student', 'teacher', 'admin'].includes(role) ? role : 'student';

    const newUser = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: chosenRole,
      bio: bio || '',
      subjects: subjects || ['Mathématiques', 'Physique-Chimie'],
      levels: levels || ['4ème', '3ème', '2nde S', '1ère S', 'TS'],
    });

    res.status(201).json({
      _id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      avatar: newUser.avatar,
      bio: newUser.bio,
      createdAt: newUser.createdAt,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Changer le rôle d'un utilisateur (ADMIN SEULEMENT)
// @route   PUT /api/auth/users/:id/role
// @access  Private/Admin
const updateUserRole = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'Accès refusé. Seul un administrateur peut changer les rôles.',
      });
    }

    const { role } = req.body;
    if (!['student', 'teacher', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Rôle invalide (valeurs possibles : student, teacher, admin)' });
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    // Sécurité : interdire à l'administrateur de rétrograder son propre compte
    if (targetUser._id.toString() === req.user._id.toString() && role !== 'admin') {
      return res.status(400).json({
        message: 'Impossible de rétrograder votre propre compte administrateur.',
      });
    }

    targetUser.role = role;
    await targetUser.save({ validateBeforeSave: false });

    res.json({
      _id: targetUser._id,
      name: targetUser.name,
      email: targetUser.email,
      role: targetUser.role,
      message: `Rôle mis à jour avec succès : ${role}`,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Supprimer un utilisateur par l'administrateur
// @route   DELETE /api/auth/users/:id
// @access  Private/Admin
const deleteUserByAdmin = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'Accès refusé. Seul un administrateur peut supprimer un compte.',
      });
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    // Sécurité : interdire la suppression de son propre compte
    if (targetUser._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Vous ne pouvez pas supprimer votre propre compte.' });
    }

    await targetUser.deleteOne();
    res.json({ message: 'Compte utilisateur supprimé avec succès' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Obtenir la liste des professeurs disponibles pour l'assignation de modules
// @route   GET /api/auth/teachers
// @access  Private (Admin / Teacher)
const getTeachersList = async (req, res) => {
  try {
    const teachers = await User.find({ role: { $in: ['teacher', 'admin'] } })
      .select('name email avatar bio role')
      .sort({ name: 1 });

    res.json(teachers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Anciennes routes de compatibilité
const getAllStudents = async (req, res) => {
  try {
    const students = await User.find({ role: 'student' })
      .select('name email avatar bio createdAt')
      .sort({ createdAt: -1 });

    res.json(students);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteStudent = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Seul un administrateur peut supprimer un élève.' });
    }
    const student = await User.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'Étudiant introuvable' });
    if (student.role !== 'student') return res.status(403).json({ message: 'Ce compte n’est pas un élève.' });

    await student.deleteOne();
    res.json({ message: 'Étudiant supprimé avec succès' });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
  getAllUsers,
  createUserByAdmin,
  updateUserRole,
  deleteUserByAdmin,
  getTeachersList,
  getAllStudents,
  deleteStudent,
};
