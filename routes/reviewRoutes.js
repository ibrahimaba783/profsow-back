const express = require('express');
const router = express.Router();
const {
  getCourseReviews,
  addCourseReview,
  getTeacherReviews,
  replyToReview,
  reportReview,
} = require('../controllers/reviewController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.route('/teacher/all')
  .get(protect, authorize('teacher', 'admin'), getTeacherReviews);

router.route('/:reviewId/reply')
  .put(protect, authorize('teacher', 'admin'), replyToReview);

router.route('/:reviewId/report')
  .put(protect, authorize('teacher', 'admin'), reportReview);

router.route('/:courseId')
  .get(getCourseReviews)
  .post(protect, authorize('student'), addCourseReview);

module.exports = router;
