const Subscription = require('../models/Subscription');
const Course = require('../models/Course');
const sendEmail = require('../utils/sendEmail');

// @desc    Créer un abonnement (Paiement simulé)
// @route   POST /api/subscriptions
// @access  Private
const createSubscription = async (req, res) => {
  try {
    const { courseId, paymentMethod, transactionId, amount, durationMonths } = req.body;

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    // Vérifier s'il y a déjà un abonnement actif
    const existingSub = await Subscription.findOne({
      student: req.user._id,
      course: courseId,
      status: 'active',
      expiresAt: { $gt: new Date() },
    });

    if (existingSub) {
      return res.status(400).json({ message: 'Vous disposez déjà d\'un abonnement actif pour ce cours' });
    }

    // Calculer la date d'expiration
    const months = durationMonths ? parseInt(durationMonths) : 12; // 1 an renouvelable selon le CDC pour l'accès standard
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + months);

    const subscription = await Subscription.create({
      student: req.user._id,
      course: courseId,
      paymentMethod,
      transactionId,
      amount: amount || course.price,
      expiresAt,
      status: 'active',
    });

    // Envoyer un e-mail réel de confirmation de paiement
    const subject = `Confirmation d'abonnement - Cours : ${course.title}`;
    const formattedExpires = expiresAt.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #10B981; border-radius: 10px; background-color: #ffffff;">
        <h2 style="color: #10B981; text-align: center; border-bottom: 2px solid #10B981; padding-bottom: 10px;">Paiement Confirmé !</h2>
        <p>Bonjour <strong>${req.user.name}</strong>,</p>
        <p>Votre abonnement au cours de <strong>${course.title}</strong> a été activé avec succès.</p>
        
        <h3 style="color: #374151; margin-top: 20px;">Détails de la transaction :</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 14px;">
          <tr style="background-color: #f9fafb;"><td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Cours :</strong></td><td style="padding: 10px; border: 1px solid #e5e7eb;">${course.title} (${course.level})</td></tr>
          <tr><td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Matière :</strong></td><td style="padding: 10px; border: 1px solid #e5e7eb;">${course.subject}</td></tr>
          <tr style="background-color: #f9fafb;"><td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Mode de règlement :</strong></td><td style="padding: 10px; border: 1px solid #e5e7eb;">${paymentMethod}</td></tr>
          <tr><td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Numéro de transaction :</strong></td><td style="padding: 10px; border: 1px solid #e5e7eb;"><code>${transactionId}</code></td></tr>
          <tr style="background-color: #f9fafb;"><td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Montant réglé :</strong></td><td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>${amount || course.price} FCFA</strong></td></tr>
          <tr><td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Fin de validité :</strong></td><td style="padding: 10px; border: 1px solid #e5e7eb; color: #b91c1c;"><strong>${formattedExpires}</strong></td></tr>
        </table>
        
        <p>Vous pouvez maintenant accéder à l'ensemble des chapitres, vidéos YouTube, documents PDF et liens Google Meet.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${frontendUrl}/courses/${course._id}" style="background-color: #10B981; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Commencer à étudier</a>
        </div>
        <hr style="border: 0; border-top: 1px solid #e5e7eb;">
        <p style="font-size: 11px; color: #9ca3af; text-align: center;">Ce message a été envoyé automatiquement. Veuillez ne pas y répondre directement.</p>
      </div>
    `;

    let emailStatus = 'sent';
    let previewUrl = '';
    try {
      const mailInfo = await sendEmail({ email: req.user.email, subject, html });
      if (mailInfo && mailInfo.previewUrl) {
        previewUrl = mailInfo.previewUrl;
      }
    } catch (err) {
      console.error("Erreur d'envoi d'e-mail de confirmation d'abonnement :", err);
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

// @desc    Obtenir les abonnements de l'étudiant connecté
// @route   GET /api/subscriptions/my
// @access  Private
const getMySubscriptions = async (req, res) => {
  try {
    const subscriptions = await Subscription.find({ student: req.user._id })
      .populate({
        path: 'course',
        populate: { path: 'teacher', select: 'name email avatar' }
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

// @desc    Obtenir tous les étudiants inscrits (Enseignant uniquement)
// @route   GET /api/subscriptions/teacher/students
// @access  Private/Teacher
const getTeacherStudents = async (req, res) => {
  try {
    const courses = await Course.find({ teacher: req.user._id });
    const courseIds = courses.map(c => c._id);

    const subscriptions = await Subscription.find({ course: { $in: courseIds } })
      .populate('student', 'name email avatar bio')
      .populate('course', 'title subject level');

    res.json(subscriptions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createSubscription,
  getMySubscriptions,
  checkSubscriptionStatus,
  getTeacherStudents,
};