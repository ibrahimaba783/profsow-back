const Setting = require('../models/Setting');

const defaultSettings = {
  key: 'global_config',
  siteInfo: {
    platformName: 'Aliou Sow Academy',
    tagline: 'Excellence Scientifique',
    teacherDisplayName: 'M. Aliou Sow',
    defaultPrice: 6000,
    defaultDuration: '3 mois',
    waveNumber: '+221 77 102 33 99',
    orangeMoneyNumber: '+221 77 102 33 99',
    maintenanceMode: false,
    maintenanceMessage:
      'La plateforme est momentanément en maintenance. Nous revenons très vite !',
  },
  subjects: ['Mathématiques', 'Physique-Chimie'],
  levels: [
    { value: '4ème', label: '4ème' },
    { value: '3ème', label: '3ème' },
    { value: '2nde S', label: '2nde S' },
    { value: '1ère S', label: '1ère S' },
    { value: 'TS', label: 'Terminale S' },
  ],
  features: {
    enableOpenRegistration: true,
    enableFreeEnrollment: true,
    enablePayments: true,
    enableLiveMeet: true,
    enableQuiz: true,
    enableForum: true,
    enableReviews: true,
    enablePdfDownload: true,
    enableShareButtons: true,
    enableSequentialUnlock: true,
    enableAppInstall: true,
  },
  announcement: {
    active: false,
    message: 'Nouvelle séance de révision en direct avec M. Aliou Sow ce week-end !',
    type: 'info',
    buttonText: 'Découvrir',
    link: '/courses',
  },
  channels: {
    contactPhone: '+221 77 102 33 99',
    contactEmail: 'Sowaliou2504@gmail.com',
    whatsappNumber: '+221771023399',
    facebookUrl: '',
    tiktokUrl: 'https://www.tiktok.com/@aliousow9216',
    youtubeUrl: 'https://youtube.com/@dermannaltv4340?si=Jk86Ads8TMVEx6vv',
    globalMeetLink: 'https://meet.google.com/new',
  },
  faqs: [
    {
      question: 'Comment fonctionne Aliou Sow Academy ?',
      answer:
        "Inscrivez-vous en quelques secondes, choisissez votre module en Mathématiques ou Physique-Chimie selon votre classe (4ème à Terminale S), accédez aux chapitres structurés (vidéos, fiches PDF, cours rédigés, séances en direct) et validez vos acquis grâce aux quiz interactifs.",
    },
    {
      question: 'Les cours suivent-ils le programme officiel ?',
      answer:
        "Oui, l'ensemble des modules est conçu par M. Aliou Sow conformément au programme officiel sénégalais du collège et du lycée scientifique (4ème, 3ème, 2nde S, 1ère S, Terminale S) pour préparer efficacement le BFEM et le Baccalauréat.",
    },
    {
      question: "Quel est le tarif et la durée d'accès à un module ?",
      answer:
        "L'accès standard à un module est fixé à 6 000 FCFA (payable simplement par Wave ou Orange Money), avec des offres gratuites sur certains modules de découverte et un accès renouvelable pour accompagner votre progression.",
    },
    {
      question: 'Puis-je accéder aux cours sur mobile ?',
      answer:
        "Oui, la plateforme est entièrement responsive et optimisée pour smartphones, tablettes et ordinateurs. Vous pouvez même l'installer sur votre écran d'accueil pour un accès rapide.",
    },
    {
      question: "Y a-t-il un support disponible si j'ai des questions ?",
      answer:
        "Oui ! Chaque module intègre un salon de discussion et de soutien pédagogique permettant d'échanger directement avec M. Aliou Sow et les autres élèves, en plus des séances en direct.",
    },
  ],
  testimonials: [
    {
      name: 'FATOU DIAGNE',
      level: 'Élève en Terminale S',
      quote:
        "Grâce à Aliou Sow Academy, j'ai pu maîtriser les fonctions, les suites et la mécanique. Les cours sont très structurés et les quiz corrigés m'ont permis de réussir mon Baccalauréat sereinement.",
      rating: 5,
    },
    {
      name: 'MOUSSA KA',
      level: 'Élève en 1ère S',
      quote:
        "Les séances en direct et l'espace d'échange avec M. Aliou Sow font toute la différence. Dès que j'ai une question sur un chapitre de Physique-Chimie, j'obtiens une explication claire et rapide.",
      rating: 5,
    },
    {
      name: 'AÏSSATOU SARR',
      level: 'Élève en 3ème',
      quote:
        "Les fiches PDF et les vidéos pas à pas sont faciles à suivre sur téléphone comme sur ordinateur. J'ai préparé mon BFEM en toute confiance grâce aux exercices interactifs.",
      rating: 5,
    },
  ],
  extraLinks: [],
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

// @desc    Mettre à jour la configuration de la plateforme (Admin uniquement)
// @route   PUT /api/settings
// @access  Private/Admin
const updateSettings = async (req, res) => {
  try {
    let settings = await Setting.findOne({ key: 'global_config' });
    if (!settings) {
      settings = await Setting.create(defaultSettings);
    }

    const {
      siteInfo,
      subjects,
      levels,
      features,
      announcement,
      channels,
      faqs,
      testimonials,
      extraLinks,
    } = req.body;

    if (siteInfo && typeof siteInfo === 'object') {
      settings.siteInfo = {
        ...settings.siteInfo.toObject(),
        ...siteInfo,
        defaultPrice:
          siteInfo.defaultPrice !== undefined
            ? Number(siteInfo.defaultPrice) || 0
            : settings.siteInfo.defaultPrice,
      };
    }

    if (Array.isArray(subjects)) {
      const cleanedSubjects = [...new Set(subjects.map((s) => String(s || '').trim()).filter(Boolean))];
      if (cleanedSubjects.length > 0) {
        settings.subjects = cleanedSubjects;
      }
    }

    if (Array.isArray(levels)) {
      const cleanedLevels = levels
        .map((l) => {
          if (typeof l === 'string') {
            const v = l.trim();
            return v ? { value: v, label: v } : null;
          }
          const value = String(l?.value || '').trim();
          const label = String(l?.label || value).trim();
          return value ? { value, label } : null;
        })
        .filter(Boolean);
      if (cleanedLevels.length > 0) {
        settings.levels = cleanedLevels;
      }
    }

    if (features && typeof features === 'object') {
      settings.features = { ...settings.features.toObject(), ...features };
    }

    if (announcement && typeof announcement === 'object') {
      settings.announcement = { ...settings.announcement.toObject(), ...announcement };
    }

    if (channels && typeof channels === 'object') {
      settings.channels = { ...settings.channels.toObject(), ...channels };
    }

    if (Array.isArray(faqs)) {
      settings.faqs = faqs
        .filter((f) => f && f.question?.trim() && f.answer?.trim())
        .map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }));
    }

    if (Array.isArray(testimonials)) {
      settings.testimonials = testimonials
        .filter((t) => t && t.name?.trim() && t.quote?.trim())
        .map((t) => ({
          name: t.name.trim(),
          level: (t.level || 'Élève').trim(),
          quote: t.quote.trim(),
          rating: Number(t.rating) || 5,
        }));
    }

    if (Array.isArray(extraLinks)) {
      settings.extraLinks = extraLinks
        .filter((item) => item && item.title?.trim() && item.url?.trim())
        .map((item) => ({
          title: item.title.trim(),
          description: (item.description || '').trim(),
          url: item.url.trim(),
          badge: (item.badge || 'Nouveau').trim(),
          active: item.active !== false,
        }));
    }

    const saved = await settings.save();
    res.json(saved);
  } catch (error) {
    console.error('Erreur updateSettings :', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getSettings, updateSettings, defaultSettings };
