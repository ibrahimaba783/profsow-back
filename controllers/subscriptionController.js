const Subscription = require('../models/Subscription');
const Course = require('../models/Course');
const sendEmail = require('../utils/sendEmail');

// @desc    Créer un nouvel abonnement (Simulation Wave / Orange Money)
// @route   POST /api/subscriptions
// @access  Private
const createSubscription = async (req, res) => {
  try {
    const { courseId, paymentMethod, transactionId, amount, durationMonths } = req.body;

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    const existingSub = await Subscription.findOne({
      student: req.user._id,
      course: courseId,
      status: 'active',
      expiresAt: { $gt: new Date() },
    });

    if (existingSub) {
      return res.status(400).json({ message: 'Vous êtes déjà abonné à ce cours' });
    }

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + (durationMonths || 12));

    const subscription = await Subscription.create({
      student: req.user._id,
      course: courseId,
      paymentMethod,
      transactionId,
      amount: amount || course.price,
      expiresAt,
      status: 'active',
    });

    let emailStatus = 'sent';
    let previewUrl = '';
    try {
      const subject = `Confirmation d'abonnement - ${course.title}`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #6366f1; border-radius: 10px; background-color: #ffffff;">
          <h2 style="color: #6366f1; text-align: center;">Paiement Validé &amp; Accès Activé !</h2>
          <p>Bonjour <strong>${req.user.name}</strong>,</p>
          <p>Merci pour votre abonnement au cours <strong>${course.title}</strong> (${course.subject} - ${course.level}).</p>
          <p>Détails de votre transaction :</p>
          <table style="width: 100%; background-color: #f3f4f6; border-radius: 5px; padding: 10px; margin: 15px 0;">
            <tr><td><strong>Méthode de paiement :</strong></td><td>${paymentMethod}</td></tr>
            <tr><td><strong>ID Transaction :</strong></td><td>${transactionId}</td></tr>
            <tr><td><strong>Montant payé :</strong></td><td>${amount || course.price} FCFA</td></tr>
            <tr><td><strong>Date d'expiration :</strong></td><td>${expiresAt.toLocaleDateString('fr-FR')}</td></tr>
          </table>
          <p style="font-size: 13px; color: #4b5563;">Vous avez désormais un accès complet aux vidéos, documents PDF et directs.</p>
          <hr style="border: 0; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 11px; color: #6b7280; text-align: center;">Aliou Sow Academy</p>
        </div>
      `;

      const mailInfo = await sendEmail({
        email: req.user.email,
        subject,
        html,
      });

      if (mailInfo && mailInfo.previewUrl) {
        previewUrl = mailInfo.previewUrl;
      }
    } catch (err) {
      console.error("Erreur d'envoi d'e-mail de paiement :", err.message);
      emailStatus = 'failed';
    }

    res.status(201).json({
      subscription,
      emailStatus,
      emailPreviewUrl: previewUrl,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Inscrire l'étudiant connecté gratuitement à un cours en promotion
// @route   POST /api/subscriptions/enroll-free/:courseId
// @access  Private/Student
const enrollFreeCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    if (!course.isFree && course.price > 0) {
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
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #6366f1; border-radius: 10px; background-color: #ffffff;">
          <h2 style="color: #6366f1; text-align: center;">Accès activé !</h2>
          <p>Bonjour <strong>${req.user.name}</strong>,</p>
          <p>Vous avez maintenant accès gratuitement au cours <strong>${course.title}</strong> (${course.subject} - ${course.level}).</p>
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

// @desc    Obtenir tous les étudiants inscrits (Enseignant / Admin)
// @route   GET /api/subscriptions/teacher/students
// @access  Private/Teacher|Admin
const getTeacherStudents = async (req, res) => {
  try {
    const courses = req.user.role === 'admin'
      ? await Course.find()
      : await Course.find({ teacher: req.user._id });
    const courseIds = courses.map((c) => c._id);

    const subscriptions = await Subscription.find({ course: { $in: courseIds } })
      .populate('student', 'name email avatar bio phone isActive')
      .populate('course', 'title subject level chapters')
      .sort({ createdAt: -1 });

    res.json(subscriptions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Bloquer ou débloquer l'accès d'un élève à un cours
// @route   PUT /api/subscriptions/:id/status
// @access  Private/Teacher|Admin
const toggleSubscriptionStatus = async (req, res) => {
  try {
    const subscription = await Subscription.findById(req.params.id).populate('course', 'teacher title');
    if (!subscription) {
      return res.status(404).json({ message: 'Abonnement non trouvé' });
    }

    const isOwner =
      req.user.role === 'admin' ||
      (subscription.course && subscription.course.teacher.toString() === req.user._id.toString());

    if (!isOwner) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    if (req.body.expiresAt) {
      subscription.expiresAt = new Date(req.body.expiresAt);
      subscription.status = 'active';
    } else if (req.body.extendMonths) {
      const baseDate = new Date(subscription.expiresAt) > new Date() ? new Date(subscription.expiresAt) : new Date();
      baseDate.setMonth(baseDate.getMonth() + Number(req.body.extendMonths));
      subscription.expiresAt = baseDate;
      subscription.status = 'active';
    } else {
      const nextStatus = req.body.status
        ? req.body.status
        : subscription.status === 'active'
        ? 'suspended'
        : 'active';

      if (!['active', 'suspended', 'expired'].includes(nextStatus)) {
        return res.status(400).json({ message: 'Statut invalide' });
      }

      subscription.status = nextStatus;
    }
    await subscription.save();
    await subscription.populate('student', 'name email avatar bio phone isActive');
    await subscription.populate('course', 'title subject level chapters');

    res.json(subscription);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Relancer un élève par e-mail pour un cours
// @route   POST /api/subscriptions/:id/remind
// @access  Private/Teacher|Admin
const remindStudent = async (req, res) => {
  try {
    const subscription = await Subscription.findById(req.params.id)
      .populate('student', 'name email')
      .populate('course', 'title teacher');

    if (!subscription) {
      return res.status(404).json({ message: 'Abonnement non trouvé' });
    }

    const isOwner =
      req.user.role === 'admin' ||
      (subscription.course && subscription.course.teacher.toString() === req.user._id.toString());

    if (!isOwner) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    const studentEmail = subscription.student?.email;
    const studentName = subscription.student?.name || 'Élève';
    const courseTitle = subscription.course?.title || 'votre cours';

    if (!studentEmail) {
      return res.status(400).json({ message: "Cet élève n'a pas d'adresse e-mail enregistrée." });
    }

    const customMsg = (req.body.message || '').trim() ||
      `Votre professeur vous invite à poursuivre vos leçons et exercices sur "${courseTitle}".`;

    let previewUrl = '';
    try {
      const info = await sendEmail({
        email: studentEmail,
        subject: `Message de votre professeur — ${courseTitle}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #009688;border-radius:10px;">
          <h2 style="color:#009688;">Aliou Sow Academy</h2>
          <p>Bonjour <strong>${studentName}</strong>,</p>
          <p>${customMsg}</p>
          <p style="font-size:12px;color:#64748b;">Module : ${courseTitle}</p>
        </div>`,
      });
      if (info && info.previewUrl) previewUrl = info.previewUrl;
    } catch (err) {
      console.error('Erreur relance étudiant :', err.message);
    }

    res.json({
      message: `Relance envoyée à ${studentName} (${studentEmail})`,
      emailPreviewUrl: previewUrl,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Marquer ou démarquer une leçon comme terminée pour suivre la progression
// @route   PUT /api/subscriptions/progress/:courseId
// @access  Private
const toggleLessonProgress = async (req, res) => {
  try {
    const { lessonId, completed } = req.body;
    if (!lessonId) {
      return res.status(400).json({ message: 'Identifiant de leçon requis' });
    }

    const subscription = await Subscription.findOne({
      student: req.user._id,
      course: req.params.courseId,
      status: 'active',
      expiresAt: { $gt: new Date() },
    });

    if (!subscription) {
      return res.status(404).json({ message: 'Aucun abonnement actif trouvé pour ce cours' });
    }

    const current = Array.isArray(subscription.completedLessons)
      ? subscription.completedLessons.map(String)
      : [];
    const targetId = String(lessonId);
    const shouldComplete = typeof completed === 'boolean' ? completed : !current.includes(targetId);

    if (shouldComplete && !current.includes(targetId)) {
      subscription.completedLessons.push(targetId);
    } else if (!shouldComplete) {
      subscription.completedLessons = current.filter((item) => item !== targetId);
    }

    await subscription.save();
    res.json({ completedLessons: subscription.completedLessons });
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
  toggleSubscriptionStatus,
  remindStudent,
  toggleLessonProgress,
};
