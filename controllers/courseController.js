const Course = require('../models/Course');
const Subscription = require('../models/Subscription');
const { cloudinary } = require('../utils/cloudinary');

// @desc    Obtenir tous les cours publics
// @route   GET /api/courses
// @access  Public
const getCourses = async (req, res) => {
  try {
    const { subject, level } = req.query;
    const query = { isActive: { $ne: false } };
    if (subject && subject !== 'Tous') query.subject = subject;
    if (level && level !== 'Tous') query.level = level;

    const courses = await Course.find(query)
      .populate('teacher', 'name email avatar bio')
      .sort({ order: 1, createdAt: -1 });

    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Obtenir les cours pour l'espace de gestion (Back Office)
//          - Admin : voit TOUS les modules
//          - Teacher : voit UNIQUEMENT ses modules assignés
// @route   GET /api/courses/manage
// @access  Private (Admin / Teacher)
const getManageCourses = async (req, res) => {
  try {
    const query = {};
    if (req.user.role === 'teacher') {
      query.teacher = req.user._id;
    }

    const courses = await Course.find(query)
      .populate('teacher', 'name email avatar bio')
      .sort({ order: 1, createdAt: -1 });

    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Obtenir un cours spécifique par son ID
// @route   GET /api/courses/:id
// @access  Public (contenu complet pour Admin, prof assigné ou élève abonné)
const getCourseById = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id).populate('teacher', 'name email avatar bio');
    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    let hasFullAccess = false;

    if (req.user) {
      // L'admin a accès complet à tout
      if (req.user.role === 'admin') {
        hasFullAccess = true;
      } else if (req.user.role === 'teacher') {
        // Le prof a accès complet à ses propres modules
        const isOwnerTeacher =
          course.teacher && course.teacher._id.toString() === req.user._id.toString();
        hasFullAccess = isOwnerTeacher;
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

    // Accès restreint pour visiteur ou élève non abonné : sommaire public
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
      isActive: course.isActive,
      order: course.order,
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

// @desc    Créer un cours (ADMIN SEULEMENT)
// @route   POST /api/courses
// @access  Private/Admin
const createCourse = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'Accès refusé. Seul un administrateur peut créer de nouveaux modules.',
      });
    }

    const {
      title,
      description,
      subject,
      level,
      duration,
      price,
      isFree,
      originalPrice,
      teacher,
      order,
    } = req.body;

    const courseIsFree = isFree === true || isFree === 'true';

    // Assigner le professeur : soit celui choisi par l'admin, soit l'admin lui-même
    const assignedTeacher = teacher || req.user._id;

    const courseData = {
      title,
      description,
      subject,
      level,
      duration: duration || '3 mois',
      price: courseIsFree ? 0 : (price ? parseFloat(price) : 6000),
      isFree: courseIsFree,
      originalPrice: originalPrice ? parseFloat(originalPrice) : 6000,
      teacher: assignedTeacher,
      isActive: true,
      order: order ? parseInt(order, 10) : 0,
    };

    if (req.file) {
      courseData.image = req.file.path;
      courseData.imagePublicId = req.file.filename;
    }

    const course = await Course.create(courseData);
    const populated = await Course.findById(course._id).populate('teacher', 'name email avatar');
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mettre à jour un cours
//          - Admin : peut tout modifier (métadonnées, tarifs, prof assigné, statut, ordre)
//          - Teacher : peut modifier uniquement ses modules assignés (titre, description, durée)
// @route   PUT /api/courses/:id
// @access  Private/Admin ou Private/Teacher (sur son cours)
const updateCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    const isAdmin = req.user.role === 'admin';
    const isAssignedTeacher = course.teacher.toString() === req.user._id.toString();

    if (!isAdmin && !isAssignedTeacher) {
      return res.status(403).json({ message: 'Non autorisé à modifier ce cours' });
    }

    course.title = req.body.title || course.title;
    course.description = req.body.description || course.description;
    course.subject = req.body.subject || course.subject;
    course.level = req.body.level || course.level;
    course.duration = req.body.duration || course.duration;

    // Seul l'admin peut modifier les tarifs et promotions
    if (isAdmin) {
      if (req.body.isFree !== undefined) {
        course.isFree = req.body.isFree === true || req.body.isFree === 'true';
        course.price = course.isFree
          ? 0
          : req.body.price !== undefined
          ? parseFloat(req.body.price)
          : course.price;
      } else if (req.body.price !== undefined) {
        course.price = parseFloat(req.body.price);
      }
      if (req.body.originalPrice !== undefined) course.originalPrice = parseFloat(req.body.originalPrice);

      // Seul l'admin peut réassigner le professeur ou modifier le statut/ordre
      if (req.body.teacher) course.teacher = req.body.teacher;
      if (req.body.isActive !== undefined) course.isActive = req.body.isActive === true || req.body.isActive === 'true';
      if (req.body.order !== undefined) course.order = parseInt(req.body.order, 10);
    }

    if (req.file) {
      if (course.imagePublicId) {
        await cloudinary.uploader.destroy(course.imagePublicId);
      }
      course.image = req.file.path;
      course.imagePublicId = req.file.filename;
    }

    const updatedCourse = await course.save();
    const populated = await Course.findById(updatedCourse._id).populate('teacher', 'name email avatar');
    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Supprimer un cours (ADMIN SEULEMENT)
// @route   DELETE /api/courses/:id
// @access  Private/Admin
const deleteCourse = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'Accès refusé. Seul un administrateur peut supprimer un module.',
      });
    }

    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
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

// @desc    Assigner un module à un professeur (ADMIN SEULEMENT)
// @route   PATCH /api/courses/:id/assign
// @access  Private/Admin
const assignCourseTeacher = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Seul un administrateur peut assigner un module.' });
    }

    const { teacherId } = req.body;
    if (!teacherId) {
      return res.status(400).json({ message: 'Identifiant du professeur obligatoire' });
    }

    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    course.teacher = teacherId;
    await course.save();

    const populated = await Course.findById(course._id).populate('teacher', 'name email avatar bio');
    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Activer ou désactiver un module (ADMIN SEULEMENT)
// @route   PATCH /api/courses/:id/status
// @access  Private/Admin
const toggleCourseStatus = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Seul un administrateur peut modifier le statut.' });
    }

    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    course.isActive = req.body.isActive !== undefined ? req.body.isActive : !course.isActive;
    await course.save();

    res.json({ _id: course._id, isActive: course.isActive });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Réordonner les modules (ADMIN SEULEMENT)
// @route   PUT /api/courses/reorder
// @access  Private/Admin
const reorderCourses = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Seul un administrateur peut réordonner les modules.' });
    }

    const { orderList } = req.body; // [{ id: '...', order: 0 }, ...]
    if (!Array.isArray(orderList)) {
      return res.status(400).json({ message: 'Liste de réordonnancement invalide' });
    }

    const bulkOps = orderList.map((item, index) => ({
      updateOne: {
        filter: { _id: item.id || item._id },
        update: { $set: { order: item.order !== undefined ? item.order : index } },
      },
    }));

    if (bulkOps.length > 0) {
      await Course.bulkWrite(bulkOps);
    }

    const updated = await Course.find()
      .populate('teacher', 'name email avatar')
      .sort({ order: 1 });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Ajouter un chapitre (Admin ou Professeur assigné)
// @route   POST /api/courses/:id/chapters
// @access  Private (Admin / Teacher assigné)
const addChapter = async (req, res) => {
  try {
    const { title } = req.body;
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    const isAdmin = req.user.role === 'admin';
    const isAssigned = course.teacher.toString() === req.user._id.toString();

    if (!isAdmin && !isAssigned) {
      return res.status(403).json({
        message: 'Accès refusé. Vous ne pouvez modifier que les modules qui vous sont assignés.',
      });
    }

    course.chapters.push({ title, lessons: [] });
    await course.save();
    res.status(201).json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Ajouter une leçon (Admin ou Professeur assigné)
// @route   POST /api/courses/:id/chapters/:chapterId/lessons
// @access  Private (Admin / Teacher assigné)
const addLesson = async (req, res) => {
  try {
    const { title, contentType, youtubeUrl, meetLink, content } = req.body;
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    const isAdmin = req.user.role === 'admin';
    const isAssigned = course.teacher.toString() === req.user._id.toString();

    if (!isAdmin && !isAssigned) {
      return res.status(403).json({
        message: 'Accès refusé. Vous ne pouvez modifier que les modules qui vous sont assignés.',
      });
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

// @desc    Supprimer un chapitre (Admin ou Professeur assigné)
// @route   DELETE /api/courses/:id/chapters/:chapterId
// @access  Private (Admin / Teacher assigné)
const deleteChapter = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    const isAdmin = req.user.role === 'admin';
    const isAssigned = course.teacher.toString() === req.user._id.toString();

    if (!isAdmin && !isAssigned) {
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

// @desc    Supprimer une leçon (Admin ou Professeur assigné)
// @route   DELETE /api/courses/:id/chapters/:chapterId/lessons/:lessonId
// @access  Private (Admin / Teacher assigné)
const deleteLesson = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    const isAdmin = req.user.role === 'admin';
    const isAssigned = course.teacher.toString() === req.user._id.toString();

    if (!isAdmin && !isAssigned) {
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
  getManageCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  assignCourseTeacher,
  toggleCourseStatus,
  reorderCourses,
  addChapter,
  addLesson,
  deleteChapter,
  deleteLesson,
};
