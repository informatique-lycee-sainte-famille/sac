// src/API_SAC/routes/nfc.js
const express = require("express");
const { processNfcScan } = require("../workflows/startCourseSession.js");

const router = express.Router();

router.post("/scan/prepare", async (req, res) => {
  try {
    const result = await processNfcScan(req, { dryRun: true });
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("💥 Erreur NFC prepare:", err);

    return res.status(500).json({
      error: "Erreur serveur NFC",
    });
  }
});

router.post("/scan", async (req, res) => {
  try {
    const result = await processNfcScan(req);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("💥 Erreur NFC:", err);

    return res.status(500).json({
      error: "Erreur serveur NFC",
    });
  }
});

module.exports = router;
