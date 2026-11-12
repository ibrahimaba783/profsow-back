const mongoose = require('mongoose');

const exerciseSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    chapterId: {
      type: String,
      default: '',
    },
    chapterTitle: {
      type: String,
      default: '',
    },
    title: {
      type: String,
      required: [true, "Le titre de l'exercice est obligatoire"],
      trim: true,
    },
    exerciseType: {
      type: String,
      enum: ['application', 'probleme', 'devoir', 'annale'],
      default: 'application',
    },
    difficulty: {
      type: String,
      enum: ['facile', 'moyen', 'difficile'],
      default: 'moyen',
    },
    statementText: {
      type: String,
      default: '',
    },
    statementImage: {
      type: String,
      default: '',
    },
    statementImagePublicId: {
      type: String,
      default: '',
    },
    statementPdf: {
      type: String,
      default: '',
    },
    statementPdfPublicId: {
      type: String,
      default: '',
    },
    hints: {
      type: String,
      default: '',
    },
    correctionText: {
      type: String,
      default: '',
    },
    correctionPdf: {
      type: String,
      default: '',
    },
    correctionPdfPublicId: {
      type: String,
      default: '',
    },
    correctionVideoUrl: {
      type: String,
      default: '',
    },
    correctionVisibility: {
      type: String,
      enum: ['immediate', 'after_deadline', 'after_attempt'],
      default: 'after_attempt',
    },
    deadline: {
      type: Date,
      default: null,
    },
    isRequired: {
      type: Boolean,
      default: true,
    },
    subscribersOnly: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Exercise', exerciseSchema);
