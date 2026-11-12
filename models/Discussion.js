const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const discussionSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    exercise: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exercise',
      default: null,
    },
    exerciseTitle: {
      type: String,
      default: '',
    },
    message: {
      type: String,
      required: [true, 'Le message ne peut pas être vide'],
    },
    isResolved: {
      type: Boolean,
      default: false,
    },
    replies: [replySchema],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Discussion', discussionSchema);
