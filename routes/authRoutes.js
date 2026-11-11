const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  googleAuth,
  getUserProfile,
  updateUserProfile,
  forgotPassword,
  resetPassword,
  getAllUsers,
  createUserByAdmin,
  updateUserRole,
  deleteUserByAdmin,
  getTeachersList,
  getAllStudents,
  deleteStudent,
} = require('../controllers/authController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { uploadImage } = require('../utils/cloudinary');

// Authentification publique
router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/google', googleAuth);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:token', resetPassword);

// Profil privé (connecté)
router
  .route('/profile')
  .get(protect, getUserProfile)
  .put(protect, uploadImage.single('avatar'), updateUserProfile);

// Liste des professeurs disponibles (pour l'assignation de modules)
router.route('/teachers').get(protect, authorize('admin', 'teacher'), getTeachersList);

// Gestion complète des utilisateurs (ADMIN SEULEMENT)
router
  .route('/users')
  .get(protect, authorize('admin'), getAllUsers)
  .post(protect, authorize('admin'), createUserByAdmin);

router.route('/users/:id/role').put(protect, authorize('admin'), updateUserRole);
router.route('/users/:id').delete(protect, authorize('admin'), deleteUserByAdmin);

// Routes de compatibilité
router.route('/students').get(protect, authorize('admin', 'teacher'), getAllStudents);
router.route('/students/:id').delete(protect, authorize('admin'), deleteStudent);

module.exports = router;
