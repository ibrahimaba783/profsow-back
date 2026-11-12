const Exercise = require('../models/Exercise');
const ExerciseSubmission = require('../models/ExerciseSubmission');
const Course = require('../models/Course');
const Subscription = require('../models/Subscription');
const { cloudinary } = require('../utils/cloudinary');

const canManageCourse = (course, user) =>
  Boolean(user && course && (user.role === 'admin' || course.teacher.toString() === user._id.toString()));

const destroyAssetIfAny = async (publicId, isPdf = false) => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, isPdf ? { resource_type: 'raw' } : {});
  } catch (err) {
    console.error('Erreur suppression Cloudinary:', err.message);
  }
};

const isCorrectionVisibleForStudent = (exercise, submission) => {
  if (!exercise) return false;
  if (exercise.correctionVisibility === 'immediate') return true;
  if (exercise.correctionVisibility === 'after_deadline') {
    return Boolean(exercise.deadline && new Date() >= new Date(exercise.deadline));
  }
  if (exercise.correctionVisibility === 'after_attempt') {
    return Boolean(submission);
  }
  return false;
};

// @desc    Obtenir les exercices d'un cours (filtrés selon abonnement et visibilité de correction)
// @route   GET /api/exercises/course/:courseId
// @access  Public (aperçu) / Private (contenu complet)
const getExercisesByCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) return res.status(404).json({ message: 'Cours non trouvé' });

    const isStaff = canManageCourse(course, req.user);
    let isSubscribed = false;

    if (!isStaff && req.user && req.user.role === 'student') {
      const activeSub = await Subscription.findOne({
        student: req.user._id,
        course: course._id,
        status: 'active',
        expiresAt: { $gt: new Date() },
      });
      isSubscribed = Boolean(activeSub);
    }

    const exercises = await Exercise.find({ course: course._id }).sort({ order: 1, createdAt: 1 }).lean();

    if (isStaff) {
      const subs = await ExerciseSubmission.find({ course: course._id }).lean();
      const result = exercises.map((ex) => {
        const exSubs = subs.filter((s) => s.exercise.toString() === ex._id.toString());
        const passedCount = exSubs.filter((s) => s.isPassed).length;
        return {
          ...ex,
          correctionAvailable: true,
          submissionsCount: exSubs.length,
          passedCount,
        };
      });
      return res.json(result);
    }

    let mySubMap = new Map();
    if (isSubscribed && req.user) {
      const mySubs = await ExerciseSubmission.find({
        course: course._id,
        student: req.user._id,
      }).lean();
      mySubMap = new Map(mySubs.map((s) => [s.exercise.toString(), s]));
    }

    const sanitized = exercises.map((ex) => {
      const lockedForVisitor = ex.subscribersOnly !== false && !isSubscribed;
      if (lockedForVisitor) {
        return {
          _id: ex._id,
          course: ex.course,
          chapterId: ex.chapterId,
          chapterTitle: ex.chapterTitle,
          title: ex.title,
          exerciseType: ex.exerciseType,
          difficulty: ex.difficulty,
          isRequired: ex.isRequired,
          subscribersOnly: ex.subscribersOnly,
          deadline: ex.deadline,
          locked: true,
          correctionAvailable: false,
        };
      }

      const mySubmission = mySubMap.get(ex._id.toString()) || null;
      const canSeeCorrection = isCorrectionVisibleForStudent(ex, mySubmission);

      return {
        ...ex,
        locked: false,
        correctionAvailable: canSeeCorrection,
        correctionText: canSeeCorrection ? ex.correctionText : '',
        correctionPdf: canSeeCorrection ? ex.correctionPdf : '',
        correctionVideoUrl: canSeeCorrection ? ex.correctionVideoUrl : '',
        mySubmission,
      };
    });

    res.json(sanitized);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Obtenir tous les exercices & devoirs rendus pour le professeur
// @route   GET /api/exercises/teacher/all
// @access  Private/Teacher|Admin
const getTeacherExercisesAndSubmissions = async (req, res) => {
  try {
    const courses =
      req.user.role === 'admin'
        ? await Course.find().select('_id title subject level chapters')
        : await Course.find({ teacher: req.user._id }).select('_id title subject level chapters');

    const courseIds = courses.map((c) => c._id);

    const [exercises, submissions] = await Promise.all([
      Exercise.find({ course: { $in: courseIds } })
        .populate('course', 'title subject level')
        .sort({ createdAt: -1 })
        .lean(),
      ExerciseSubmission.find({ course: { $in: courseIds } })
        .populate('student', 'name email avatar')
        .populate('course', 'title')
        .populate('exercise', 'title exerciseType difficulty deadline chapterTitle')
        .sort({ submittedAt: -1 })
        .lean(),
    ]);

    const enrichedExercises = exercises.map((ex) => {
      const exSubs = submissions.filter(
        (s) => s.exercise && s.exercise._id.toString() === ex._id.toString()
      );
      const passedCount = exSubs.filter((s) => s.isPassed).length;
      return {
        ...ex,
        submissionsCount: exSubs.length,
        passedCount,
        successRate: exSubs.length > 0 ? Math.round((passedCount / exSubs.length) * 100) : 0,
      };
    });

    res.json({ exercises: enrichedExercises, submissions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Créer un exercice (rattaché à un module ou un chapitre)
// @route   POST /api/exercises
// @access  Private/Teacher|Admin
const createExercise = async (req, res) => {
  try {
    const {
      courseId,
      chapterId,
      title,
      exerciseType,
      difficulty,
      statementText,
      hints,
      correctionText,
      correctionVideoUrl,
      correctionVisibility,
      deadline,
      isRequired,
      subscribersOnly,
    } = req.body;

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: 'Cours non trouvé' });
    if (!canManageCourse(course, req.user)) return res.status(403).json({ message: 'Non autorisé' });

    const targetChapter = chapterId ? course.chapters.id(chapterId) : null;
    const files = req.files || {};

    const exerciseData = {
      course: course._id,
      chapterId: targetChapter ? targetChapter._id.toString() : '',
      chapterTitle: targetChapter ? targetChapter.title : '',
      title: String(title || '').trim(),
      exerciseType: ['application', 'probleme', 'devoir', 'annale'].includes(exerciseType)
        ? exerciseType
        : 'application',
      difficulty: ['facile', 'moyen', 'difficile'].includes(difficulty) ? difficulty : 'moyen',
      statementText: statementText || '',
      hints: hints || '',
      correctionText: correctionText || '',
      correctionVideoUrl: correctionVideoUrl || '',
      correctionVisibility: ['immediate', 'after_deadline', 'after_attempt'].includes(correctionVisibility)
        ? correctionVisibility
        : 'after_attempt',
      deadline: deadline ? new Date(deadline) : null,
      isRequired: isRequired === undefined ? true : isRequired === true || isRequired === 'true',
      subscribersOnly:
        subscribersOnly === undefined ? true : subscribersOnly === true || subscribersOnly === 'true',
    };

    if (files.statementImage?.[0]) {
      exerciseData.statementImage = files.statementImage[0].path;
      exerciseData.statementImagePublicId = files.statementImage[0].filename;
    }
    if (files.statementPdf?.[0]) {
      exerciseData.statementPdf = files.statementPdf[0].path;
      exerciseData.statementPdfPublicId = files.statementPdf[0].filename;
    }
    if (files.correctionPdf?.[0]) {
      exerciseData.correctionPdf = files.correctionPdf[0].path;
      exerciseData.correctionPdfPublicId = files.correctionPdf[0].filename;
    }

    const exercise = await Exercise.create(exerciseData);
    const populated = await exercise.populate('course', 'title subject level');
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mettre à jour un exercice
// @route   PUT /api/exercises/:id
// @access  Private/Teacher|Admin
const updateExercise = async (req, res) => {
  try {
    const exercise = await Exercise.findById(req.params.id);
    if (!exercise) return res.status(404).json({ message: 'Exercice non trouvé' });

    const course = await Course.findById(exercise.course);
    if (!canManageCourse(course, req.user)) return res.status(403).json({ message: 'Non autorisé' });

    const {
      chapterId,
      title,
      exerciseType,
      difficulty,
      statementText,
      hints,
      correctionText,
      correctionVideoUrl,
      correctionVisibility,
      deadline,
      isRequired,
      subscribersOnly,
    } = req.body;

    if (title !== undefined && String(title).trim()) exercise.title = String(title).trim();
    if (chapterId !== undefined) {
      const targetChapter = chapterId ? course.chapters.id(chapterId) : null;
      exercise.chapterId = targetChapter ? targetChapter._id.toString() : '';
      exercise.chapterTitle = targetChapter ? targetChapter.title : '';
    }
    if (['application', 'probleme', 'devoir', 'annale'].includes(exerciseType)) {
      exercise.exerciseType = exerciseType;
    }
    if (['facile', 'moyen', 'difficile'].includes(difficulty)) {
      exercise.difficulty = difficulty;
    }
    if (statementText !== undefined) exercise.statementText = statementText;
    if (hints !== undefined) exercise.hints = hints;
    if (correctionText !== undefined) exercise.correctionText = correctionText;
    if (correctionVideoUrl !== undefined) exercise.correctionVideoUrl = correctionVideoUrl;
    if (['immediate', 'after_deadline', 'after_attempt'].includes(correctionVisibility)) {
      exercise.correctionVisibility = correctionVisibility;
    }
    if (deadline !== undefined) exercise.deadline = deadline ? new Date(deadline) : null;
    if (isRequired !== undefined) {
      exercise.isRequired = isRequired === true || isRequired === 'true';
    }
    if (subscribersOnly !== undefined) {
      exercise.subscribersOnly = subscribersOnly === true || subscribersOnly === 'true';
    }

    const files = req.files || {};
    if (files.statementImage?.[0]) {
      await destroyAssetIfAny(exercise.statementImagePublicId, false);
      exercise.statementImage = files.statementImage[0].path;
      exercise.statementImagePublicId = files.statementImage[0].filename;
    }
    if (files.statementPdf?.[0]) {
      await destroyAssetIfAny(exercise.statementPdfPublicId, true);
      exercise.statementPdf = files.statementPdf[0].path;
      exercise.statementPdfPublicId = files.statementPdf[0].filename;
    }
    if (files.correctionPdf?.[0]) {
      await destroyAssetIfAny(exercise.correctionPdfPublicId, true);
      exercise.correctionPdf = files.correctionPdf[0].path;
      exercise.correctionPdfPublicId = files.correctionPdf[0].filename;
    }

    await exercise.save();
    await exercise.populate('course', 'title subject level');
    res.json(exercise);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Supprimer un exercice et ses copies
// @route   DELETE /api/exercises/:id
// @access  Private/Teacher|Admin
const deleteExercise = async (req, res) => {
  try {
    const exercise = await Exercise.findById(req.params.id);
    if (!exercise) return res.status(404).json({ message: 'Exercice non trouvé' });

    const course = await Course.findById(exercise.course);
    if (!canManageCourse(course, req.user)) return res.status(403).json({ message: 'Non autorisé' });

    await destroyAssetIfAny(exercise.statementImagePublicId, false);
    await destroyAssetIfAny(exercise.statementPdfPublicId, true);
    await destroyAssetIfAny(exercise.correctionPdfPublicId, true);

    const subs = await ExerciseSubmission.find({ exercise: exercise._id });
    for (const s of subs) {
      if (s.filePublicId) {
        await destroyAssetIfAny(s.filePublicId, s.fileType === 'pdf');
      }
    }

    await ExerciseSubmission.deleteMany({ exercise: exercise._id });
    await exercise.deleteOne();
    res.json({ message: 'Exercice supprimé avec succès' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Soumettre une tentative ou déposer une copie de devoir (élève)
// @route   POST /api/exercises/:id/submit
// @access  Private
const submitExerciseWork = async (req, res) => {
  try {
    const exercise = await Exercise.findById(req.params.id);
    if (!exercise) return res.status(404).json({ message: 'Exercice non trouvé' });

    const course = await Course.findById(exercise.course);
    const isStaff = canManageCourse(course, req.user);

    if (!isStaff && exercise.subscribersOnly !== false) {
      const activeSub = await Subscription.findOne({
        student: req.user._id,
        course: exercise.course,
        status: 'active',
        expiresAt: { $gt: new Date() },
      });
      if (!activeSub) {
        return res.status(403).json({ message: 'Abonnement actif requis pour cet exercice.' });
      }
    }

    let submission = await ExerciseSubmission.findOne({
      exercise: exercise._id,
      student: req.user._id,
    });

    const answerText = req.body.answerText !== undefined ? String(req.body.answerText) : submission?.answerText || '';
    const selfPassed =
      req.body.isPassed !== undefined
        ? req.body.isPassed === true || req.body.isPassed === 'true'
        : submission?.isPassed || false;

    const updateFields = {
      exercise: exercise._id,
      course: exercise.course,
      student: req.user._id,
      answerText,
      submittedAt: new Date(),
    };

    if (req.file) {
      if (submission?.filePublicId) {
        await destroyAssetIfAny(submission.filePublicId, submission.fileType === 'pdf');
      }
      const isPdf = req.file.mimetype === 'application/pdf' || /\.pdf$/i.test(req.file.originalname || '');
      updateFields.fileUrl = req.file.path;
      updateFields.filePublicId = req.file.filename;
      updateFields.fileType = isPdf ? 'pdf' : 'image';
      updateFields.status = 'submitted';
    } else if (exercise.exerciseType === 'devoir' && answerText.trim()) {
      updateFields.status = 'submitted';
    } else {
      updateFields.status = submission?.status === 'graded' ? 'graded' : 'attempted';
    }

    if (exercise.exerciseType !== 'devoir') {
      updateFields.isPassed = selfPassed;
    }

    submission = await ExerciseSubmission.findOneAndUpdate(
      { exercise: exercise._id, student: req.user._id },
      { $set: updateFields },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const canSeeCorrection = isStaff || isCorrectionVisibleForStudent(exercise, submission);
    res.json({
      submission,
      correctionAvailable: canSeeCorrection,
      correctionText: canSeeCorrection ? exercise.correctionText : '',
      correctionPdf: canSeeCorrection ? exercise.correctionPdf : '',
      correctionVideoUrl: canSeeCorrection ? exercise.correctionVideoUrl : '',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Corriger la copie d'un élève (note + commentaire)
// @route   PUT /api/exercises/submissions/:subId/grade
// @access  Private/Teacher|Admin
const gradeExerciseSubmission = async (req, res) => {
  try {
    const submission = await ExerciseSubmission.findById(req.params.subId);
    if (!submission) return res.status(404).json({ message: 'Copie non trouvée' });

    const course = await Course.findById(submission.course);
    if (!canManageCourse(course, req.user)) return res.status(403).json({ message: 'Non autorisé' });

    const { grade, teacherComment, isPassed } = req.body;
    const numericGrade = grade !== undefined && grade !== '' && grade !== null ? Number(grade) : null;

    submission.grade = numericGrade;
    if (teacherComment !== undefined) submission.teacherComment = String(teacherComment).trim();
    submission.isPassed =
      isPassed !== undefined
        ? Boolean(isPassed)
        : numericGrade !== null
        ? numericGrade >= 10
        : true;
    submission.status = 'graded';
    submission.gradedAt = new Date();

    await submission.save();
    await submission.populate('student', 'name email avatar');
    await submission.populate('course', 'title');
    await submission.populate('exercise', 'title exerciseType difficulty deadline chapterTitle');

    res.json(submission);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getExercisesByCourse,
  getTeacherExercisesAndSubmissions,
  createExercise,
  updateExercise,
  deleteExercise,
  submitExerciseWork,
  gradeExerciseSubmission,
};
