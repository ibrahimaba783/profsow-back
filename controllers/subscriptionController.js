const Subscription = require('../models/Subscription');
const Course = require('../models/Course');
const sendEmail = require('../utils/sendEmail');

// @desc    Créer un abonnement (Simulation de paiement Wave / Orange Money)
// @route   POST /api/subscriptions
// @access  Private
const createSubscription = async (req, res) => {
  try {
    const { courseId, paymentMethod, transactionId, amount } = req.body;

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 12); // Valable 1 an

    const subscription = await Subscription.create({
      student: req.user._id,
      course: courseId,
      paymentMethod: paymentMethod || 'Wave',
      transactionId: transactionId || `TX-${Date.now()}`,
      amount: amount || course.price,
      expiresAt,
      status: 'active',
    });

    res.status(201).json(subscription);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Activer l'accès à un cours gratuit (Offre promotionnelle)
// @route   POST /api/subscriptions/enroll-free/:courseId
// @access  Private/Student
const enrollFreeCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    const courseIsFree = course.isFree || course.price === 0;
    if (!courseIsFree) {
      return res.status(400).json({ message: "Ce cours n'est pas proposé gratuitement" });
    }

    const existingSub = await Subscription.findOne({
      student: req.user._id,
      course: course._id,
      status: 'active',
      expiresAt: { $gt: new Date() },
    });

    if (existingSub) {
      return res.status(400).json({ message: 'Vous avez déjà accès à ce cours' });
    }

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 12);

    const subscription = await Subscription.create({
      student: req.user._id,
      course: course._id,
      paymentMethod: 'Gratuit (Promotion)',
      transactionId: `FREE-${Date.now()}`,
      amount: 0,
      expiresAt,
      status: 'active',
    });

    try {
      const subject = `Accès activé - Cours gratuit : ${course.title}`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #00897b; border-radius: 10px; background-color: #ffffff;">
          <h2 style="color: #00897b; text-align: center;">Accès activé !</h2>
          <p>Bonjour <strong>${req.user.name}</strong>,</p>
          <p>Vous avez maintenant accès gratuitement au cours <strong>${course.title}</strong> (${course.subject} - ${course.level}).</p>
          <p>Profitez-en pour explorer tous les chapitres, vidéos et documents disponibles.</p>
        </div>
      `;
      await sendEmail({ email: req.user.email, subject, html });
    } catch (err) {
      console.error("Erreur d'envoi d'e-mail d'inscription gratuite :", err);
    }

    res.status(201).json({ subscription });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Obtenir les abonnements de l'étudiant connecté
// @route   GET /api/subscriptions/my
// @access  Private
const getMySubscriptions = async (req, res) => {
  try {
    const subscriptions = await Subscription.find({ student: req.user._id })
      .populate({
        path: 'course',
        populate: { path: 'teacher', select: 'name email avatar' },
      });
    res.json(subscriptions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Vérifier le statut d'abonnement d'un étudiant pour un cours spécifique
// @route   GET /api/subscriptions/check/:courseId
// @access  Private
const checkSubscriptionStatus = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({
      student: req.user._id,
      course: req.params.courseId,
      status: 'active',
      expiresAt: { $gt: new Date() },
    });

    res.json({ isSubscribed: !!subscription, subscription });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Obtenir les élèves inscrits
//          - Admin : voit tous les élèves inscrits
//          - Teacher : voit UNIQUEMENT les élèves inscrits à ses modules assignés
// @route   GET /api/subscriptions/teacher/students
// @access  Private (Admin / Teacher)
const getTeacherStudents = async (req, res) => {
  try {
    let query = {};

    if (req.user.role === 'teacher') {
      const teacherCourses = await Course.find({ teacher: req.user._id }).select('_id');
      const courseIds = teacherCourses.map((c) => c._id);
      query = { course: { $in: courseIds } };
    }

    const subscriptions = await Subscription.find(query)
      .populate('student', 'name email avatar bio createdAt')
      .populate('course', 'title subject level')
      .sort({ createdAt: -1 });

    // Si l'utilisateur est un prof (non-admin), on ne divulgue pas les informations financières
    const sanitized = subscriptions.map((sub) => {
      const obj = sub.toObject();
      if (req.user.role === 'teacher') {
        delete obj.amount;
        delete obj.transactionId;
        delete obj.paymentMethod;
      }
      return obj;
    });

    res.json(sanitized);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Obtenir tous les abonnements & statistiques financières (ADMIN SEULEMENT)
// @route   GET /api/subscriptions/admin/all
// @access  Private/Admin
const getAllSubscriptionsAdmin = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'Accès refusé. Seul un administrateur peut accéder aux abonnements et paiements.',
      });
    }

    const subscriptions = await Subscription.find()
      .populate('student', 'name email avatar')
      .populate({
        path: 'course',
        select: 'title subject level price isFree teacher',
        populate: { path: 'teacher', select: 'name email' },
      })
      .sort({ createdAt: -1 });

    const totalRevenue = subscriptions.reduce((sum, s) => sum + (s.amount || 0), 0);
    const activeCount = subscriptions.filter(
      (s) => s.status === 'active' && new Date(s.expiresAt) > new Date()
    ).length;
    const freeCount = subscriptions.filter((s) => s.amount === 0).length;

    res.json({
      stats: {
        totalRevenue,
        totalSubscriptions: subscriptions.length,
        activeSubscriptions: activeCount,
        freeSubscriptions: freeCount,
      },
      subscriptions,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mettre à jour le statut d'un abonnement ou le renouveler (ADMIN SEULEMENT)
// @route   PATCH /api/subscriptions/admin/:id/status
// @access  Private/Admin
const updateSubscriptionStatusAdmin = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'Accès refusé. Seul un administrateur peut modifier un abonnement.',
      });
    }

    const { status, extendMonths } = req.body;
    const subscription = await Subscription.findById(req.params.id);

    if (!subscription) {
      return res.status(404).json({ message: 'Abonnement non trouvé' });
    }

    if (status) {
      subscription.status = status;
    }

    if (extendMonths && parseInt(extendMonths, 10) > 0) {
      const currentExpiry = new Date(subscription.expiresAt);
      const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
      baseDate.setMonth(baseDate.getMonth() + parseInt(extendMonths, 10));
      subscription.expiresAt = baseDate;
      subscription.status = 'active';
    }

    await subscription.save();

    const populated = await Subscription.findById(subscription._id)
      .populate('student', 'name email avatar')
      .populate('course', 'title subject level price');

    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createSubscription,
  enrollFreeCourse,
  getMySubscriptions,
  checkSubscriptionStatus,
  getTeacherStudents,
  getAllSubscriptionsAdmin,
  updateSubscriptionStatusAdmin,
};
