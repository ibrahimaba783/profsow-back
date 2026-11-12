const express = require('express');
const router = express.Router();
const {
  createSubscription,
  enrollFreeCourse,
  getMySubscriptions,
  checkSubscriptionStatus,
  getTeacherStudents,
  toggleSubscriptionStatus,
  remindStudent,
  toggleLessonProgress,
} = require('../controllers/subscriptionController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.route('/')
  .post(protect, createSubscription);

router.route('/enroll-free/:courseId')
  .post(protect, authorize('student'), enrollFreeCourse);

router.route('/my')
  .get(protect, getMySubscriptions);

router.route('/check/:courseId')
  .get(protect, checkSubscriptionStatus);

router.route('/progress/:courseId')
  .put(protect, toggleLessonProgress);

router.route('/teacher/students')
  .get(protect, authorize('teacher', 'admin'), getTeacherStudents);

router.route('/:id/status')
  .put(protect, authorize('teacher', 'admin'), toggleSubscriptionStatus);

router.route('/:id/remind')
  .post(protect, authorize('teacher', 'admin'), remindStudent);

module.exports = router;
