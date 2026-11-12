const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
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
    rating: {
      type: Number,
      required: [true, 'La note est obligatoire'],
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      default: '',
      maxlength: 1000,
    },
    teacherReply: {
      type: String,
      default: '',
      maxlength: 1000,
    },
    repliedAt: {
      type: Date,
    },
    isReported: {
      type: Boolean,
      default: false,
    },
    reportReason: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Review', reviewSchema);
