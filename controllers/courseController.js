const Course = require('../models/Course');
const Subscription = require('../models/Subscription');
const Setting = require('../models/Setting');
const User = require('../models/User');
const { cloudinary } = require('../utils/cloudinary');
const sendEmail = require('../utils/sendEmail');

const canManageCourse = (course, user) => {
  if (!user || !course) return false;
  if (user.role === 'admin') return true;
  const teacherId = course.teacher?._id
    ? course.teacher._id.toString()
    : course.teacher?.toString();
  return user.role === 'teacher' && teacherId === user._id.toString();
};

// Cache mémoire pour accélérer drastiquement les requêtes publiques GET /api/courses
let publicCoursesCache = null;
let publicCoursesCacheTime = 0;
const CACHE_TTL_MS = 45 * 1000; // 45 secondes

const invalidateCourseCache = () => {
  publicCoursesCache = null;
  publicCoursesCacheTime = 0;
};

// @desc    Obtenir tous les cours
// @route   GET /api/courses
// @access  Public (filtre automatiquement les brouillons pour le public / élèves)
const getCourses = async (req, res) => {
  try {
    const { subject, level } = req.query;
    const isPublicStudent = !req.user || req.user.role === 'student';
    const isDefaultQuery = isPublicStudent && !subject && !level;

    if (isDefaultQuery && publicCoursesCache && Date.now() - publicCoursesCacheTime < CACHE_TTL_MS) {
      return res.json(publicCoursesCache);
    }

    const query = {};
    if (subject) query.subject = subject;
    if (level) query.level = level;

    if (!req.user || req.user.role === 'student') {
      query.isPublished = { $ne: false };
    } else if (req.user.role === 'teacher') {
      query.$or = [{ isPublished: { $ne: false } }, { teacher: req.user._id }];
    }

    const courses = await Course.find(query).populate('teacher', 'name email avatar bio').lean();
    const courseIds = courses.map((c) => c._id);
    const subCounts = await Subscription.aggregate([
      { $match: { course: { $in: courseIds }, status: 'active', expiresAt: { $gt: new Date() } } },
      { $group: { _id: '$course', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(subCounts.map((s) => [s._id.toString(), s.count]));
    const enriched = courses.map((c) => ({
      ...c,
      isPublished: c.isPublished !== false,
      studentsCount: countMap.get(c._id.toString()) || 0,
      chaptersCount: c.chapters?.length || 0,
    }));

    if (isDefaultQuery) {
      publicCoursesCache = enriched;
      publicCoursesCacheTime = Date.now();
    }

    return res.json(enriched);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Obtenir un cours spécifique par son ID
// @route   GET /api/courses/:id
// @access  Public (infos publiques + titres de chapitres seulement si non inscrit)
const getCourseById = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id).populate('teacher', 'name email avatar bio');
    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    let hasFullAccess = false;

    if (req.user) {
      if (canManageCourse(course, req.user)) {
        hasFullAccess = true;
      } else if (req.user.role === 'student') {
        const activeSub = await Subscription.findOne({
          student: req.user._id,
          course: course._id,
          status: 'active',
          expiresAt: { $gt: new Date() },
        });
        hasFullAccess = Boolean(activeSub);
      }
    }

    // Élève inscrit ou Enseignant/Admin : accès complet
    if (hasFullAccess) {
      const fullDoc = course.toObject();
      fullDoc.isEnrolled = true;
      fullDoc.chapters = (fullDoc.chapters || []).map((ch) => ({
        ...ch,
        isLocked: false,
        isFree: true,
      }));
      return res.json(fullDoc);
    }

    // Visiteur non connecté OU élève non inscrit :
    // Réponse PUBLIQUE : infos cours + chapitres (titres seulement), SANS exposer URLs de vidéos, PDF ou quiz
    const [studentsCount, totalCoursesCount] = await Promise.all([
      Subscription.countDocuments({ course: course._id, status: 'active', expiresAt: { $gt: new Date() } }),
      Course.countDocuments({ isPublished: { $ne: false } }),
    ]);

    // Éventuelle leçon d'aperçu gratuite
    let previewLesson = null;
    for (const ch of (course.chapters || [])) {
      for (const les of (ch.lessons || [])) {
        if (les.isFree || ch.isFree || course.isFree) {
          previewLesson = {
            _id: les._id,
            chapterId: ch._id,
            chapterTitle: ch.title,
            title: les.title,
            contentType: les.contentType,
            youtubeUrl: les.youtubeUrl || '',
            content: les.content || '',
            isFree: true,
          };
          break;
        }
      }
      if (previewLesson) break;
    }

    const publicCourse = {
      _id: course._id,
      title: course.title,
      description: course.description,
      subject: course.subject,
      level: course.level,
      duration: course.duration || '3 mois',
      price: course.price || 0,
      isFree: Boolean(course.isFree || course.price === 0),
      isPublished: course.isPublished !== false,
      originalPrice: course.originalPrice,
      image: course.image,
      teacher: course.teacher,
      studentsCount,
      totalCoursesCount,
      chaptersCount: course.chapters?.length || 0,
      lessonsCount: course.chapters?.reduce((acc, ch) => acc + (ch.lessons?.length || 0), 0) || 0,
      isEnrolled: false,
      previewLesson,
      // Chapitres avec liste publique des leçons (titres, type et aperçu)
      chapters: (course.chapters || []).map((chapter, cIdx) => ({
        _id: chapter._id,
        title: chapter.title,
        order: chapter.order ?? cIdx,
        lessonsCount: chapter.lessons?.length || 0,
        isLocked: !Boolean(chapter.isFree || course.isFree),
        hasPreview: Boolean((chapter.lessons || []).some((les) => les.isFree || chapter.isFree || course.isFree)),
        lessons: (chapter.lessons || []).map((les) => ({
          _id: les._id,
          title: les.title,
          contentType: les.contentType,
          isFree: Boolean(les.isFree || chapter.isFree || course.isFree),
          duration: les.duration || '',
          order: les.order,
        })),
      })),
    };

    return res.json(publicCourse);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Créer un cours (Enseignant ou Administrateur)
// @route   POST /api/courses
// @access  Private/Teacher|Admin
const createCourse = async (req, res) => {
  try {
    const { title, description, subject, level, duration, price, isFree, isPublished, originalPrice, teacherId } = req.body;
    const courseIsFree = isFree === true || isFree === 'true';

    let resolvedTeacherId = req.user._id;
    if (req.user.role === 'admin') {
      if (teacherId) {
        const targetTeacher = await User.findById(teacherId);
        if (targetTeacher && ['teacher', 'admin'].includes(targetTeacher.role)) {
          resolvedTeacherId = targetTeacher._id;
        }
      } else {
        const defaultTeacher = await User.findOne({ role: 'teacher' }).sort({ createdAt: 1 });
        if (defaultTeacher) {
          resolvedTeacherId = defaultTeacher._id;
        }
      }
    }

    const courseData = {
      title,
      description,
      subject,
      level,
      duration: duration || '3 mois',
      price: courseIsFree ? 0 : (price !== undefined && price !== '' ? parseFloat(price) : 6000),
      isFree: courseIsFree,
      isPublished: isPublished === undefined ? true : (isPublished === true || isPublished === 'true'),
      originalPrice: originalPrice ? parseFloat(originalPrice) : 6000,
      teacher: resolvedTeacherId,
    };

    if (req.file) {
      courseData.image = req.file.path;
      courseData.imagePublicId = req.file.filename;
    }

    const course = await Course.create(courseData);
    invalidateCourseCache();
    const populated = await Course.findById(course._id).populate('teacher', 'name email avatar bio');
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mettre à jour un cours
// @route   PUT /api/courses/:id
// @access  Private/Teacher|Admin
const updateCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({ message: 'Non autorisé à modifier ce cours' });
    }

    course.title = req.body.title || course.title;
    course.description = req.body.description || course.description;
    course.subject = req.body.subject || course.subject;
    course.level = req.body.level || course.level;
    course.duration = req.body.duration || course.duration;

    if (req.body.isPublished !== undefined) {
      course.isPublished = req.body.isPublished === true || req.body.isPublished === 'true';
    }

    if (req.user.role === 'admin' && req.body.teacherId) {
      const targetTeacher = await User.findById(req.body.teacherId);
      if (targetTeacher && ['teacher', 'admin'].includes(targetTeacher.role)) {
        course.teacher = targetTeacher._id;
      }
    }

    if (req.body.isFree !== undefined) {
      course.isFree = req.body.isFree === true || req.body.isFree === 'true';
      course.price = course.isFree ? 0 : (req.body.price !== undefined ? parseFloat(req.body.price) : course.price);
    } else if (req.body.price !== undefined) {
      course.price = parseFloat(req.body.price);
    }
    if (req.body.originalPrice !== undefined) course.originalPrice = parseFloat(req.body.originalPrice);

    if (req.file) {
      if (course.imagePublicId) {
        await cloudinary.uploader.destroy(course.imagePublicId);
      }
      course.image = req.file.path;
      course.imagePublicId = req.file.filename;
    }

    const updatedCourse = await course.save();
    invalidateCourseCache();
    const populated = await Course.findById(updatedCourse._id).populate('teacher', 'name email avatar bio');
    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Supprimer un cours
// @route   DELETE /api/courses/:id
// @access  Private/Teacher|Admin
const deleteCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({ message: 'Non autorisé à supprimer ce cours' });
    }

    if (course.imagePublicId) {
      await cloudinary.uploader.destroy(course.imagePublicId);
    }

    for (const chapter of course.chapters) {
      for (const lesson of chapter.lessons) {
        if (lesson.pdfPublicId) {
          await cloudinary.uploader.destroy(lesson.pdfPublicId, { resource_type: 'raw' });
        }
      }
    }

    await course.deleteOne();
    invalidateCourseCache();
    res.json({ message: 'Cours supprimé avec succès' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Ajouter un chapitre à un cours
// @route   POST /api/courses/:id/chapters
// @access  Private/Teacher|Admin
const addChapter = async (req, res) => {
  try {
    const { title, isLocked, isFree } = req.body;
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    // Par défaut, le 1er chapitre d'une matière est gratuit (Freemium)
    const isFirstChapter = (course.chapters || []).length === 0;
    const chapterIsFree = isFree !== undefined ? (isFree === true || isFree === 'true') : isFirstChapter;

    course.chapters.push({
      title,
      isLocked: Boolean(isLocked),
      isFree: chapterIsFree,
      lessons: [],
    });
    await course.save();
    res.status(201).json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Réordonner les chapitres d'un cours
// @route   PUT /api/courses/:id/chapters/reorder
// @access  Private/Teacher|Admin
const reorderChapters = async (req, res) => {
  try {
    const { chapterIds } = req.body;
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Cours non trouvé' });
    if (!canManageCourse(course, req.user)) return res.status(403).json({ message: 'Non autorisé' });

    if (Array.isArray(chapterIds)) {
      const map = new Map(course.chapters.map((c) => [c._id.toString(), c]));
      const reordered = chapterIds.map((cid) => map.get(String(cid))).filter(Boolean);
      const remaining = course.chapters.filter((c) => !chapterIds.includes(c._id.toString()));
      course.chapters = [...reordered, ...remaining];
      await course.save();
    }
    res.json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mettre à jour un chapitre (titre, verrouillage, statut gratuit, ordre des leçons)
// @route   PUT /api/courses/:id/chapters/:chapterId
// @access  Private/Teacher|Admin
const updateChapter = async (req, res) => {
  try {
    const { title, isLocked, isFree, lessonIds } = req.body;
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Cours non trouvé' });
    if (!canManageCourse(course, req.user)) return res.status(403).json({ message: 'Non autorisé' });

    const chapter = course.chapters.id(req.params.chapterId);
    if (!chapter) return res.status(404).json({ message: 'Chapitre non trouvé' });

    if (title !== undefined && String(title).trim()) chapter.title = String(title).trim();
    if (isLocked !== undefined) chapter.isLocked = Boolean(isLocked);
    if (isFree !== undefined) chapter.isFree = isFree === true || isFree === 'true';
    if (Array.isArray(lessonIds)) {
      const map = new Map(chapter.lessons.map((l) => [l._id.toString(), l]));
      const reordered = lessonIds.map((lid) => map.get(String(lid))).filter(Boolean);
      const remaining = chapter.lessons.filter((l) => !lessonIds.includes(l._id.toString()));
      chapter.lessons = [...reordered, ...remaining];
    }

    await course.save();
    res.json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Ajouter une leçon à un chapitre
// @route   POST /api/courses/:id/chapters/:chapterId/lessons
// @access  Private/Teacher|Admin
const addLesson = async (req, res) => {
  try {
    const { title, contentType, youtubeUrl, meetLink, content, isFree } = req.body;
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    if (!canManageCourse(course, req.user)) {
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
      isFree: isFree === true || isFree === 'true',
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

// @desc    Modifier une leçon existante
// @route   PUT /api/courses/:id/chapters/:chapterId/lessons/:lessonId
// @access  Private/Teacher|Admin
const updateLesson = async (req, res) => {
  try {
    const { title, contentType, youtubeUrl, meetLink, content, isFree } = req.body;
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Cours non trouvé' });
    if (!canManageCourse(course, req.user)) return res.status(403).json({ message: 'Non autorisé' });

    const chapter = course.chapters.id(req.params.chapterId);
    if (!chapter) return res.status(404).json({ message: 'Chapitre non trouvé' });

    const lesson = chapter.lessons.id(req.params.lessonId);
    if (!lesson) return res.status(404).json({ message: 'Leçon non trouvée' });

    if (title !== undefined && String(title).trim()) lesson.title = String(title).trim();
    if (contentType !== undefined) lesson.contentType = contentType;
    if (youtubeUrl !== undefined) lesson.youtubeUrl = youtubeUrl;
    if (meetLink !== undefined) lesson.meetLink = meetLink;
    if (content !== undefined) lesson.content = content;
    if (isFree !== undefined) lesson.isFree = isFree === true || isFree === 'true';

    if (req.file) {
      if (lesson.pdfPublicId) {
        await cloudinary.uploader.destroy(lesson.pdfPublicId, { resource_type: 'raw' });
      }
      lesson.pdfPath = req.file.path;
      lesson.pdfPublicId = req.file.filename;
    }

    await course.save();
    res.json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Supprimer un chapitre d'un cours
// @route   DELETE /api/courses/:id/chapters/:chapterId
// @access  Private/Teacher|Admin
const deleteChapter = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    const chapter = course.chapters.id(req.params.chapterId);
    if (!chapter) {
      return res.status(404).json({ message: 'Chapitre non trouvé' });
    }

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
// @access  Private/Teacher|Admin
const deleteLesson = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    if (!canManageCourse(course, req.user)) {
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

// @desc    Publier une annonce à tous les élèves d'un cours
// @route   POST /api/courses/:id/announcements
// @access  Private/Teacher|Admin
const addCourseAnnouncement = async (req, res) => {
  try {
    const { title, message, sendEmailToStudents } = req.body;
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Cours non trouvé' });
    if (!canManageCourse(course, req.user)) return res.status(403).json({ message: 'Non autorisé' });

    if (!title || !message) {
      return res.status(400).json({ message: 'Le titre et le message sont obligatoires.' });
    }

    course.announcements.unshift({ title: title.trim(), message: message.trim() });
    await course.save();

    if (sendEmailToStudents) {
      const subs = await Subscription.find({
        course: course._id,
        status: 'active',
        expiresAt: { $gt: new Date() },
      }).populate('student', 'name email preferences');

      for (const sub of subs) {
        if (sub.student?.email && sub.student?.preferences?.emailNotifications !== false) {
          sendEmail({
            email: sub.student.email,
            subject: `[${course.title}] ${title.trim()}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #009688;border-radius:10px;">
              <h2 style="color:#009688;">Annonce — ${course.title}</h2>
              <p>Bonjour <strong>${sub.student.name}</strong>,</p>
              <h3>${title.trim()}</h3>
              <p style="white-space:pre-line;">${message.trim()}</p>
            </div>`,
          }).catch(() => {});
        }
      }
    }

    res.status(201).json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Supprimer une annonce d'un cours
// @route   DELETE /api/courses/:id/announcements/:annId
// @access  Private/Teacher|Admin
const deleteCourseAnnouncement = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Cours non trouvé' });
    if (!canManageCourse(course, req.user)) return res.status(403).json({ message: 'Non autorisé' });

    course.announcements.pull(req.params.annId);
    await course.save();
    res.json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Inscrire l'élève connecté au cours (un clic)
// @route   POST /api/courses/:id/enroll
// @access  Private/Student
const enrollCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    const globalConfig = await Setting.findOne({ key: 'global_config' });
    const isFree = course.isFree || course.price === 0;
    if (isFree) {
      if (globalConfig?.features?.enableFreeEnrollment === false) {
        return res.status(403).json({
          message: "Les inscriptions gratuites sont actuellement suspendues par l'administrateur.",
        });
      }
    } else {
      if (globalConfig?.features?.enablePayments === false) {
        return res.status(403).json({
          message: "Les paiements et inscriptions payantes sont temporairement suspendus par l'administrateur.",
        });
      }
    }

    const existingSub = await Subscription.findOne({
      student: req.user._id,
      course: course._id,
      status: 'active',
      expiresAt: { $gt: new Date() },
    });

    if (existingSub) {
      return res.json({
        success: true,
        message: 'Vous êtes déjà inscrit à ce cours',
        subscription: existingSub,
      });
    }

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 12);

    const subscription = await Subscription.create({
      student: req.user._id,
      course: course._id,
      paymentMethod: course.price > 0 ? 'Inscription directe' : 'Gratuit',
      transactionId: `ENROLL-${Date.now()}`,
      amount: course.price || 0,
      expiresAt,
      status: 'active',
    });

    return res.status(201).json({
      success: true,
      message: 'Inscription au cours réussie !',
      subscription,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Obtenir le contenu d'une leçon (vérification token JWT valide + inscription au cours sauf si leçon d'aperçu gratuit)
// @route   GET /api/courses/:id/chapters/:chapterId/lessons/:lessonId
// @access  Public si gratuit/aperçu, sinon Private (401 si non connecté, 403 si non inscrit)
const getLessonContent = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Cours non trouvé' });

    const chapterIndex = (course.chapters || []).findIndex(
      (ch) => String(ch._id) === String(req.params.chapterId)
    );
    if (chapterIndex === -1) {
      return res.status(404).json({ message: 'Chapitre non trouvé' });
    }
    const chapter = course.chapters[chapterIndex];
    const lesson = chapter.lessons.id(req.params.lessonId);
    if (!lesson) {
      return res.status(404).json({ message: 'Leçon non trouvée' });
    }

    const isContentFree = Boolean(lesson.isFree || chapter.isFree || course.isFree);
    const isStaff = req.user ? canManageCourse(course, req.user) : false;

    if (!isStaff && !isContentFree) {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentification requise pour accéder à cette leçon' });
      }
      const activeSub = await Subscription.findOne({
        student: req.user._id,
        course: course._id,
        status: 'active',
        expiresAt: { $gt: new Date() },
      });
      if (!activeSub) {
        return res.status(403).json({
          message: 'Accès réservé. Vous devez être inscrit à ce cours pour accéder aux contenus des leçons.',
        });
      }
    }

    return res.json(lesson);

    return res.json(lesson);
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
  reorderChapters,
  updateChapter,
  addLesson,
  updateLesson,
  deleteChapter,
  deleteLesson,
  addCourseAnnouncement,
  deleteCourseAnnouncement,
  getLessonContent,
  enrollCourse,
};
