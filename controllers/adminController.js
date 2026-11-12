const User = require('../models/User');
const Course = require('../models/Course');
const Subscription = require('../models/Subscription');
const QuizResult = require('../models/QuizResult');
const Review = require('../models/Review');
const Discussion = require('../models/Discussion');

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
    ] = await Promise.all([
      User.find({}, 'name email role isActive avatar createdAt').sort({ createdAt: -1 }).lean(),
      Course.countDocuments(),
      Course.countDocuments({ $or: [{ isFree: true }, { price: 0 }] }),
      Subscription.find()
        .populate('student', 'name email avatar')
        .populate('course', 'title subject level price')
        .sort({ createdAt: -1 })
        .lean(),
      QuizResult.countDocuments(),
      Review.countDocuments(),
      Discussion.countDocuments(),
    ]);

    const usersByRole = {
      student: users.filter((u) => u.role === 'student').length,
      teacher: users.filter((u) => u.role === 'teacher').length,
      admin: users.filter((u) => u.role === 'admin').length,
      total: users.length,
    };

    const activeSubscriptions = subscriptions.filter(
      (s) => s.status === 'active' && new Date(s.expiresAt) > now
    );

    const totalRevenue = subscriptions.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const revenueByMethod = subscriptions.reduce((acc, s) => {
      const method = s.paymentMethod || 'Autre';
      acc[method] = (acc[method] || 0) + (Number(s.amount) || 0);
      return acc;
    }, {});

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
        },
        totalRevenue,
        revenueByMethod,
        quizResultsCount,
        reviewsCount,
        discussionsCount,
      },
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
      if (isSelf && req.body.isActive === false) {
        return res.status(400).json({
          message: 'Vous ne pouvez pas désactiver votre propre compte administrateur.',
        });
      }
      user.isActive = Boolean(req.body.isActive);
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

module.exports = {
  getAdminOverview,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  getAllSubscriptions,
  grantSubscription,
  updateSubscription,
  deleteSubscription,
  getAllReviews,
  deleteReview,
  assignCourseTeacher,
};
