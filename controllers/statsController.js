const User = require('../models/User');
const Course = require('../models/Course');

const normalizeLevel = (lvl = '') => {
  const s = String(lvl).trim().toLowerCase();
  if (s.includes('4')) return '4ème';
  if (s.includes('3')) return '3ème';
  if (s.includes('2')) return '2nde S';
  if (s.includes('1')) return '1ère S';
  if (s.includes('ts') || s.includes('term')) return 'TS';
  return String(lvl).trim();
};

// @desc    Obtenir les statistiques publiques réelles de la plateforme (100% synchronisées avec MongoDB)
// @route   GET /api/stats
// @access  Public
const getPublicStats = async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');

    const [studentsCount, publishedCourses] = await Promise.all([
      User.countDocuments({ role: 'student', isActive: { $ne: false } }),
      Course.find({ isPublished: { $ne: false } }, 'subject level chapters').lean(),
    ]);

    const publishedChaptersCount = publishedCourses.reduce((acc, course) => {
      const openChapters = (course.chapters || []).filter((ch) => ch.isLocked !== true);
      return acc + openChapters.length;
    }, 0);

    // Programmes scientifiques complets : niveaux ayant Maths ET Physique-Chimie publiés avec chapitres disponibles
    const byLevel = new Map();
    publishedCourses.forEach((course) => {
      const lvl = normalizeLevel(course.level);
      if (!lvl) return;
      if (!byLevel.has(lvl)) {
        byLevel.set(lvl, { hasMath: false, hasPhysics: false, allHaveChapters: true });
      }
      const entry = byLevel.get(lvl);
      const subj = String(course.subject || '').toLowerCase();
      const hasOpenChapters = (course.chapters || []).some((ch) => ch.isLocked !== true);
      if (!hasOpenChapters) entry.allHaveChapters = false;
      if (subj.includes('math')) entry.hasMath = true;
      if (subj.includes('physique') || subj.includes('chimie')) entry.hasPhysics = true;
    });

    let completeProgramsCount = 0;
    byLevel.forEach((entry) => {
      if (entry.hasMath && entry.hasPhysics && entry.allHaveChapters) {
        completeProgramsCount += 1;
      }
    });

    res.json({
      studentsCount: studentsCount || 0,
      coursesCount: publishedCourses.length + publishedChaptersCount,
      modulesCount: completeProgramsCount,
      subjectsCount: publishedCourses.length,
      chaptersCount: publishedChaptersCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getPublicStats };
