const express = require('express');
const router = express.Router();
const {
  createQuiz,
  getQuizzesByCourse,
  getQuizById,
  submitQuizResponse,
  getTeacherQuizResults,
  getStudentQuizResults,
  updateQuiz,
  deleteQuiz,
} = require('../controllers/quizController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.route('/')
  .post(protect, authorize('teacher', 'admin'), createQuiz);

router.route('/course/:courseId')
  .get(protect, getQuizzesByCourse);

router.route('/teacher/results')
  .get(protect, authorize('teacher', 'admin'), getTeacherQuizResults);

router.route('/student/results')
  .get(protect, getStudentQuizResults);

router.route('/:id')
  .get(protect, getQuizById)
  .put(protect, authorize('teacher', 'admin'), updateQuiz)
  .delete(protect, authorize('teacher', 'admin'), deleteQuiz);

router.route('/:id/submit')
  .post(protect, submitQuizResponse);

module.exports = router;
