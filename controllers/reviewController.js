const Review = require('../models/Review');
const Subscription = require('../models/Subscription');
const Course = require('../models/Course');

const canManageCourse = (course, user) =>
  user.role === 'admin' || (course && course.teacher.toString() === user._id.toString());

// @desc    Obtenir les avis d'un cours
// @route   GET /api/reviews/:courseId
// @access  Public
const getCourseReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ course: req.params.courseId })
      .populate('student', 'name avatar')
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Ajouter un avis sur un cours (élève abonné uniquement)
// @route   POST /api/reviews/:courseId
// @access  Private/Student
const addCourseReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const numericRating = Number(rating);

    if (!numericRating || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ message: 'Veuillez choisir une note entre 1 et 5 étoiles' });
    }

    const activeSub = await Subscription.findOne({
      student: req.user._id,
      course: req.params.courseId,
      status: 'active',
      expiresAt: { $gt: new Date() },
    });

    if (!activeSub) {
      return res.status(403).json({ message: 'Vous devez être abonné à ce cours pour laisser un avis' });
    }

    const review = await Review.create({
      course: req.params.courseId,
      student: req.user._id,
      rating: numericRating,
      comment: (comment || '').trim(),
    });

    const populated = await review.populate('student', 'name avatar');
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Obtenir tous les avis reçus sur les cours du professeur
// @route   GET /api/reviews/teacher/all
// @access  Private/Teacher|Admin
const getTeacherReviews = async (req, res) => {
  try {
    const courses = req.user.role === 'admin'
      ? await Course.find().select('_id title subject level')
      : await Course.find({ teacher: req.user._id }).select('_id title subject level');
    const courseIds = courses.map((c) => c._id);

    const reviews = await Review.find({ course: { $in: courseIds } })
      .populate('course', 'title subject level')
      .populate('student', 'name email avatar')
      .sort({ createdAt: -1 });

    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Répondre à un avis (Enseignant ou Admin)
// @route   PUT /api/reviews/:reviewId/reply
// @access  Private/Teacher|Admin
const replyToReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.reviewId);
    if (!review) {
      return res.status(404).json({ message: 'Avis non trouvé' });
    }

    const course = await Course.findById(review.course);
    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    review.teacherReply = String(req.body.reply || '').trim();
    review.repliedAt = new Date();
    await review.save();

    await review.populate('course', 'title subject level');
    await review.populate('student', 'name email avatar');
    res.json(review);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Signaler un avis abusif (Enseignant ou Admin)
// @route   PUT /api/reviews/:reviewId/report
// @access  Private/Teacher|Admin
const reportReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.reviewId);
    if (!review) {
      return res.status(404).json({ message: 'Avis non trouvé' });
    }

    const course = await Course.findById(review.course);
    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    review.isReported = req.body.isReported !== undefined ? Boolean(req.body.isReported) : true;
    review.reportReason = review.isReported
      ? String(req.body.reason || 'Contenu inapproprié / abusif').trim()
      : '';
    await review.save();

    await review.populate('course', 'title subject level');
    await review.populate('student', 'name email avatar');
    res.json(review);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getCourseReviews,
  addCourseReview,
  getTeacherReviews,
  replyToReview,
  reportReview,
};
