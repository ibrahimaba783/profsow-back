const Course = require('../models/Course');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const { cloudinary } = require('../utils/cloudinary');

const canManageCourse = (course, user) => {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.role === 'teacher' && course.teacher.toString() === user._id.toString();
};

// @desc    Obtenir tous les cours
// @route   GET /api/courses
// @access  Public
const getCourses = async (req, res) => {
  try {
    const { subject, level } = req.query;
    const query = {};
    if (subject) query.subject = subject;
    if (level) query.level = level;

    const courses = await Course.find(query).populate('teacher', 'name email avatar bio').lean();
    const courseIds = courses.map((c) => c._id);
    const subCounts = await Subscription.aggregate([
      { $match: { course: { $in: courseIds }, status: 'active', expiresAt: { $gt: new Date() } } },
      { $group: { _id: '$course', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(subCounts.map((s) => [s._id.toString(), s.count]));
    const enriched = courses.map((c) => ({
      ...c,
      studentsCount: countMap.get(c._id.toString()) || 0,
      chaptersCount: c.chapters?.length || 0,
    }));
    return res.json(enriched);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Obtenir un cours spécifique par son ID
// @route   GET /api/courses/:id
// @access  Public (contenu complet uniquement si admin, prof propriétaire ou élève abonné)
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
        hasFullAccess = !!activeSub;
      }
    }

    if (hasFullAccess) {
      return res.json(course);
    }

    const [studentsCount, totalCoursesCount] = await Promise.all([
      Subscription.countDocuments({ course: course._id, status: 'active', expiresAt: { $gt: new Date() } }),
      Course.countDocuments(),
    ]);

    const publicCourse = {
      _id: course._id,
      title: course.title,
      description: course.description,
      subject: course.subject,
      level: course.level,
      duration: course.duration,
      price: course.price,
      isFree: course.isFree,
      originalPrice: course.originalPrice,
      image: course.image,
      teacher: course.teacher,
      studentsCount,
      totalCoursesCount,
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

// @desc    Créer un cours (Enseignant ou Administrateur)
// @route   POST /api/courses
// @access  Private/Teacher|Admin
const createCourse = async (req, res) => {
  try {
    const { title, description, subject, level, duration, price, isFree, originalPrice, teacherId } = req.body;
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
      originalPrice: originalPrice ? parseFloat(originalPrice) : 6000,
      teacher: resolvedTeacherId,
    };

    if (req.file) {
      courseData.image = req.file.path;
      courseData.imagePublicId = req.file.filename;
    }

    const course = await Course.create(courseData);
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
    const { title } = req.body;
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    if (!canManageCourse(course, req.user)) {
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
// @access  Private/Teacher|Admin
const addLesson = async (req, res) => {
  try {
    const { title, contentType, youtubeUrl, meetLink, content } = req.body;
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
