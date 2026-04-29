// ./API_SAC/routes/nfc.route.js
const express = require("express");
const require_access = require("../middlewares/require_access.middleware");
const { ROLES } = require("../commons/constants.common");
const { TECHNICAL_LEVELS, log_technical } = require("../commons/logger.common");
const { process_nfc_scan } = require("../workflows/start_course_session.workflow.js");
const {
  prepare_finalize_from_nfc,
  finalize_session,
} = require("../workflows/finalize_course_session.workflow.js");

const router = express.Router();

router.post("/scan/prepare", require_access({ minRole: ROLES.STUDENT }), async (req, res) => {
  try {
    const result = await process_nfc_scan(req, { dryRun: true });
    return res.status(result.status).json(result.body);
  } catch (err) {
    log_technical(TECHNICAL_LEVELS.ERROR, "NFC prepare failed", { error: err, userId: req.session?.user?.id });

    return res.status(500).json({
      error: "Erreur serveur NFC",
    });
  }
});

router.post("/scan/finalize/prepare", require_access({ minRole: ROLES.TEACHER }), async (req, res) => {
  try {
    const result = await prepare_finalize_from_nfc(req);
    return res.status(result.status).json(result.body);
  } catch (err) {
    log_technical(TECHNICAL_LEVELS.ERROR, "NFC finalize prepare failed", { error: err, userId: req.session?.user?.id });

    return res.status(500).json({
      error: "Erreur serveur NFC",
    });
  }
});

router.post("/scan/finalize", require_access({ minRole: ROLES.TEACHER }), async (req, res) => {
  try {
    const result = await finalize_session(req);
    return res.status(result.status).json(result.body);
  } catch (err) {
    log_technical(TECHNICAL_LEVELS.ERROR, "NFC finalize failed", { error: err, userId: req.session?.user?.id });

    return res.status(500).json({
      error: "Erreur serveur NFC",
    });
  }
});

router.post("/scan", require_access({ minRole: ROLES.STUDENT }), async (req, res) => {
  try {
    const result = await process_nfc_scan(req);
    return res.status(result.status).json(result.body);
  } catch (err) {
    log_technical(TECHNICAL_LEVELS.ERROR, "NFC scan failed", { error: err, userId: req.session?.user?.id });

    return res.status(500).json({
      error: "Erreur serveur NFC",
    });
  }
});

module.exports = router;
