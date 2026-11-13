const Report = require('../models/Report');
const User = require('../models/User');
const Course = require('../models/Course');
const Discussion = require('../models/Discussion');
const Review = require('../models/Review');
const Notification = require('../models/Notification');
const { logSecurityEvent } = require('../utils/securityLogger');

// @desc    Créer un signalement (Élève, Enseignant ou Admin)
// @route   POST /api/reports
// @access  Private
const createReport = async (req, res) => {
  try {
    const {
      targetType,
      targetUser,
      contentType,
      targetContentId,
      contentSnippet,
      reason,
      description,
    } = req.body;

    if (!targetType || !reason || !description) {
      return res.status(400).json({ message: 'Veuillez renseigner tous les champs obligatoires du signalement.' });
    }

    const report = await Report.create({
      reporter: req.user._id,
      targetType,
      targetUser: targetUser || null,
      contentType: contentType || null,
      targetContentId: targetContentId || null,
      contentSnippet: contentSnippet || '',
      reason,
      description,
      status: 'pending',
    });

    // Notifier immédiatement les administrateurs
    await Notification.create({
      roleTarget: 'admin',
      type: 'report_new',
      title: '🚨 Nouveau signalement reçu',
      message: `Un signalement (${reason}) a été envoyé par ${req.user.name}.`,
      link: '/admin-dashboard?tab=security',
      createdByUser: req.user._id,
    });

    await logSecurityEvent({
      event: 'report_action',
      user: req.user._id,
      severity: 'info',
      message: `Nouveau signalement créé (${targetType} : ${reason}) par ${req.user.email}`,
      details: { reportId: report._id },
    });

    res.status(201).json({ message: 'Signalement envoyé avec succès.', report });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Obtenir la liste de tous les signalements (Admin)
// @route   GET /api/reports
// @access  Private/Admin
const getReports = async (req, res) => {
  try {
    const { status, targetType } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (targetType) filter.targetType = targetType;

    const reports = await Report.find(filter)
      .populate('reporter', 'name email role avatar')
      .populate('targetUser', 'name email role avatar status')
      .populate('resolvedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json(reports);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Traiter un signalement (Admin)
// @route   PUT /api/reports/:id
// @access  Private/Admin
const updateReport = async (req, res) => {
  try {
    const { status, adminNotes, actionOnTarget } = req.body;
    const report = await Report.findById(req.params.id);

    if (!report) {
      return res.status(404).json({ message: 'Signalement non trouvé' });
    }

    if (status) report.status = status;
    if (adminNotes !== undefined) report.adminNotes = adminNotes;
    report.resolvedBy = req.user._id;
    report.resolvedAt = new Date();

    // Action automatique facultative demandée par l'admin
    if (actionOnTarget === 'suspend_user' && report.targetUser) {
      const u = await User.findById(report.targetUser);
      if (u) {
        u.status = 'suspended';
        u.suspendedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours par défaut
        u.suspensionReason = adminNotes || `Signalement résolu : ${report.reason}`;
        await u.save();
      }
    } else if (actionOnTarget === 'block_user' && report.targetUser) {
      const u = await User.findById(report.targetUser);
      if (u) {
        u.isActive = false;
        u.status = 'blocked';
        await u.save();
      }
    } else if (actionOnTarget === 'delete_content' && report.targetContentId) {
      if (report.contentType === 'discussion') {
        await Discussion.findByIdAndDelete(report.targetContentId);
      } else if (report.contentType === 'review') {
        await Review.findByIdAndDelete(report.targetContentId);
      }
    }

    const saved = await report.save();

    await logSecurityEvent({
      event: 'report_action',
      user: req.user._id,
      severity: 'info',
      message: `Signalement #${report._id} mis à jour (${report.status}) par ${req.user.email}`,
      details: { actionOnTarget, adminNotes },
    });

    res.json(saved);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createReport,
  getReports,
  updateReport,
};
