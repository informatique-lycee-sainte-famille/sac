const express = require("express");
const { prisma } = require("../commons/prisma");
const router = express.Router();

// Liste session (prof)
router.get("/session/:sessionId", async (req, res) => {
  const { sessionId } = req.params;

  const records = await prisma.attendanceRecord.findMany({
    where: { sessionId: parseInt(sessionId) }
  });

  res.json(records);
});

// Validation prof
router.post("/session/:sessionId/validate", async (req, res) => {
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
router.get("/me", async (req, res) => {
  const userId = req.session.userId;

  const records = await prisma.attendanceRecord.findMany({
    where: { studentId: userId }
  });

  res.json(records);
});

module.exports = router;