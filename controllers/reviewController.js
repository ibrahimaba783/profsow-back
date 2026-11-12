const Review = require('../models/Review');
const Subscription = require('../models/Subscription');

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

module.exports = { getCourseReviews, addCourseReview };
