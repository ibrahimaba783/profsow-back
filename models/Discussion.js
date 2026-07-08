const mongoose = require('mongoose');

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
    message: {
      type: String,
      required: [true, 'Le message ne peut pas être vide'],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Discussion', discussionSchema);
