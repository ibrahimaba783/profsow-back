const express = require('express');
const router = express.Router();
const {
  createSubscription,
  enrollFreeCourse,
  getMySubscriptions,
  checkSubscriptionStatus,
  getTeacherStudents,
  getAllSubscriptionsAdmin,
  updateSubscriptionStatusAdmin,
} = require('../controllers/subscriptionController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.route('/').post(protect, createSubscription);

router.route('/enroll-free/:courseId').post(protect, authorize('student'), enrollFreeCourse);

router.route('/my').get(protect, getMySubscriptions);

router.route('/check/:courseId').get(protect, checkSubscriptionStatus);

// Élèves inscrits : accessible par l'admin (tous) et par le prof (ses élèves uniquement)
router.route('/teacher/students').get(protect, authorize('admin', 'teacher'), getTeacherStudents);

// Gestion complète des abonnements & paiements (ADMIN UNIQUEMENT)
router.route('/admin/all').get(protect, authorize('admin'), getAllSubscriptionsAdmin);
router.route('/admin/:id/status').patch(protect, authorize('admin'), updateSubscriptionStatusAdmin);

module.exports = router;
