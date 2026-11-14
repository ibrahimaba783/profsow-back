const User = require('../models/User');
const Course = require('../models/Course');

// @desc    Obtenir les statistiques publiques réelles de la plateforme (100% synchronisées avec MongoDB)
// @route   GET /api/stats
// @access  Public
const getPublicStats = async (req, res) => {
  try {
    const [studentsCount, courses, subjects] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      Course.find({}, 'chapters').lean(),
      Course.distinct('subject'),
    ]);

    const totalChapters = courses.reduce((acc, c) => acc + (c.chapters?.length || 0), 0);
    const coursesAndChapters = courses.length + totalChapters;

    const result = {
      studentsCount: studentsCount || 0,
      coursesCount: coursesAndChapters,
      modulesCount: subjects.length,
    };

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getPublicStats };
