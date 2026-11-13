const mongoose = require('mongoose');

const securityLogSchema = new mongoose.Schema(
  {
    event: {
      type: String,
      enum: [
        'login_success',
        'login_failed',
        'logout',
        'bruteforce_alert',
        'account_locked',
        'account_unlocked',
        'user_suspended',
        'user_blocked',
        'password_reset_request',
        'password_reset_success',
        'subscription_granted',
        'subscription_updated',
        'subscription_deleted',
        'report_action',
        'db_backup',
        'admin_action',
      ],
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    email: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
    },
    ip: {
      type: String,
      default: '',
    },
    userAgent: {
      type: String,
      default: '',
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'],
      default: 'info',
    },
    message: {
      type: String,
      required: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

securityLogSchema.index({ createdAt: -1 });
securityLogSchema.index({ event: 1, severity: 1 });

module.exports = mongoose.model('SecurityLog', securityLogSchema);
