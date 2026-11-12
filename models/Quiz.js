const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  questionText: {
    type: String,
    required: [true, 'La question est obligatoire'],
  },
  questionType: {
    type: String,
    enum: ['qcm', 'true_false', 'text'],
    default: 'qcm',
  },
  options: {
    type: [String],
    default: [],
  },
  correctAnswerIndex: {
    type: Number,
    default: 0,
  },
  correctAnswerText: {
    type: String,
    default: '',
  },
});

const quizSchema = new mongoose.Schema(
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
      required: [true, 'Le titre du quiz est obligatoire'],
    },
    passingScore: {
      type: Number,
      default: 50,
      min: 0,
      max: 100,
    },
    maxAttempts: {
      type: Number,
      default: 0, // 0 = illimité
      min: 0,
    },
    questions: [questionSchema],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Quiz', quizSchema);
