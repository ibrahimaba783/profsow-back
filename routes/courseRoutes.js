const express = require('express');
const router = express.Router();
const {
  getCourses,
  getManageCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  assignCourseTeacher,
  toggleCourseStatus,
  reorderCourses,
  addChapter,
  addLesson,
  deleteChapter,
  deleteLesson,
} = require('../controllers/courseController');
const { protect, optionalAuth, authorize } = require('../middleware/authMiddleware');
const { uploadImage, uploadPdf } = require('../utils/cloudinary');

// Catalogue public
router.route('/').get(getCourses);

// Gestion des cours pour le Back Office (filtré automatiquement selon le rôle)
router.route('/manage').get(protect, authorize('admin', 'teacher'), getManageCourses);

// Réordonnancement global des cours (Admin uniquement)
router.route('/reorder').put(protect, authorize('admin'), reorderCourses);

// Création de cours (Admin uniquement)
router.route('/').post(protect, authorize('admin'), uploadImage.single('image'), createCourse);

// Assignation d'un module à un professeur (Admin uniquement)
router.route('/:id/assign').patch(protect, authorize('admin'), assignCourseTeacher);

// Activation / Désactivation du statut d'un cours (Admin uniquement)
router.route('/:id/status').patch(protect, authorize('admin'), toggleCourseStatus);

// Détail, modification et suppression de cours
router
  .route('/:id')
  .get(optionalAuth, getCourseById)
  .put(protect, authorize('admin', 'teacher'), uploadImage.single('image'), updateCourse)
  .delete(protect, authorize('admin'), deleteCourse);

// Chapitres (Admin ou Professeur assigné)
router.route('/:id/chapters').post(protect, authorize('admin', 'teacher'), addChapter);
router.route('/:id/chapters/:chapterId').delete(protect, authorize('admin', 'teacher'), deleteChapter);

// Leçons (Admin ou Professeur assigné)
router
  .route('/:id/chapters/:chapterId/lessons')
  .post(protect, authorize('admin', 'teacher'), uploadPdf.single('pdf'), addLesson);

router
  .route('/:id/chapters/:chapterId/lessons/:lessonId')
  .delete(protect, authorize('admin', 'teacher'), deleteLesson);

module.exports = router;
