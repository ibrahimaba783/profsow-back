const express = require('express');
const router = express.Router();
const {
  createSubscription,
  enrollFreeCourse,
  getMySubscriptions,
  checkSubscriptionStatus,
  getTeacherStudents,
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

router.route('/teacher/students')
  .get(protect, authorize('teacher'), getTeacherStudents);

module.exports = router;