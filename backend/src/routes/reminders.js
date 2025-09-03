const express = require('express');
const router = express.Router();

// GET /api/reminders - List reminders
router.get('/', async (req, res, next) => {
  try {
    res.json({
      reminders: [],
      total: 0,
      message: 'Reminders service available'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;