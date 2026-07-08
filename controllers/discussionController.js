const Discussion = require('../models/Discussion');

// @desc    Obtenir les messages de discussion pour un cours
// @route   GET /api/discussions/:courseId
// @access  Private
const getDiscussionByCourse = async (req, res) => {
  try {
    const messages = await Discussion.find({ course: req.params.courseId })
      .populate('sender', 'name email role avatar')
      .sort({ createdAt: 1 }); // Ordre chronologique

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
    const { message } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({ message: 'Le message ne peut pas être vide' });
    }

    let newMessage = await Discussion.create({
      course: req.params.courseId,
      sender: req.user._id,
      message,
    });

    newMessage = await newMessage.populate('sender', 'name email role avatar');

    res.status(201).json(newMessage);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getDiscussionByCourse,
  addMessage,
};
