const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'global_config',
    },
    siteInfo: {
      platformName: { type: String, default: 'Aliou Sow Academy' },
      tagline: { type: String, default: 'Excellence Scientifique' },
      teacherDisplayName: { type: String, default: 'M. Aliou Sow' },
      defaultPrice: { type: Number, default: 6000 },
      defaultDuration: { type: String, default: '3 mois' },
      waveNumber: { type: String, default: '+221 77 102 33 99' },
      orangeMoneyNumber: { type: String, default: '+221 77 102 33 99' },
      maintenanceMode: { type: Boolean, default: false },
      maintenanceMessage: {
        type: String,
        default: 'La plateforme est momentanément en maintenance. Nous revenons très vite !',
      },
    },
    subjects: {
      type: [String],
      default: ['Mathématiques', 'Physique-Chimie'],
    },
    levels: {
      type: [
        {
          value: { type: String, required: true },
          label: { type: String, required: true },
        },
      ],
      default: [
        { value: '4ème', label: '4ème' },
        { value: '3ème', label: '3ème' },
        { value: '2nde S', label: '2nde S' },
        { value: '1ère S', label: '1ère S' },
        { value: 'TS', label: 'Terminale S' },
      ],
    },
    features: {
      enableOpenRegistration: { type: Boolean, default: true },
      enableFreeEnrollment: { type: Boolean, default: true },
      enablePayments: { type: Boolean, default: true },
      enableLiveMeet: { type: Boolean, default: true },
      enableQuiz: { type: Boolean, default: true },
      enableForum: { type: Boolean, default: true },
      enableReviews: { type: Boolean, default: true },
      enablePdfDownload: { type: Boolean, default: true },
      enableShareButtons: { type: Boolean, default: true },
      enableSequentialUnlock: { type: Boolean, default: true },
    },
    announcement: {
      active: { type: Boolean, default: false },
      message: {
        type: String,
        default: 'Nouvelle séance de révision en direct avec M. Aliou Sow ce week-end !',
      },
      type: {
        type: String,
        enum: ['info', 'warning', 'success', 'urgent'],
        default: 'info',
      },
      buttonText: { type: String, default: 'Découvrir' },
      link: { type: String, default: '/courses' },
    },
    channels: {
      contactPhone: { type: String, default: '+221 77 102 33 99' },
      contactEmail: { type: String, default: 'Sowaliou2504@gmail.com' },
      whatsappNumber: { type: String, default: '+221771023399' },
      facebookUrl: { type: String, default: '' },
      tiktokUrl: { type: String, default: 'https://www.tiktok.com/@aliousow9216' },
      youtubeUrl: {
        type: String,
        default: 'https://youtube.com/@dermannaltv4340?si=Jk86Ads8TMVEx6vv',
      },
      globalMeetLink: { type: String, default: 'https://meet.google.com/new' },
    },
    faqs: [
      {
        question: { type: String, required: true },
        answer: { type: String, required: true },
      },
    ],
    testimonials: [
      {
        name: { type: String, required: true },
        level: { type: String, required: true },
        quote: { type: String, required: true },
        rating: { type: Number, default: 5 },
      },
    ],
    extraLinks: [
      {
        title: { type: String, required: true },
        description: { type: String, default: '' },
        url: { type: String, required: true },
        badge: { type: String, default: 'Nouveau' },
        active: { type: Boolean, default: true },
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Setting', settingSchema);
