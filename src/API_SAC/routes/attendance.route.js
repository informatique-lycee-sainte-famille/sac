// ./API_SAC/routes/attendance.route.js
const express = require("express");
const { prisma } = require("../commons/prisma.common");
const require_access = require("../middlewares/require_access.middleware");
const { ROLES } = require("../commons/constants.common");
const { generate_class_day_pdf } = require("../workflows/finalize_course_session.workflow");
const { LOG_DESTINATIONS, TECHNICAL_LEVELS, log_business, log_technical } = require("../commons/logger.common");
const router = express.Router();

router.get("/pdf/day", require_access({ minRole: ROLES.TEACHER }), async (req, res) => {
  try {
    const classId = req.query.classId;
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    if (!classId) {
      return res.status(400).json({ error: "classId manquant" });
    }
    const classInfo = await prisma.class.findUnique({ where: { id: parseInt(classId) } });
    if (!classInfo) {
      return res.status(404).json({ error: "Classe non trouvée" });
    }

    const author = `${req.session.user.firstName || ""} ${req.session.user.lastName || ""}`.trim() || "SAC";
    const { sessions, pdfBuffer } = await generate_class_day_pdf({ classId, date, author });

    if (!sessions.length) {
      return res.status(404).json({ error: "Aucune session trouvée pour cette classe et cette date" });
    }

    const filename = `${classInfo.code}_${date}_emargements.pdf`;
    await log_business("daily_attendance_pdf_generated", "PDF journalier d'emargement genere manuellement.", {
      destination: LOG_DESTINATIONS.BOTH,
      req,
      entityType: "Class",
      entityId: classInfo.id,
      metadata: { filename, date, sessionsCount: sessions.length },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=${filename}`);
    return res.send(pdfBuffer);
  } catch (err) {
    log_technical(TECHNICAL_LEVELS.ERROR, "Daily attendance PDF generation failed", {
      error: err,
      classId: req.query.classId,
      date: req.query.date,
      userId: req.session?.user?.id,
    });
    return res.status(500).json({ error: "Erreur generation PDF journalier" });
  }
});


module.exports = router;
