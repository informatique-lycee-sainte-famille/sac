// src/API_SAC/routes/nfc.js
const express = require("express");
const { processNfcScan } = require("../workflows/startCourseSession.js");
const {
  prepareFinalizeFromNfc,
  finalizeSession,
} = require("../workflows/finalizeCourseSession.js");

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

router.post("/scan/finalize/prepare", async (req, res) => {
  try {
    const result = await prepareFinalizeFromNfc(req);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("💥 Erreur NFC finalize prepare:", err);

    return res.status(500).json({
      error: "Erreur serveur NFC",
    });
  }
});

router.post("/scan/finalize", async (req, res) => {
  try {
    const result = await finalizeSession(req);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("💥 Erreur NFC finalize:", err);

    return res.status(500).json({
      error: "Erreur serveur NFC",
      message: err.message,
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
