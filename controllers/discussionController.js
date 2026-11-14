const Discussion = require('../models/Discussion');
const Course = require('../models/Course');
const Subscription = require('../models/Subscription');

const canModerateCourse = (course, user) =>
  user.role === 'admin' || (course && course.teacher.toString() === user._id.toString());

// @desc    Obtenir les messages de discussion pour un cours
// @route   GET /api/discussions/:courseId
// @access  Private
const getDiscussionByCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) return res.status(404).json({ message: 'Cours non trouvé' });

    const isStaff = canModerateCourse(course, req.user);
    if (!isStaff) {
      const activeSub = await Subscription.findOne({
        student: req.user._id,
        course: course._id,
        status: 'active',
        expiresAt: { $gt: new Date() },
      });
      if (!activeSub) {
        return res.status(403).json({ message: 'Accès réservé. Vous devez être inscrit à ce cours pour voir les échanges.' });
      }
    }

    const messages = await Discussion.find({ course: req.params.courseId })
      .populate('sender', 'name email role avatar')
      .populate('exercise', 'title')
      .populate('replies.sender', 'name email role avatar')
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Poster un message dans la discussion d'un cours
// @route   POST /api/discussions/:courseId
// @access  Private
const addMessage = async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) return res.status(404).json({ message: 'Cours non trouvé' });

    const isStaff = canModerateCourse(course, req.user);
    if (!isStaff) {
      const activeSub = await Subscription.findOne({
        student: req.user._id,
        course: course._id,
        status: 'active',
        expiresAt: { $gt: new Date() },
      });
      if (!activeSub) {
        return res.status(403).json({ message: 'Accès réservé. Vous devez être inscrit à ce cours pour poser une question.' });
      }
    }

    const { message, exerciseId, exerciseTitle } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({ message: 'Le message ne peut pas être vide' });
    }

    let newMessage = await Discussion.create({
      course: req.params.courseId,
      sender: req.user._id,
      exercise: exerciseId || null,
      exerciseTitle: exerciseTitle || '',
      message: message.trim(),
    });

    newMessage = await newMessage.populate('sender', 'name email role avatar');
    newMessage = await newMessage.populate('exercise', 'title');
    res.status(201).json(newMessage);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Obtenir toutes les questions/discussions des cours du professeur
// @route   GET /api/discussions/teacher/all
// @access  Private/Teacher|Admin
const getTeacherDiscussions = async (req, res) => {
  try {
    const courses = req.user.role === 'admin'
      ? await Course.find().select('_id title subject level')
      : await Course.find({ teacher: req.user._id }).select('_id title subject level');
    const courseIds = courses.map((c) => c._id);

    const messages = await Discussion.find({ course: { $in: courseIds } })
      .populate('course', 'title subject level')
      .populate('exercise', 'title')
      .populate('sender', 'name email role avatar')
      .populate('replies.sender', 'name email role avatar')
      .sort({ createdAt: -1 });

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Répondre à une question dans la discussion
// @route   POST /api/discussions/:courseId/:msgId/reply
// @access  Private
const replyToMessage = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'La réponse ne peut pas être vide' });
    }

    const discussion = await Discussion.findById(req.params.msgId);
    if (!discussion) {
      return res.status(404).json({ message: 'Question non trouvée' });
    }

    discussion.replies.push({
      sender: req.user._id,
      message: message.trim(),
    });

    await discussion.save();
    await discussion.populate('course', 'title subject level');
    await discussion.populate('sender', 'name email role avatar');
    await discussion.populate('replies.sender', 'name email role avatar');

    res.status(201).json(discussion);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Modifier une question, une réponse ou marquer comme résolue
// @route   PUT /api/discussions/message/:msgId
// @access  Private
const updateDiscussionMessage = async (req, res) => {
  try {
    const discussion = await Discussion.findById(req.params.msgId);
    if (!discussion) {
      return res.status(404).json({ message: 'Message non trouvé' });
    }

    const course = await Course.findById(discussion.course);
    const isStaffMod = canModerateCourse(course, req.user);
    const isAuthor = discussion.sender.toString() === req.user._id.toString();

    if (req.body.replyId !== undefined) {
      const reply = discussion.replies.id(req.body.replyId);
      if (!reply) return res.status(404).json({ message: 'Réponse non trouvée' });
      const isReplyAuthor = reply.sender.toString() === req.user._id.toString();
      if (!isStaffMod && !isReplyAuthor) {
        return res.status(403).json({ message: 'Non autorisé' });
      }
      if (req.body.replyText && req.body.replyText.trim()) {
        reply.message = req.body.replyText.trim();
      }
    } else {
      if (!isStaffMod && !isAuthor) {
        return res.status(403).json({ message: 'Non autorisé' });
      }
      if (req.body.message !== undefined && req.body.message.trim()) {
        discussion.message = req.body.message.trim();
      }
      if (req.body.isResolved !== undefined) {
        discussion.isResolved = Boolean(req.body.isResolved);
      }
    }

    await discussion.save();
    await discussion.populate('course', 'title subject level');
    await discussion.populate('sender', 'name email role avatar');
    await discussion.populate('replies.sender', 'name email role avatar');

    res.json(discussion);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Supprimer un message ou une réponse inappropriée
// @route   DELETE /api/discussions/message/:msgId
// @access  Private
const deleteDiscussionMessage = async (req, res) => {
  try {
    const discussion = await Discussion.findById(req.params.msgId);
    if (!discussion) {
      return res.status(404).json({ message: 'Message non trouvé' });
    }

    const course = await Course.findById(discussion.course);
    const isStaffMod = canModerateCourse(course, req.user);
    const isAuthor = discussion.sender.toString() === req.user._id.toString();

    const replyId = req.query.replyId || req.body?.replyId;
    if (replyId) {
      const reply = discussion.replies.id(replyId);
      if (!reply) return res.status(404).json({ message: 'Réponse non trouvée' });
      const isReplyAuthor = reply.sender.toString() === req.user._id.toString();
      if (!isStaffMod && !isReplyAuthor) {
        return res.status(403).json({ message: 'Non autorisé' });
      }
      discussion.replies.pull(replyId);
      await discussion.save();
      await discussion.populate('course', 'title subject level');
      await discussion.populate('sender', 'name email role avatar');
      await discussion.populate('replies.sender', 'name email role avatar');
      return res.json({ deletedReply: true, discussion });
    }

    if (!isStaffMod && !isAuthor) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    await discussion.deleteOne();
    res.json({ message: 'Message supprimé avec succès' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getDiscussionByCourse,
  addMessage,
  getTeacherDiscussions,
  replyToMessage,
  updateDiscussionMessage,
  deleteDiscussionMessage,
};
