const express = require('express');
const router = express.Router();
const {
  createQuiz,
  getQuizzesByCourse,
  getQuizById,
  submitQuizResponse,
  getTeacherQuizResults,
  getStudentQuizResults,
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
  .get(protect, getQuizById);

router.route('/:id/submit')
  .post(protect, submitQuizResponse);

module.exports = router;
