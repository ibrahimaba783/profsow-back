const Course = require('../models/Course');
const Subscription = require('../models/Subscription');
const { cloudinary } = require('../utils/cloudinary');

// @desc    Obtenir tous les cours
// @route   GET /api/courses
// @access  Public
const getCourses = async (req, res) => {
  try {
    const { subject, level } = req.query;
    const query = {};
    if (subject) query.subject = subject;
    if (level) query.level = level;

    const courses = await Course.find(query).populate('teacher', 'name email avatar bio');
    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Obtenir un cours spécifique par son ID
// @route   GET /api/courses/:id
// @access  Public (contenu complet uniquement si prof propriétaire ou élève abonné)
const getCourseById = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id).populate('teacher', 'name email avatar bio');
    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    // Détermine si l'utilisateur (peuplé par optionalAuth, peut être undefined) a le droit
    // de voir le contenu complet (chapitres/leçons/PDF/liens vidéo).
    let hasFullAccess = false;

    if (req.user) {
      const isOwnerTeacher =
        req.user.role === 'teacher' &&
        course.teacher._id.toString() === req.user._id.toString();

      if (isOwnerTeacher) {
        hasFullAccess = true;
      } else if (req.user.role === 'student') {
        const activeSub = await Subscription.findOne({
          student: req.user._id,
          course: course._id,
          status: 'active',
          expiresAt: { $gt: new Date() },
        });
        hasFullAccess = !!activeSub;
      }
    }

    if (hasFullAccess) {
      return res.json(course);
    }

    // Accès restreint : on renvoie les infos publiques (catalogue) ainsi que le sommaire
    // (titres des chapitres/leçons) pour donner un aperçu du contenu, à la manière d'une
    // page de vente de cours — mais SANS le contenu pédagogique réel (pdfPath/youtubeUrl/
    // meetLink/content), qui reste réservé aux personnes abonnées.
    const publicCourse = {
      _id: course._id,
      title: course.title,
      description: course.description,
      subject: course.subject,
      level: course.level,
      price: course.price,
      image: course.image,
      teacher: course.teacher,
      chaptersCount: course.chapters?.length || 0,
      lessonsCount: course.chapters?.reduce((acc, c) => acc + (c.lessons?.length || 0), 0) || 0,
      chapters: (course.chapters || []).map((chapter) => ({
        _id: chapter._id,
        title: chapter.title,
        lessons: (chapter.lessons || []).map((lesson) => ({
          _id: lesson._id,
          title: lesson.title,
          contentType: lesson.contentType,
        })),
      })),
    };

    res.json(publicCourse);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Créer un cours (Enseignant uniquement)
// @route   POST /api/courses
// @access  Private/Teacher
const createCourse = async (req, res) => {
  try {
    const { title, description, subject, level, price } = req.body;

    const courseData = {
      title,
      description,
      subject,
      level,
      price: price ? parseFloat(price) : 6000,
      teacher: req.user._id,
    };

    if (req.file) {
      courseData.image = req.file.path;
      courseData.imagePublicId = req.file.filename;
    }

    const course = await Course.create(courseData);
    res.status(201).json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mettre à jour un cours
// @route   PUT /api/courses/:id
// @access  Private/Teacher
const updateCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    // Vérifier si le cours appartient bien au professeur connecté
    if (course.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Non autorisé à modifier ce cours' });
    }

    course.title = req.body.title || course.title;
    course.description = req.body.description || course.description;
    course.subject = req.body.subject || course.subject;
    course.level = req.body.level || course.level;
    if (req.body.price !== undefined) course.price = parseFloat(req.body.price);

    if (req.file) {
      // Supprimer l'ancienne image de Cloudinary si elle existe
      if (course.imagePublicId) {
        await cloudinary.uploader.destroy(course.imagePublicId);
      }
      course.image = req.file.path;
      course.imagePublicId = req.file.filename;
    }

    const updatedCourse = await course.save();
    res.json(updatedCourse);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Supprimer un cours
// @route   DELETE /api/courses/:id
// @access  Private/Teacher
const deleteCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    if (course.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Non autorisé à supprimer ce cours' });
    }

    // Supprimer l'image principale de Cloudinary
    if (course.imagePublicId) {
      await cloudinary.uploader.destroy(course.imagePublicId);
    }

    // Supprimer les PDF associés de toutes les leçons
    for (const chapter of course.chapters) {
      for (const lesson of chapter.lessons) {
        if (lesson.pdfPublicId) {
          await cloudinary.uploader.destroy(lesson.pdfPublicId, { resource_type: 'raw' });
        }
      }
    }

    await course.deleteOne();
    res.json({ message: 'Cours supprimé avec succès' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Ajouter un chapitre à un cours
// @route   POST /api/courses/:id/chapters
// @access  Private/Teacher
const addChapter = async (req, res) => {
  try {
    const { title } = req.body;
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    if (course.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    course.chapters.push({ title, lessons: [] });
    await course.save();
    res.status(201).json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Ajouter une leçon à un chapitre
// @route   POST /api/courses/:id/chapters/:chapterId/lessons
// @access  Private/Teacher
const addLesson = async (req, res) => {
  try {
    const { title, contentType, youtubeUrl, meetLink, content } = req.body;
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    if (course.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    const chapter = course.chapters.id(req.params.chapterId);
    if (!chapter) {
      return res.status(404).json({ message: 'Chapitre non trouvé' });
    }

    const lessonData = {
      title,
      contentType,
      youtubeUrl,
      meetLink,
      content,
    };

    if (contentType === 'pdf' && req.file) {
      lessonData.pdfPath = req.file.path;
      lessonData.pdfPublicId = req.file.filename;
    }

    chapter.lessons.push(lessonData);
    await course.save();
    res.status(201).json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Supprimer un chapitre d'un cours
// @route   DELETE /api/courses/:id/chapters/:chapterId
// @access  Private/Teacher
const deleteChapter = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    if (course.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    const chapter = course.chapters.id(req.params.chapterId);
    if (!chapter) {
      return res.status(404).json({ message: 'Chapitre non trouvé' });
    }

    // Supprimer les PDF associés aux leçons de ce chapitre de Cloudinary
    for (const lesson of chapter.lessons) {
      if (lesson.pdfPublicId) {
        await cloudinary.uploader.destroy(lesson.pdfPublicId, { resource_type: 'raw' });
      }
    }

    course.chapters.pull(req.params.chapterId);
    await course.save();
    res.json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Supprimer une leçon d'un chapitre
// @route   DELETE /api/courses/:id/chapters/:chapterId/lessons/:lessonId
// @access  Private/Teacher
const deleteLesson = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    if (course.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    const chapter = course.chapters.id(req.params.chapterId);
    if (!chapter) {
      return res.status(404).json({ message: 'Chapitre non trouvé' });
    }

    const lesson = chapter.lessons.id(req.params.lessonId);
    if (!lesson) {
      return res.status(404).json({ message: 'Leçon non trouvée' });
    }

    // Supprimer le PDF de Cloudinary si existant
    if (lesson.pdfPublicId) {
      await cloudinary.uploader.destroy(lesson.pdfPublicId, { resource_type: 'raw' });
    }

    chapter.lessons.pull(req.params.lessonId);
    await course.save();
    res.json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  addChapter,
  addLesson,
  deleteChapter,
  deleteLesson,
};