const express = require('express');
const router = express.Router();
const {
  createReport,
  getReports,
  updateReport,
} = require('../controllers/reportController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Création accessible à tout utilisateur connecté
router.post('/', protect, createReport);

// Gestion réservée aux administrateurs
router.get('/', protect, authorize('admin'), getReports);
router.put('/:id', protect, authorize('admin'), updateReport);

module.exports = router;
