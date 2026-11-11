const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'global_config',
    },
    theme: {
      type: String,
      enum: ['bakeli', 'gradient', 'navy', 'emerald'],
      default: 'bakeli',
    },
    features: {
      enableLiveMeet: { type: Boolean, default: true },
      enableQuiz: { type: Boolean, default: true },
      enableForum: { type: Boolean, default: true },
      enablePdfDownload: { type: Boolean, default: true },
      enableWhatsAppButton: { type: Boolean, default: true },
      enableFreeEnrollment: { type: Boolean, default: true },
      enableOpenRegistration: { type: Boolean, default: true },
      showAnnouncementBanner: { type: Boolean, default: false },
    },
    announcement: {
      active: { type: Boolean, default: false },
      message: { type: String, default: 'Séance de révision en direct ce vendredi à 18h sur Google Meet !' },
      type: { type: String, enum: ['info', 'warning', 'success', 'urgent'], default: 'info' },
      link: { type: String, default: '' },
      buttonText: { type: String, default: 'Rejoindre le direct' },
    },
    channels: {
      whatsappNumber: { type: String, default: '+221771023399' },
      globalMeetLink: { type: String, default: 'https://meet.google.com/new' },
      telegramLink: { type: String, default: '' },
      youtubeUrl: { type: String, default: 'https://youtube.com/@dermannaltv4340?si=Jk86Ads8TMVEx6vv' },
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
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Setting', settingSchema);
