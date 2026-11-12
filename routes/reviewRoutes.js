const express = require('express');
const router = express.Router();
const { getCourseReviews, addCourseReview } = require('../controllers/reviewController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.route('/:courseId')
  .get(getCourseReviews)
  .post(protect, authorize('student'), addCourseReview);

module.exports = router;
