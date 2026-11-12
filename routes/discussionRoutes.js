const express = require('express');
const router = express.Router();
const {
  getDiscussionByCourse,
  addMessage,
  getTeacherDiscussions,
  replyToMessage,
  updateDiscussionMessage,
  deleteDiscussionMessage,
} = require('../controllers/discussionController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.route('/teacher/all')
  .get(protect, authorize('teacher', 'admin'), getTeacherDiscussions);

router.route('/message/:msgId')
  .put(protect, updateDiscussionMessage)
  .delete(protect, deleteDiscussionMessage);

router.route('/:courseId/:msgId/reply')
  .post(protect, replyToMessage);

router.route('/:courseId')
  .get(protect, getDiscussionByCourse)
  .post(protect, addMessage);

module.exports = router;
