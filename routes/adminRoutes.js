const express = require('express');
const router = express.Router();
const {
  getAdminOverview,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  suspendUser,
  toggleBlockUser,
  resetUserPassword,
  getUserActivity,
  getAllSubscriptions,
  grantSubscription,
  updateSubscription,
  deleteSubscription,
  getAllReviews,
  deleteReview,
  getAllDiscussions,
  deleteDiscussion,
  assignCourseTeacher,
  getSecurityLogs,
  exportDatabaseBackup,
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { uploadImage } = require('../utils/cloudinary');

router.use(protect, authorize('admin'));

router.get('/overview', getAdminOverview);

// Sauvegarde complète de la base de données
router.get('/backup', exportDatabaseBackup);

// Journal de sécurité et d'audit
router.get('/security/logs', getSecurityLogs);

// Modération des discussions / commentaires
router.get('/discussions', getAllDiscussions);
router.delete('/discussions/:id', deleteDiscussion);

// Gestion avancée des utilisateurs
router.route('/users')
  .get(getAllUsers)
  .post(createUser);

router.post('/users/:id/suspend', suspendUser);
router.post('/users/:id/toggle-block', toggleBlockUser);
router.post('/users/:id/reset-password', resetUserPassword);
router.get('/users/:id/activity', getUserActivity);

router.route('/users/:id')
  .put(uploadImage.single('avatar'), updateUser)
  .delete(deleteUser);

// Gestion des abonnements & paiements
router.route('/subscriptions')
  .get(getAllSubscriptions)
  .post(grantSubscription);

router.route('/subscriptions/:id')
  .put(updateSubscription)
  .delete(deleteSubscription);

// Modération des avis
router.get('/reviews', getAllReviews);
router.delete('/reviews/:id', deleteReview);

router.put('/courses/:id/teacher', assignCourseTeacher);

module.exports = router;
