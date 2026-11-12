const express = require('express');
const router = express.Router();
const {
  getCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  addChapter,
  reorderChapters,
  updateChapter,
  addLesson,
  updateLesson,
  deleteChapter,
  deleteLesson,
  addCourseAnnouncement,
  deleteCourseAnnouncement,
} = require('../controllers/courseController');
const { protect, optionalAuth, authorize } = require('../middleware/authMiddleware');
const { uploadImage, uploadPdf } = require('../utils/cloudinary');

router.route('/')
  .get(optionalAuth, getCourses)
  .post(protect, authorize('teacher', 'admin'), uploadImage.single('image'), createCourse);

router.route('/:id')
  .get(optionalAuth, getCourseById)
  .put(protect, authorize('teacher', 'admin'), uploadImage.single('image'), updateCourse)
  .delete(protect, authorize('teacher', 'admin'), deleteCourse);

router.route('/:id/announcements')
  .post(protect, authorize('teacher', 'admin'), addCourseAnnouncement);

router.route('/:id/announcements/:annId')
  .delete(protect, authorize('teacher', 'admin'), deleteCourseAnnouncement);

router.route('/:id/chapters')
  .post(protect, authorize('teacher', 'admin'), addChapter);

router.route('/:id/chapters/reorder')
  .put(protect, authorize('teacher', 'admin'), reorderChapters);

router.route('/:id/chapters/:chapterId')
  .put(protect, authorize('teacher', 'admin'), updateChapter)
  .delete(protect, authorize('teacher', 'admin'), deleteChapter);

router.route('/:id/chapters/:chapterId/lessons')
  .post(protect, authorize('teacher', 'admin'), uploadPdf.single('pdf'), addLesson);

router.route('/:id/chapters/:chapterId/lessons/:lessonId')
  .put(protect, authorize('teacher', 'admin'), uploadPdf.single('pdf'), updateLesson)
  .delete(protect, authorize('teacher', 'admin'), deleteLesson);

module.exports = router;
