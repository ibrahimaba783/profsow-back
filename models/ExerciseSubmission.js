const mongoose = require('mongoose');

const exerciseSubmissionSchema = new mongoose.Schema(
  {
    exercise: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exercise',
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['attempted', 'submitted', 'graded'],
      default: 'attempted',
    },
    answerText: {
      type: String,
      default: '',
    },
    fileUrl: {
      type: String,
      default: '',
    },
    filePublicId: {
      type: String,
      default: '',
    },
    fileType: {
      type: String,
      enum: ['', 'image', 'pdf'],
      default: '',
    },
    grade: {
      type: Number,
      default: null,
    },
    isPassed: {
      type: Boolean,
      default: false,
    },
    teacherComment: {
      type: String,
      default: '',
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    gradedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

exerciseSubmissionSchema.index({ exercise: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('ExerciseSubmission', exerciseSubmissionSchema);
