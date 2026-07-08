const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  questionText: {
    type: String,
    required: [true, 'La question est obligatoire'],
  },
  options: {
    type: [String],
    required: [true, 'Les options sont obligatoires'],
    validate: [arr => arr.length >= 2, 'Il faut au moins deux options'],
  },
  correctAnswerIndex: {
    type: Number,
    required: [true, "L'indice de la bonne réponse est obligatoire"],
  },
});

const quizSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    title: {
      type: String,
      required: [true, 'Le titre du quiz est obligatoire'],
    },
    questions: [questionSchema],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Quiz', quizSchema);
