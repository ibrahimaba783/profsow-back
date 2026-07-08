const mongoose = require('mongoose');

const lessonSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Veuillez ajouter un titre à la leçon'],
  },
  contentType: {
    type: String,
    enum: ['video', 'pdf', 'meet', 'text'],
    required: [true, 'Veuillez choisir le type de contenu'],
  },
  youtubeUrl: {
    type: String,
    default: '',
  },
  pdfPath: {
    type: String,
    default: '',
  },
  pdfPublicId: {
    type: String,
    default: '',
  },
  meetLink: {
    type: String,
    default: '',
  },
  content: {
    type: String,
    default: '',
  },
});

const chapterSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Veuillez ajouter un titre au chapitre'],
  },
  lessons: [lessonSchema],
});

const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Veuillez ajouter un titre au cours'],
    },
    description: {
      type: String,
      required: [true, 'Veuillez ajouter une description au cours'],
    },
    subject: {
      type: String,
      required: [true, 'Veuillez spécifier la matière'],
      enum: ['Mathématiques', 'Physique-Chimie'],
    },
    level: {
      type: String,
      required: [true, 'Veuillez spécifier le niveau'],
      enum: ['4ème', '3ème', '2nde S', '1ère S', 'TS'],
    },
    price: {
      type: Number,
      default: 6000, // 6000 FCFA
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    image: {
      type: String,
      default: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&q=80&w=800',
    },
    imagePublicId: {
      type: String,
      default: '',
    },
    chapters: [chapterSchema],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Course', courseSchema);
