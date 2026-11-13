const User = require('../models/User');
const Course = require('../models/Course');

let cachedStats = null;
let cachedStatsTime = 0;
const STATS_TTL_MS = 60 * 1000; // 60 secondes

// @desc    Obtenir les statistiques publiques réelles de la plateforme
// @route   GET /api/stats
// @access  Public
const getPublicStats = async (req, res) => {
  try {
    if (cachedStats && Date.now() - cachedStatsTime < STATS_TTL_MS) {
      return res.json(cachedStats);
    }

    const [studentsCount, coursesCount, subjects] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      Course.countDocuments(),
      Course.distinct('subject'),
    ]);

    const result = {
      studentsCount,
      coursesCount,
      modulesCount: subjects.length, // nombre de matières réellement proposées (Maths / Physique-Chimie)
    };

    cachedStats = result;
    cachedStatsTime = Date.now();

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getPublicStats };
