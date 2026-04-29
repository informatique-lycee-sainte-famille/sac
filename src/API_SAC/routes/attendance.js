const express = require("express");
const { prisma } = require("../commons/prisma");
const require_access = require("../middlewares/require_access");
const { ROLES } = require("../commons/constants");
const { generateClassDayPdf } = require("../workflows/finalizeCourseSession");
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
    const { sessions, pdfBuffer } = await generateClassDayPdf({ classId, date, author });

    if (!sessions.length) {
      return res.status(404).json({ error: "Aucune session trouvée pour cette classe et cette date" });
    }

    const filename = `${classInfo.code}_${date}_emargements.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=${filename}`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error("Daily attendance PDF error:", err);
    return res.status(500).json({ error: "Erreur generation PDF journalier" });
  }
});


module.exports = router;
