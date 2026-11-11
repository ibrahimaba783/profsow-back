const Setting = require('../models/Setting');

// Configuration par défaut si la base de données est vide
const defaultSettings = {
  key: 'global_config',
  theme: 'bakeli',
  features: {
    enableLiveMeet: true,
    enableQuiz: true,
    enableForum: true,
    enablePdfDownload: true,
    enableWhatsAppButton: true,
    enableFreeEnrollment: true,
    enableOpenRegistration: true,
    showAnnouncementBanner: false,
  },
  announcement: {
    active: false,
    message: 'Bienvenue sur la plateforme officielle de M. Aliou Sow !',
    type: 'info',
    link: '',
    buttonText: 'En savoir plus',
  },
  channels: {
    whatsappNumber: '+221771023399',
    globalMeetLink: 'https://meet.google.com/new',
    telegramLink: '',
    youtubeUrl: 'https://youtube.com/@dermannaltv4340?si=Jk86Ads8TMVEx6vv',
  },
  faqs: [
    {
      question: 'Comment fonctionne la plateforme Aliou Sow Academy ?',
      answer: "Inscrivez-vous en 30 secondes, choisissez votre classe et accédez aux cours complets avec vidéos, fiches PDF téléchargeables, quiz et séances en direct sur Google Meet.",
    },
    {
      question: 'Les cours sont-ils conformes au programme officiel sénégalais ?',
      answer: "Oui, tous les cours sont conformes au programme officiel du BFEM et du Baccalauréat Scientifique.",
    },
    {
      question: 'Puis-je suivre les cours depuis mon téléphone ?',
      answer: "Oui, la plateforme est 100% optimisée pour mobile, tablette et ordinateur.",
    },
  ],
  testimonials: [
    {
      name: 'Fatou Diagne',
      level: 'Terminale S',
      quote: "Grâce aux cours de M. Sow, j'ai eu 16/20 en maths au Bac !",
      rating: 5,
    },
    {
      name: 'Moussa Ka',
      level: '1ère S',
      quote: "Les séances en direct sur Google Meet m'aident énormément à comprendre.",
      rating: 5,
    },
  ],
};

// @desc    Obtenir la configuration publique de la plateforme
// @route   GET /api/settings
// @access  Public
const getSettings = async (req, res) => {
  try {
    let settings = await Setting.findOne({ key: 'global_config' });
    if (!settings) {
      settings = await Setting.create(defaultSettings);
    }
    res.json(settings);
  } catch (error) {
    console.error('Erreur getSettings :', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mettre à jour la configuration de la plateforme (Enseignant / Admin)
// @route   PUT /api/settings
// @access  Private (Teacher)
const updateSettings = async (req, res) => {
  try {
    let settings = await Setting.findOne({ key: 'global_config' });

    if (!settings) {
      settings = new Setting({ key: 'global_config', ...req.body });
    } else {
      if (req.body.theme !== undefined) settings.theme = req.body.theme;
      if (req.body.features) settings.features = { ...settings.features, ...req.body.features };
      if (req.body.announcement) settings.announcement = { ...settings.announcement, ...req.body.announcement };
      if (req.body.channels) settings.channels = { ...settings.channels, ...req.body.channels };
      if (req.body.faqs) settings.faqs = req.body.faqs;
      if (req.body.testimonials) settings.testimonials = req.body.testimonials;
    }

    const saved = await settings.save();
    res.json(saved);
  } catch (error) {
    console.error('Erreur updateSettings :', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getSettings, updateSettings };
