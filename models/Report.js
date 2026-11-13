const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    targetType: {
      type: String,
      enum: ['content', 'user'],
      required: true,
    },
    // Si c'est un signalement d'utilisateur
    targetUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Si c'est un signalement de contenu
    contentType: {
      type: String,
      enum: ['course', 'discussion', 'review', 'exercise', 'other'],
    },
    targetContentId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    contentSnippet: {
      type: String,
      default: '',
    },
    reason: {
      type: String,
      enum: [
        'inappropriate_content',
        'harassment',
        'spam',
        'suspect_behavior',
        'cheating',
        'hate_speech',
        'other',
      ],
      required: true,
    },
    description: {
      type: String,
      required: [true, 'Veuillez préciser le motif du signalement'],
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'in_review', 'resolved', 'rejected'],
      default: 'pending',
    },
    adminNotes: {
      type: String,
      default: '',
      trim: true,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    resolvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

reportSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Report', reportSchema);
