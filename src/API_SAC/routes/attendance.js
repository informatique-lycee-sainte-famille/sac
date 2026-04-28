const express = require("express");
const { prisma } = require("../commons/prisma");
const { sendMail } = require("../commons/mail");
const require_access = require("../middlewares/require_access");
const { ROLES } = require("../commons/constants");
const generateAttendancePdf = require("../../scripts/generateAttendancePdf");
const { generateClassDayPdf } = require("../workflows/finalizeCourseSession");
const router = express.Router();

// Liste session (prof)
router.get("/session/:sessionId", require_access({ minRole: ROLES.TEACHER }), async (req, res) => {
  const { sessionId } = req.params;

  const records = await prisma.attendanceRecord.findMany({
    where: { sessionId: parseInt(sessionId) }
  });

  res.json(records);
});

// Validation prof
router.post("/session/:sessionId/validate", require_access({ minRole: ROLES.TEACHER }), async (req, res) => {
  const { sessionId } = req.params;
  const updates = req.body;

  try {
    const queries = updates.map(u =>
      prisma.attendanceRecord.upsert({
        where: {
          sessionId_studentId: {
            sessionId: parseInt(sessionId),
            studentId: u.studentId
          }
        },
        update: { status: u.status },
        create: {
          sessionId: parseInt(sessionId),
          studentId: u.studentId,
          status: u.status
        }
      })
    );

    await prisma.$transaction(queries);

    res.json({ message: "Présences mises à jour" });
  } catch (err) {
    res.status(500).json({ error: "Erreur validation" });
  }
});

// Historique perso
router.get("/me", require_access({ minRole: ROLES.STUDENT }), async (req, res) => {
  const userId = req.session.userId;

  const records = await prisma.attendanceRecord.findMany({
    where: { studentId: userId }
  });

  res.json(records);
});

router.get("/pdf/day", require_access({ minRole: ROLES.TEACHER }), async (req, res) => {
  try {
    const classId = req.query.classId;
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    if (!classId) {
      return res.status(400).json({ error: "classId manquant" });
    }
    const classInfo = await prisma.class.findUnique({ where: { id: parseInt(classId) } });
    if (!classInfo) {
      return res.status(404).json({ error: "Classe non trouvee" });
    }

    const author = `${req.session.user.firstName || ""} ${req.session.user.lastName || ""}`.trim() || "SAC";
    const { sessions, pdfBuffer } = await generateClassDayPdf({ classId, date, author });

    if (!sessions.length) {
      return res.status(404).json({ error: "Aucune session trouvee pour cette classe et cette date" });
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
