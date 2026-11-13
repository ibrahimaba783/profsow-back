const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    // Destinataire spécifique ou null pour un message de groupe
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Ciblage par rôle si recipient est null
    roleTarget: {
      type: String,
      enum: ['all', 'student', 'teacher', 'admin'],
      default: 'all',
    },
    type: {
      type: String,
      enum: [
        'security_alert',
        'report_new',
        'report_resolved',
        'payment_success',
        'payment_failed',
        'subscription_expiring',
        'new_user',
        'broadcast_announcement',
        'course_published',
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    link: {
      type: String,
      default: '',
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    createdByUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ roleTarget: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
