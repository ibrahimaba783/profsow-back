const Quiz = require('../models/Quiz');
const QuizResult = require('../models/QuizResult');
const Course = require('../models/Course');

const canManageCourse = (course, user) =>
  user.role === 'admin' || (course && course.teacher.toString() === user._id.toString());

// @desc    Créer un quiz (Enseignant ou Admin)
// @route   POST /api/quizzes
// @access  Private/Teacher|Admin
const createQuiz = async (req, res) => {
  try {
    const { courseId, title, questions } = req.body;

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
      questions,
    });

    res.status(201).json(quiz);
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
    const { answers } = req.body;
    const quiz = await Quiz.findById(req.params.id);

    if (!quiz) {
      return res.status(404).json({ message: 'Quiz non trouvé' });
    }

    let score = 0;
    const totalQuestions = quiz.questions.length;

    quiz.questions.forEach((question, index) => {
      if (answers[index] !== undefined && answers[index] === question.correctAnswerIndex) {
        score++;
      }
    });

    const result = await QuizResult.create({
      student: req.user._id,
      quiz: req.params.id,
      score,
      totalQuestions,
    });

    res.status(201).json({
      result,
      score,
      totalQuestions,
      percentage: (score / totalQuestions) * 100,
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
        select: 'title course',
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
        select: 'title course',
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
    const { title, questions } = req.body;
    const quiz = await Quiz.findById(req.params.id).populate('course', 'teacher');

    if (!quiz) {
      return res.status(404).json({ message: 'Quiz non trouvé' });
    }

    if (!canManageCourse(quiz.course, req.user)) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    if (title !== undefined) quiz.title = title;
    if (questions !== undefined) quiz.questions = questions;

    await quiz.save();
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
  getQuizById,
  submitQuizResponse,
  getTeacherQuizResults,
  getStudentQuizResults,
  updateQuiz,
  deleteQuiz,
};
