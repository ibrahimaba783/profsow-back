const express = require('express');
const router = express.Router();
const {
  getAdminOverview,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  getAllSubscriptions,
  grantSubscription,
  updateSubscription,
  deleteSubscription,
  getAllReviews,
  deleteReview,
  assignCourseTeacher,
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect, authorize('admin'));

router.get('/overview', getAdminOverview);

router.route('/users')
  .get(getAllUsers)
  .post(createUser);

router.route('/users/:id')
  .put(updateUser)
  .delete(deleteUser);

router.route('/subscriptions')
  .get(getAllSubscriptions)
  .post(grantSubscription);

router.route('/subscriptions/:id')
  .put(updateSubscription)
  .delete(deleteSubscription);

router.get('/reviews', getAllReviews);
router.delete('/reviews/:id', deleteReview);

router.put('/courses/:id/teacher', assignCourseTeacher);

module.exports = router;
