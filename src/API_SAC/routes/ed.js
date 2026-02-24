// src/API_SAC/routes/ed.js
const express = require('express');
const { sendAttendance, postAbsences } = require('../commons/ed');
const router = express.Router();

// POST /api/ed/attendance
router.post('/attendance', async (req, res) => {
  try {
    const { seanceId, date, records } = req.body;
    if (!seanceId || !date || !Array.isArray(records)) {
      return res.status(400).json({ error: 'seanceId, date et records requis' });
    }
    const result = await sendAttendance(seanceId, date, records);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ed/absences
router.post('/absences', async (req, res) => {
  try {
    const { absences } = req.body;
    if (!Array.isArray(absences)) {
      return res.status(400).json({ error: 'absences doit être un tableau' });
    }
    const result = await postAbsences(absences);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
