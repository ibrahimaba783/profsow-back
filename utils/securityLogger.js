const SecurityLog = require('../models/SecurityLog');
const Notification = require('../models/Notification');

const logSecurityEvent = async ({
  event,
  user = null,
  email = '',
  ip = '',
  userAgent = '',
  severity = 'info',
  message,
  details = {},
}) => {
  try {
    const log = await SecurityLog.create({
      event,
      user: user?._id || user || null,
      email: email || user?.email || '',
      ip: String(ip || ''),
      userAgent: String(userAgent || ''),
      severity,
      message,
      details,
    });

    if (severity === 'critical' || severity === 'warning') {
      await Notification.create({
        roleTarget: 'admin',
        type: 'security_alert',
        title: severity === 'critical' ? '🚨 Alerte de Sécurité Critique' : '⚠️ Alerte de Sécurité',
        message: message || `Événement ${event} détecté pour ${email || 'un utilisateur'}.`,
        link: '/admin-dashboard?tab=security',
      });
    }

    return log;
  } catch (err) {
    console.error('Erreur enregistrement log de sécurité :', err.message);
  }
};

module.exports = { logSecurityEvent };
