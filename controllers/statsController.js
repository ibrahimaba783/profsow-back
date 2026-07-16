const User = require('../models/User');
const Course = require('../models/Course');

// @desc    Obtenir les statistiques publiques réelles de la plateforme
// @route   GET /api/stats
// @access  Public
const getPublicStats = async (req, res) => {
  try {
    const [studentsCount, coursesCount, subjects] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      Course.countDocuments(),
      Course.distinct('subject'),
    ]);

    res.json({
      studentsCount,
      coursesCount,
      modulesCount: subjects.length, // nombre de matières réellement proposées (Maths / Physique-Chimie)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getPublicStats };