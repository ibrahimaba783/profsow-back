const express = require('express');
const router = express.Router();
const {
  getCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  addChapter,
  addLesson,
  deleteChapter,
  deleteLesson,
} = require('../controllers/courseController');
const { protect, optionalAuth, authorize } = require('../middleware/authMiddleware');
const { uploadImage, uploadPdf } = require('../utils/cloudinary');

router.route('/')
  .get(getCourses)
  .post(protect, authorize('teacher', 'admin'), uploadImage.single('image'), createCourse);

router.route('/:id')
  .get(optionalAuth, getCourseById)
  .put(protect, authorize('teacher', 'admin'), uploadImage.single('image'), updateCourse)
  .delete(protect, authorize('teacher', 'admin'), deleteCourse);

router.route('/:id/chapters')
  .post(protect, authorize('teacher', 'admin'), addChapter);

router.route('/:id/chapters/:chapterId')
  .delete(protect, authorize('teacher', 'admin'), deleteChapter);

router.route('/:id/chapters/:chapterId/lessons')
  .post(protect, authorize('teacher', 'admin'), uploadPdf.single('pdf'), addLesson);

router.route('/:id/chapters/:chapterId/lessons/:lessonId')
  .delete(protect, authorize('teacher', 'admin'), deleteLesson);

module.exports = router;
