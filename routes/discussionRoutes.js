const express = require('express');
const router = express.Router();
const {
  getDiscussionByCourse,
  addMessage,
} = require('../controllers/discussionController');
const { protect } = require('../middleware/authMiddleware');

router.route('/:courseId')
  .get(protect, getDiscussionByCourse)
  .post(protect, addMessage);

module.exports = router;
