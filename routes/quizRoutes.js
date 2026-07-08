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
  .post(protect, authorize('teacher'), createQuiz);

router.route('/course/:courseId')
  .get(protect, getQuizzesByCourse);

router.route('/teacher/results')
  .get(protect, authorize('teacher'), getTeacherQuizResults);

router.route('/student/results')
  .get(protect, getStudentQuizResults);

router.route('/:id')
  .get(protect, getQuizById)
  .put(protect, authorize('teacher'), updateQuiz)
  .delete(protect, authorize('teacher'), deleteQuiz);

router.route('/:id/submit')
  .post(protect, submitQuizResponse);

module.exports = router;