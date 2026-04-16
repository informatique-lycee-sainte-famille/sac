const express = require("express");
const { prisma } = require("../commons/prisma");
const require_access = require("../middlewares/require_access");
const { ROLES } = require("../commons/constants");
const router = express.Router();

// USERS
router.get("/users", async (req, res) => {
  const { role } = req.query;

  const users = await prisma.user.findMany({
    where: role ? { role } : {}
  });

  res.json(users);
});

router.patch("/users/:userId/role", async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;

  const user = await prisma.user.update({
    where: { id: parseInt(userId) },
    data: { role }
  });

  res.json(user);
});

// SESSION CRUD
router.post("/sessions", async (req, res) => {
  const session = await prisma.courseSession.create({
    data: req.body
  });

  res.json(session);
});

router.patch("/sessions/:id", async (req, res) => {
  const session = await prisma.courseSession.update({
    where: { id: parseInt(req.params.id) },
    data: req.body
  });

  res.json(session);
});

router.delete("/sessions/:id", async (req, res) => {
  await prisma.courseSession.delete({
    where: { id: parseInt(req.params.id) }
  });

  res.json({ message: "Session supprimée" });
});

// OVERRIDE ATTENDANCE
router.post("/attendance/override", async (req, res) => {
  const { sessionId, studentId, status } = req.body;

  await prisma.attendanceRecord.upsert({
    where: {
      sessionId_studentId: { sessionId, studentId }
    },
    update: { status },
    create: { sessionId, studentId, status }
  });

  res.json({ message: "Présence corrigée" });
});

// RESET SESSION
router.post("/attendance/reset/:sessionId", async (req, res) => {
  await prisma.attendanceRecord.deleteMany({
    where: { sessionId: parseInt(req.params.sessionId) }
  });

  res.json({ message: "Session reset" });
});

// NFC LOGS
router.get("/nfc/logs", async (req, res) => {
  const logs = await prisma.nfcScan.findMany({
    orderBy: { scannedAt: "desc" },
    take: 100
  });

  res.json(logs);
});

// INSTITUTION INFO
router.get("/institution", require_access({ role: ROLES.STUDENT }), async (req, res) => {
  const institution = await prisma.institution.findFirst();
  res.json(institution);
});

module.exports = router;