const express = require('express');
const router = express.Router();
const {
  getExercisesByCourse,
  getTeacherExercisesAndSubmissions,
  createExercise,
  updateExercise,
  deleteExercise,
  submitExerciseWork,
  gradeExerciseSubmission,
  getExerciseById,
  getExerciseCorrection,
} = require('../controllers/exerciseController');
const { protect, optionalAuth, authorize } = require('../middleware/authMiddleware');
const { uploadExerciseFiles } = require('../utils/cloudinary');

const exerciseUploadMiddleware = uploadExerciseFiles.fields([
  { name: 'statementImage', maxCount: 1 },
  { name: 'statementPdf', maxCount: 1 },
  { name: 'correctionPdf', maxCount: 1 },
]);

router.get('/teacher/all', protect, authorize('teacher', 'admin'), getTeacherExercisesAndSubmissions);
router.get('/course/:courseId', optionalAuth, getExercisesByCourse);
router.get('/:id', protect, getExerciseById);
router.get('/:id/correction', protect, getExerciseCorrection);

router.post('/', protect, authorize('teacher', 'admin'), exerciseUploadMiddleware, createExercise);
router.put('/:id', protect, authorize('teacher', 'admin'), exerciseUploadMiddleware, updateExercise);
router.delete('/:id', protect, authorize('teacher', 'admin'), deleteExercise);

router.post('/:id/submit', protect, uploadExerciseFiles.single('submissionFile'), submitExerciseWork);
router.put('/submissions/:subId/grade', protect, authorize('teacher', 'admin'), gradeExerciseSubmission);

module.exports = router;
