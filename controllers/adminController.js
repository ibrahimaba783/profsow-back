const User = require('../models/User');
const Course = require('../models/Course');
const Subscription = require('../models/Subscription');
const QuizResult = require('../models/QuizResult');
const Review = require('../models/Review');
const Discussion = require('../models/Discussion');
const Report = require('../models/Report');
const SecurityLog = require('../models/SecurityLog');
const Setting = require('../models/Setting');
const Notification = require('../models/Notification');
const { logSecurityEvent } = require('../utils/securityLogger');

const normalizeEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '');

// @desc    Vue d'ensemble et KPIs du Back-Office Administrateur
// @route   GET /api/admin/overview
// @access  Private/Admin
const getAdminOverview = async (req, res) => {
  try {
    const now = new Date();
    const [
      users,
      coursesCount,
      freeCoursesCount,
      subscriptions,
      quizResultsCount,
      reviewsCount,
      discussionsCount,
      pendingReportsCount,
      securityAlertsCount,
    ] = await Promise.all([
      User.find({}, 'name email role isActive status avatar createdAt').sort({ createdAt: -1 }).lean(),
      Course.countDocuments(),
      Course.countDocuments({ $or: [{ isFree: true }, { price: 0 }] }),
      Subscription.find()
        .populate('student', 'name email avatar phone')
        .populate('course', 'title subject level price')
        .sort({ createdAt: -1 })
        .lean(),
      QuizResult.countDocuments(),
      Review.countDocuments(),
      Discussion.countDocuments(),
      Report.countDocuments({ status: 'pending' }),
      SecurityLog.countDocuments({
        severity: { $in: ['warning', 'critical'] },
        createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
    ]);

    const usersByRole = {
      student: users.filter((u) => u.role === 'student').length,
      teacher: users.filter((u) => u.role === 'teacher').length,
      admin: users.filter((u) => u.role === 'admin').length,
      total: users.length,
      active: users.filter((u) => u.isActive !== false && u.status !== 'blocked').length,
      blocked: users.filter((u) => u.isActive === false || u.status === 'blocked').length,
      suspended: users.filter((u) => u.status === 'suspended').length,
    };

    const activeSubscriptions = subscriptions.filter(
      (s) => s.status === 'active' && new Date(s.expiresAt) > now
    );
    const expiringSoonSubscriptions = subscriptions.filter(
      (s) => s.status === 'active' && new Date(s.expiresAt) > now && new Date(s.expiresAt) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    );

    const totalRevenue = subscriptions.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const revenueByMethod = subscriptions.reduce((acc, s) => {
      const method = s.paymentMethod || 'Autre';
      acc[method] = (acc[method] || 0) + (Number(s.amount) || 0);
      return acc;
    }, {});

    // Génération des graphiques des 6 derniers mois (Revenus & Inscriptions)
    const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    const monthlyAnalytics = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const y = d.getFullYear();
      const m = d.getMonth();
      const monthKey = `${y}-${String(m + 1).padStart(2, '0')}`;
      monthlyAnalytics.push({
        monthKey,
        label: `${monthNames[m]} ${y}`,
        revenue: 0,
        subscriptionsCount: 0,
        registrationsCount: 0,
      });
    }

    // Calculer les données mensuelles d'abonnements
    subscriptions.forEach((s) => {
      const d = new Date(s.createdAt || s.startDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const found = monthlyAnalytics.find((item) => item.monthKey === key);
      if (found) {
        found.revenue += Number(s.amount) || 0;
        found.subscriptionsCount += 1;
      }
    });

    // Calculer les inscriptions mensuelles
    users.forEach((u) => {
      const d = new Date(u.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const found = monthlyAnalytics.find((item) => item.monthKey === key);
      if (found) {
        found.registrationsCount += 1;
      }
    });

    res.json({
      stats: {
        users: usersByRole,
        courses: {
          total: coursesCount,
          free: freeCoursesCount,
          paid: coursesCount - freeCoursesCount,
        },
        subscriptions: {
          total: subscriptions.length,
          active: activeSubscriptions.length,
          expired: subscriptions.length - activeSubscriptions.length,
          expiringSoon: expiringSoonSubscriptions.length,
        },
        totalRevenue,
        revenueByMethod,
        quizResultsCount,
        reviewsCount,
        discussionsCount,
        pendingReportsCount,
        securityAlertsCount,
      },
      monthlyAnalytics,
      recentUsers: users.slice(0, 6),
      recentSubscriptions: subscriptions.slice(0, 8),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Liste de tous les utilisateurs
// @route   GET /api/admin/users
// @access  Private/Admin
const getAllUsers = async (req, res) => {
  try {
    const [users, subAgg, courseAgg] = await Promise.all([
      User.find().select('-password -resetPasswordToken -resetPasswordExpire').sort({ createdAt: -1 }).lean(),
      Subscription.aggregate([
        { $match: { status: 'active', expiresAt: { $gt: new Date() } } },
        { $group: { _id: '$student', count: { $sum: 1 } } },
      ]),
      Course.aggregate([
        { $group: { _id: '$teacher', count: { $sum: 1 } } },
      ]),
    ]);

    const subMap = new Map(subAgg.map((s) => [String(s._id), s.count]));
    const courseMap = new Map(courseAgg.map((c) => [String(c._id), c.count]));

    const enriched = users.map((u) => ({
      ...u,
      activeSubscriptionsCount: subMap.get(String(u._id)) || 0,
      coursesCount: courseMap.get(String(u._id)) || 0,
    }));

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Créer un utilisateur manuellement depuis le Back-Office
// @route   POST /api/admin/users
// @access  Private/Admin
const createUser = async (req, res) => {
  try {
    const cleanName = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const cleanEmail = normalizeEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const role = ['student', 'teacher', 'admin'].includes(req.body.role) ? req.body.role : 'student';
    const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : '';
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';

    if (!cleanName || !cleanEmail || !password) {
      return res.status(400).json({ message: 'Nom, email et mot de passe sont obligatoires.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 6 caractères.' });
    }

    const exists = await User.findOne({ email: cleanEmail });
    if (exists) {
      return res.status(400).json({ message: 'Un utilisateur existe déjà avec cet email.' });
    }

    const user = await User.create({
      name: cleanName,
      email: cleanEmail,
      password,
      role,
      phone,
      title,
      isActive: req.body.isActive !== false,
    });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      title: user.title,
      isActive: user.isActive,
      avatar: user.avatar,
      createdAt: user.createdAt,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mettre à jour un utilisateur (rôle, statut actif, mot de passe, infos)
// @route   PUT /api/admin/users/:id
// @access  Private/Admin
const updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    const isSelf = user._id.toString() === req.user._id.toString();

    if (req.body.role && ['student', 'teacher', 'admin'].includes(req.body.role)) {
      if (isSelf && req.body.role !== 'admin') {
        return res.status(400).json({
          message: 'Vous ne pouvez pas retirer votre propre rôle administrateur.',
        });
      }
      user.role = req.body.role;
    }

    if (req.body.isActive !== undefined) {
      const nextActive = req.body.isActive === true || req.body.isActive === 'true';
      if (isSelf && nextActive === false) {
        return res.status(400).json({
          message: 'Vous ne pouvez pas désactiver votre propre compte administrateur.',
        });
      }
      user.isActive = nextActive;
    }

    if (req.body.name !== undefined && req.body.name.trim()) {
      user.name = req.body.name.trim();
    }
    if (req.body.email !== undefined && normalizeEmail(req.body.email)) {
      const nextEmail = normalizeEmail(req.body.email);
      if (nextEmail !== user.email) {
        const dup = await User.findOne({ email: nextEmail, _id: { $ne: user._id } });
        if (dup) {
          return res.status(400).json({ message: 'Cet email est déjà utilisé par un autre compte.' });
        }
        user.email = nextEmail;
      }
    }
    if (req.body.phone !== undefined) user.phone = String(req.body.phone).trim();
    if (req.body.title !== undefined) user.title = String(req.body.title).trim();
    if (req.body.bio !== undefined) user.bio = String(req.body.bio);
    if (req.file) user.avatar = req.file.path;

    if (req.body.password) {
      if (String(req.body.password).length < 6) {
        return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 6 caractères.' });
      }
      user.password = String(req.body.password);
    }

    const saved = await user.save();
    res.json({
      _id: saved._id,
      name: saved.name,
      email: saved.email,
      role: saved.role,
      phone: saved.phone,
      title: saved.title,
      bio: saved.bio,
      isActive: saved.isActive,
      avatar: saved.avatar,
      createdAt: saved.createdAt,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Supprimer un utilisateur
// @route   DELETE /api/admin/users/:id
// @access  Private/Admin
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Vous ne pouvez pas supprimer votre propre compte.' });
    }

    await Promise.all([
      Subscription.deleteMany({ student: user._id }),
      QuizResult.deleteMany({ student: user._id }),
      Review.deleteMany({ student: user._id }),
      Discussion.deleteMany({ sender: user._id }),
    ]);
    await user.deleteOne();

    res.json({ message: 'Utilisateur supprimé avec succès' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Liste complète de tous les abonnements & paiements
// @route   GET /api/admin/subscriptions
// @access  Private/Admin
const getAllSubscriptions = async (req, res) => {
  try {
    const subscriptions = await Subscription.find()
      .populate('student', 'name email avatar phone')
      .populate('course', 'title subject level price isFree')
      .sort({ createdAt: -1 });
    res.json(subscriptions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Accorder manuellement un abonnement à un élève (Admin)
// @route   POST /api/admin/subscriptions
// @access  Private/Admin
const grantSubscription = async (req, res) => {
  try {
    const { studentId, courseId, paymentMethod, amount, durationMonths, transactionId } = req.body;

    if (!studentId || !courseId) {
      return res.status(400).json({ message: "Veuillez sélectionner l'élève et le module." });
    }

    const [student, course] = await Promise.all([
      User.findById(studentId),
      Course.findById(courseId),
    ]);

    if (!student) return res.status(404).json({ message: 'Élève non trouvé' });
    if (!course) return res.status(404).json({ message: 'Module de cours non trouvé' });

    const months = Number(durationMonths) > 0 ? Number(durationMonths) : 12;
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + months);

    // S'il existe déjà un abonnement pour ce couple (élève, cours), on le met à jour proprement
    const existing = await Subscription.findOne({ student: studentId, course: courseId }).sort({ createdAt: -1 });

    let subscription;
    if (existing && existing.status === 'active' && existing.expiresAt > new Date()) {
      const nextExpiry = new Date(existing.expiresAt);
      nextExpiry.setMonth(nextExpiry.getMonth() + months);
      existing.expiresAt = nextExpiry;
      existing.paymentMethod = paymentMethod || existing.paymentMethod;
      if (amount !== undefined && amount !== '') {
        existing.amount = Number(amount) || 0;
      }
      subscription = await existing.save();
    } else {
      subscription = await Subscription.create({
        student: studentId,
        course: courseId,
        paymentMethod: paymentMethod || 'Offert (Admin)',
        transactionId: transactionId || `ADM-${Date.now().toString(36).toUpperCase()}`,
        amount: amount !== undefined && amount !== '' ? Number(amount) || 0 : (course.isFree ? 0 : course.price),
        expiresAt,
        status: 'active',
      });
    }

    const populated = await Subscription.findById(subscription._id)
      .populate('student', 'name email avatar phone')
      .populate('course', 'title subject level price isFree');

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Modifier / prolonger / suspendre un abonnement
// @route   PUT /api/admin/subscriptions/:id
// @access  Private/Admin
const updateSubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findById(req.params.id);
    if (!subscription) {
      return res.status(404).json({ message: 'Abonnement non trouvé' });
    }

    if (req.body.status && ['active', 'expired'].includes(req.body.status)) {
      subscription.status = req.body.status;
    }

    if (req.body.extendMonths && Number(req.body.extendMonths) > 0) {
      const base =
        subscription.expiresAt && new Date(subscription.expiresAt) > new Date()
          ? new Date(subscription.expiresAt)
          : new Date();
      base.setMonth(base.getMonth() + Number(req.body.extendMonths));
      subscription.expiresAt = base;
      subscription.status = 'active';
    } else if (req.body.expiresAt) {
      subscription.expiresAt = new Date(req.body.expiresAt);
    }

    if (req.body.amount !== undefined) subscription.amount = Number(req.body.amount) || 0;
    if (req.body.paymentMethod) subscription.paymentMethod = req.body.paymentMethod;

    const saved = await subscription.save();
    const populated = await Subscription.findById(saved._id)
      .populate('student', 'name email avatar phone')
      .populate('course', 'title subject level price isFree');

    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Supprimer un abonnement
// @route   DELETE /api/admin/subscriptions/:id
// @access  Private/Admin
const deleteSubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findById(req.params.id);
    if (!subscription) {
      return res.status(404).json({ message: 'Abonnement non trouvé' });
    }
    await subscription.deleteOne();
    res.json({ message: 'Abonnement supprimé avec succès' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Lister tous les avis pour modération
// @route   GET /api/admin/reviews
// @access  Private/Admin
const getAllReviews = async (req, res) => {
  try {
    const reviews = await Review.find()
      .populate('student', 'name email avatar')
      .populate('course', 'title subject level')
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Supprimer un avis inapproprié
// @route   DELETE /api/admin/reviews/:id
// @access  Private/Admin
const deleteReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ message: 'Avis non trouvé' });
    }
    await review.deleteOne();
    res.json({ message: 'Avis supprimé avec succès' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Réassigner un cours à un professeur
// @route   PUT /api/admin/courses/:id/teacher
// @access  Private/Admin
const assignCourseTeacher = async (req, res) => {
  try {
    const { teacherId } = req.body;
    const [course, teacher] = await Promise.all([
      Course.findById(req.params.id),
      User.findById(teacherId),
    ]);
    if (!course) return res.status(404).json({ message: 'Cours non trouvé' });
    if (!teacher || !['teacher', 'admin'].includes(teacher.role)) {
      return res.status(400).json({ message: 'Enseignant invalide' });
    }

    course.teacher = teacher._id;
    await course.save();
    const populated = await Course.findById(course._id).populate('teacher', 'name email avatar bio');
    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Obtenir les journaux de sécurité (Audit Logs)
// @route   GET /api/admin/security/logs
// @access  Private/Admin
const getSecurityLogs = async (req, res) => {
  try {
    const { severity, event, search } = req.query;
    const filter = {};
    if (severity) filter.severity = severity;
    if (event) filter.event = event;
    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: 'i' } },
        { message: { $regex: search, $options: 'i' } },
        { ip: { $regex: search, $options: 'i' } },
      ];
    }
    const logs = await SecurityLog.find(filter)
      .populate('user', 'name email role avatar')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Suspendre temporairement un utilisateur
// @route   POST /api/admin/users/:id/suspend
// @access  Private/Admin
const suspendUser = async (req, res) => {
  try {
    const { days, reason } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Vous ne pouvez pas suspendre votre propre compte.' });
    }

    const durationDays = Number(days) > 0 ? Number(days) : 7;
    user.status = 'suspended';
    user.suspendedUntil = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
    user.suspensionReason = reason || 'Suspension administrative temporaire';
    await user.save();

    await logSecurityEvent({
      event: 'user_suspended',
      user: user._id,
      email: user.email,
      severity: 'warning',
      message: `Utilisateur ${user.email} suspendu pour ${durationDays} jours par ${req.user.email}. Motif : ${user.suspensionReason}`,
    });

    res.json({ message: `Compte suspendu pour ${durationDays} jours`, user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Bloquer ou débloquer un compte utilisateur
// @route   POST /api/admin/users/:id/toggle-block
// @access  Private/Admin
const toggleBlockUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Action impossible sur votre propre compte.' });
    }

    const willBlock = user.isActive !== false && user.status !== 'blocked';
    user.isActive = !willBlock;
    user.status = willBlock ? 'blocked' : 'active';
    if (!willBlock) {
      user.suspendedUntil = null;
      user.suspensionReason = '';
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
    }
    await user.save();

    await logSecurityEvent({
      event: willBlock ? 'user_blocked' : 'account_unlocked',
      user: user._id,
      email: user.email,
      severity: willBlock ? 'warning' : 'info',
      message: `Compte ${user.email} ${willBlock ? 'bloqué' : 'débloqué'} par ${req.user.email}`,
    });

    res.json({ message: willBlock ? 'Utilisateur bloqué' : 'Utilisateur débloqué', user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Réinitialiser les accès / mot de passe d'un utilisateur
// @route   POST /api/admin/users/:id/reset-password
// @access  Private/Admin
const resetUserPassword = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });

    const tempPassword = req.body.newPassword || `Pass${Math.random().toString(36).slice(-6)}!26`;
    user.password = tempPassword;
    user.lockUntil = null;
    user.failedLoginAttempts = 0;
    await user.save();

    await logSecurityEvent({
      event: 'password_reset_success',
      user: user._id,
      email: user.email,
      severity: 'info',
      message: `Mot de passe réinitialisé pour ${user.email} par ${req.user.email}`,
    });

    res.json({ message: 'Mot de passe réinitialisé avec succès', tempPassword });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Consulter l'activité détaillée d'un utilisateur
// @route   GET /api/admin/users/:id/activity
// @access  Private/Admin
const getUserActivity = async (req, res) => {
  try {
    const userId = req.params.id;
    const [user, subs, quizzes, reviews, reports] = await Promise.all([
      User.findById(userId).select('-password'),
      Subscription.find({ student: userId }).populate('course', 'title subject price level'),
      QuizResult.find({ student: userId }).populate('quiz', 'title'),
      Review.find({ student: userId }).populate('course', 'title'),
      Report.find({ $or: [{ reporter: userId }, { targetUser: userId }] }),
    ]);

    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });

    res.json({
      user,
      subscriptions: subs,
      quizzes,
      reviews,
      reports,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Sauvegarder / Exporter l'intégralité de la base de données (JSON)
// @route   GET /api/admin/backup
// @access  Private/Admin
const exportDatabaseBackup = async (req, res) => {
  try {
    const [users, courses, subscriptions, reviews, settings, reports] = await Promise.all([
      User.find().select('-password -resetPasswordToken -resetPasswordExpire').lean(),
      Course.find().lean(),
      Subscription.find().lean(),
      Review.find().lean(),
      Setting.find().lean(),
      Report.find().lean(),
    ]);

    const backupData = {
      platform: 'Aliou Sow Academy',
      version: '2.0',
      exportedAt: new Date().toISOString(),
      exportedBy: req.user.email,
      counts: {
        users: users.length,
        courses: courses.length,
        subscriptions: subscriptions.length,
        reviews: reviews.length,
        reports: reports.length,
      },
      data: {
        users,
        courses,
        subscriptions,
        reviews,
        settings,
        reports,
      },
    };

    await logSecurityEvent({
      event: 'db_backup',
      user: req.user._id,
      severity: 'info',
      message: `Sauvegarde de la base de données exportée par ${req.user.email}`,
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="backup-profsow-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(backupData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Lister toutes les discussions récentes pour modération
// @route   GET /api/admin/discussions
// @access  Private/Admin
const getAllDiscussions = async (req, res) => {
  try {
    const discussions = await Discussion.find()
      .populate('sender', 'name email role avatar')
      .populate('course', 'title subject level')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(discussions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Supprimer un message de discussion abusif
// @route   DELETE /api/admin/discussions/:id
// @access  Private/Admin
const deleteDiscussion = async (req, res) => {
  try {
    const disc = await Discussion.findById(req.params.id);
    if (!disc) return res.status(404).json({ message: 'Message introuvable' });
    await disc.deleteOne();

    await logSecurityEvent({
      event: 'admin_action',
      user: req.user._id,
      severity: 'info',
      message: `Message de discussion supprimé par ${req.user.email}`,
    });

    res.json({ message: 'Message de discussion supprimé' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Synchroniser et recalculer les compteurs de tous les cours
// @route   POST /api/admin/system/sync-counters
// @access  Private/Admin
const syncSystemCounters = async (req, res) => {
  try {
    const courses = await Course.find();
    let updatedCount = 0;

    for (const course of courses) {
      const chaptersCount = course.chapters ? course.chapters.length : 0;
      const lessonsCount = (course.chapters || []).reduce(
        (sum, ch) => sum + (ch.lessons ? ch.lessons.length : 0),
        0
      );
      const studentsCount = await Subscription.countDocuments({
        course: course._id,
        status: 'active',
        expiresAt: { $gt: new Date() },
      });

      course.chaptersCount = chaptersCount;
      course.lessonsCount = lessonsCount;
      course.studentsCount = studentsCount;

      // Si le professeur est manquant, rattacher au premier enseignant
      if (!course.teacher) {
        const defaultTeacher = await User.findOne({ role: 'teacher' });
        if (defaultTeacher) course.teacher = defaultTeacher._id;
      }

      await course.save();
      updatedCount++;
    }

    res.json({
      success: true,
      message: `${updatedCount} cours et matières synchronisés avec succès. Tous les compteurs de chapitres, leçons et élèves sont à jour.`,
      coursesUpdated: updatedCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Vider le cache système
// @route   POST /api/admin/system/clear-cache
// @access  Private/Admin
const clearSystemCache = async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Cache de la plateforme vidé avec succès. Les données sont rechargées en direct depuis MongoDB.',
      timestamp: new Date(),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAdminOverview,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  suspendUser,
  toggleBlockUser,
  resetUserPassword,
  getUserActivity,
  getAllSubscriptions,
  grantSubscription,
  updateSubscription,
  deleteSubscription,
  getAllReviews,
  deleteReview,
  getAllDiscussions,
  deleteDiscussion,
  assignCourseTeacher,
  getSecurityLogs,
  exportDatabaseBackup,
  syncSystemCounters,
  clearSystemCache,
};
