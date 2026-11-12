const Quiz = require('../models/Quiz');
const QuizResult = require('../models/QuizResult');
const Course = require('../models/Course');

const canManageCourse = (course, user) =>
  user.role === 'admin' || (course && course.teacher.toString() === user._id.toString());

const normalizeQuestions = (questions = []) =>
  (Array.isArray(questions) ? questions : []).map((q) => {
    const qType = ['qcm', 'true_false', 'text'].includes(q.questionType) ? q.questionType : 'qcm';
    if (qType === 'true_false') {
      return {
        questionText: q.questionText,
        questionType: 'true_false',
        options: ['Vrai', 'Faux'],
        correctAnswerIndex: Number(q.correctAnswerIndex) === 1 ? 1 : 0,
        correctAnswerText: Number(q.correctAnswerIndex) === 1 ? 'Faux' : 'Vrai',
      };
    }
    if (qType === 'text') {
      return {
        questionText: q.questionText,
        questionType: 'text',
        options: [],
        correctAnswerIndex: 0,
        correctAnswerText: String(q.correctAnswerText || '').trim(),
      };
    }
    return {
      questionText: q.questionText,
      questionType: 'qcm',
      options: Array.isArray(q.options) ? q.options : ['', ''],
      correctAnswerIndex: Number(q.correctAnswerIndex) || 0,
      correctAnswerText: '',
    };
  });

// @desc    Créer un quiz (Enseignant ou Admin)
// @route   POST /api/quizzes
// @access  Private/Teacher|Admin
const createQuiz = async (req, res) => {
  try {
    const { courseId, title, questions, chapterId, chapterTitle, passingScore, maxAttempts } = req.body;

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Cours non trouvé' });
    }

    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    const quiz = await Quiz.create({
      course: courseId,
      title,
      chapterId: chapterId || '',
      chapterTitle: chapterTitle || '',
      passingScore: passingScore !== undefined ? Number(passingScore) : 50,
      maxAttempts: maxAttempts !== undefined ? Number(maxAttempts) : 0,
      questions: normalizeQuestions(questions),
    });

    const populated = await quiz.populate('course', 'title subject level');
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Obtenir les quiz d'un cours
// @route   GET /api/quizzes/course/:courseId
// @access  Private
const getQuizzesByCourse = async (req, res) => {
  try {
    const quizzes = await Quiz.find({ course: req.params.courseId });
    res.json(quizzes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Obtenir tous les quiz créés pour les cours du professeur
// @route   GET /api/quizzes/teacher/all
// @access  Private/Teacher|Admin
const getTeacherQuizzes = async (req, res) => {
  try {
    const courses = req.user.role === 'admin'
      ? await Course.find().select('_id title subject level')
      : await Course.find({ teacher: req.user._id }).select('_id title subject level');
    const courseIds = courses.map((c) => c._id);

    const quizzes = await Quiz.find({ course: { $in: courseIds } })
      .populate('course', 'title subject level')
      .sort({ createdAt: -1 });
    res.json(quizzes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Obtenir les détails d'un quiz
// @route   GET /api/quizzes/:id
// @access  Private
const getQuizById = async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz non trouvé' });
    }
    res.json(quiz);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Soumettre les réponses d'un quiz et calculer le score
// @route   POST /api/quizzes/:id/submit
// @access  Private
const submitQuizResponse = async (req, res) => {
  try {
    const { answers = {} } = req.body;
    const quiz = await Quiz.findById(req.params.id);

    if (!quiz) {
      return res.status(404).json({ message: 'Quiz non trouvé' });
    }

    if (quiz.maxAttempts > 0 && req.user.role === 'student') {
      const attemptCount = await QuizResult.countDocuments({
        student: req.user._id,
        quiz: quiz._id,
      });
      if (attemptCount >= quiz.maxAttempts) {
        return res.status(400).json({
          message: `Vous avez atteint le nombre maximal de tentatives (${quiz.maxAttempts}) pour ce quiz.`,
        });
      }
    }

    let score = 0;
    const totalQuestions = quiz.questions.length;

    quiz.questions.forEach((question, index) => {
      const userAnswer = answers[index];
      if (userAnswer === undefined || userAnswer === null) return;

      if (question.questionType === 'text') {
        const expected = String(question.correctAnswerText || '').trim().toLowerCase();
        const actual = String(userAnswer).trim().toLowerCase();
        if (expected && actual === expected) {
          score++;
        }
      } else {
        if (Number(userAnswer) === Number(question.correctAnswerIndex)) {
          score++;
        }
      }
    });

    const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
    const passed = percentage >= (quiz.passingScore ?? 50);

    const result = await QuizResult.create({
      student: req.user._id,
      quiz: req.params.id,
      score,
      totalQuestions,
      passed,
      answers,
    });

    res.status(201).json({
      result,
      score,
      totalQuestions,
      percentage,
      passed,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Obtenir tous les résultats des étudiants (Enseignant ou Admin)
// @route   GET /api/quizzes/teacher/results
// @access  Private/Teacher|Admin
const getTeacherQuizResults = async (req, res) => {
  try {
    const courses = req.user.role === 'admin'
      ? await Course.find()
      : await Course.find({ teacher: req.user._id });
    const courseIds = courses.map((c) => c._id);

    const quizzes = await Quiz.find({ course: { $in: courseIds } });
    const quizIds = quizzes.map((q) => q._id);

    const results = await QuizResult.find({ quiz: { $in: quizIds } })
      .populate('student', 'name email avatar')
      .populate({
        path: 'quiz',
        select: 'title course passingScore',
        populate: { path: 'course', select: 'title' },
      });

    res.json(results);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Obtenir les résultats de l'étudiant connecté
// @route   GET /api/quizzes/student/results
// @access  Private
const getStudentQuizResults = async (req, res) => {
  try {
    const results = await QuizResult.find({ student: req.user._id })
      .populate({
        path: 'quiz',
        select: 'title course passingScore',
        populate: { path: 'course', select: 'title' },
      });
    res.json(results);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Modifier un quiz (Enseignant propriétaire ou Admin)
// @route   PUT /api/quizzes/:id
// @access  Private/Teacher|Admin
const updateQuiz = async (req, res) => {
  try {
    const { title, questions, chapterId, chapterTitle, passingScore, maxAttempts } = req.body;
    const quiz = await Quiz.findById(req.params.id).populate('course', 'teacher');

    if (!quiz) {
      return res.status(404).json({ message: 'Quiz non trouvé' });
    }

    if (!canManageCourse(quiz.course, req.user)) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    if (title !== undefined) quiz.title = title;
    if (chapterId !== undefined) quiz.chapterId = chapterId;
    if (chapterTitle !== undefined) quiz.chapterTitle = chapterTitle;
    if (passingScore !== undefined) quiz.passingScore = Number(passingScore);
    if (maxAttempts !== undefined) quiz.maxAttempts = Number(maxAttempts);
    if (questions !== undefined) quiz.questions = normalizeQuestions(questions);

    await quiz.save();
    await quiz.populate('course', 'title subject level');
    res.json(quiz);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Supprimer un quiz (Enseignant propriétaire ou Admin)
// @route   DELETE /api/quizzes/:id
// @access  Private/Teacher|Admin
const deleteQuiz = async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id).populate('course', 'teacher');

    if (!quiz) {
      return res.status(404).json({ message: 'Quiz non trouvé' });
    }

    if (!canManageCourse(quiz.course, req.user)) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    await QuizResult.deleteMany({ quiz: quiz._id });
    await quiz.deleteOne();

    res.json({ message: 'Quiz supprimé avec succès' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createQuiz,
  getQuizzesByCourse,
  getTeacherQuizzes,
  getQuizById,
  submitQuizResponse,
  getTeacherQuizResults,
  getStudentQuizResults,
  updateQuiz,
  deleteQuiz,
};
