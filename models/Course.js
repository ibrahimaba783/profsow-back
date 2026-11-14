const mongoose = require('mongoose');

const lessonSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Veuillez ajouter un titre à la leçon'],
  },
  contentType: {
    type: String,
    // 'jitsi' = salle de classe en direct intégrée (utilisée par CourseDetail.jsx)
    enum: ['video', 'pdf', 'meet', 'jitsi', 'text'],
    required: [true, 'Veuillez choisir le type de contenu'],
  },
  isFree: {
    type: Boolean,
    default: false,
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
  isLocked: {
    type: Boolean,
    default: false,
  },
  isFree: {
    type: Boolean,
    default: false,
  },
  lessons: [lessonSchema],
});

const announcementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, "Le titre de l'annonce est obligatoire"],
    trim: true,
  },
  message: {
    type: String,
    required: [true, "Le message de l'annonce est obligatoire"],
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
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
    // Matière et niveau ouverts afin que l'administrateur puisse en ajouter
    // depuis le Back-Office sans modifier le code source.
    subject: {
      type: String,
      required: [true, 'Veuillez spécifier la matière'],
      trim: true,
    },
    level: {
      type: String,
      required: [true, 'Veuillez spécifier le niveau'],
      trim: true,
    },
    // Durée affichée sur les cartes de cours (ex: "3 mois", "10h", "1 an")
    duration: {
      type: String,
      default: '3 mois',
    },
    price: {
      type: Number,
      default: 6000, // 6000 FCFA
    },
    isFree: {
      type: Boolean,
      default: false, // true = module offert gratuitement (offre promotionnelle)
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
    originalPrice: {
      type: Number,
      default: 6000, // Valeur normale affichée barrée quand le cours est en promotion gratuite
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
    announcements: [announcementSchema],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Course', courseSchema);
