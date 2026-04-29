require("../commons/env");
const express = require("express");
const { prisma } = require("../commons/prisma");
const require_access = require("../middlewares/require_access");
const { ROLES } = require("../commons/constants");
const router = express.Router();
const USER_ROLES = ["student", "teacher", "staff", "admin"];
const SESSION_STATUSES = ["scheduled", "ongoing", "completed", "cancelled"];
const ATTENDANCE_STATUSES = ["present", "absent"];
const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  role: true,
  o365Email: true,
  edEmail: true,
  edId: true,
  classId: true,
};
const sessionSelect = {
  id: true,
  label: true,
  matiere: true,
  codeMatiere: true,
  color: true,
  status: true,
  classId: true,
  roomId: true,
  teacherId: true,
  startTime: true,
  endTime: true,
};

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function stringOrNull(value, maxLength = 120) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function parseSessionPayload(body) {
  const classId = parsePositiveInt(body.classId);
  const roomId = parsePositiveInt(body.roomId);
  const teacherId = parsePositiveInt(body.teacherId);
  const startTime = new Date(body.startTime);
  const endTime = new Date(body.endTime);
  const status = body.status || "scheduled";

  if (!classId || !roomId || !teacherId || Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    return { error: "Champs session invalides." };
  }

  if (endTime <= startTime) {
    return { error: "La fin du cours doit etre apres le debut." };
  }

  if (!SESSION_STATUSES.includes(status)) {
    return { error: "Statut de session invalide." };
  }

  return {
    data: {
      label: stringOrNull(body.label),
      matiere: stringOrNull(body.matiere),
      codeMatiere: stringOrNull(body.codeMatiere, 40),
      color: stringOrNull(body.color, 40),
      status,
      classId,
      roomId,
      teacherId,
      startTime,
      endTime,
    },
  };
}

router.use(require_access({ minRole: ROLES.ADMIN }));

// USERS
router.get("/users", async (req, res) => {
  const { role } = req.query;
  if (role && !USER_ROLES.includes(role)) {
    return res.status(400).json({ error: "Role invalide" });
  }

  const users = await prisma.user.findMany({
    where: role ? { role } : {},
    select: userSelect,
    orderBy: [
      { lastName: "asc" },
      { firstName: "asc" },
    ],
    take: 500,
  });

  res.json(users);
});

router.patch("/users/:userId/role", async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;
  const parsedUserId = parsePositiveInt(userId);

  if (!parsedUserId || !USER_ROLES.includes(role)) {
    return res.status(400).json({ error: "Utilisateur ou role invalide" });
  }

  const user = await prisma.user.update({
    where: { id: parsedUserId },
    data: { role },
    select: userSelect,
  });

  res.json(user);
});

// SESSION CRUD
router.post("/sessions", async (req, res) => {
  const parsed = parseSessionPayload(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const session = await prisma.courseSession.create({
    data: parsed.data,
    select: sessionSelect,
  });

  res.json(session);
});

router.patch("/sessions/:id", async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  const parsed = parseSessionPayload(req.body);
  if (!id) return res.status(400).json({ error: "Session invalide" });
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const session = await prisma.courseSession.update({
    where: { id },
    data: parsed.data,
    select: sessionSelect,
  });

  res.json(session);
});

router.delete("/sessions/:id", async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "Session invalide" });

  await prisma.courseSession.delete({
    where: { id }
  });

  res.json({ message: "Session supprimée" });
});

// OVERRIDE ATTENDANCE
router.post("/attendance/override", async (req, res) => {
  const { sessionId, studentId, status } = req.body;
  const parsedSessionId = parseInt(sessionId, 10);
  const parsedUserId = parseInt(studentId, 10);

  if (!Number.isInteger(parsedSessionId) || !Number.isInteger(parsedUserId)) {
    return res.status(400).json({ error: "Session ou utilisateur invalide" });
  }

  if (!ATTENDANCE_STATUSES.includes(status)) {
    return res.status(400).json({ error: "Statut invalide" });
  }

  await prisma.attendanceRecord.upsert({
    where: {
      sessionId_userId: { sessionId: parsedSessionId, userId: parsedUserId }
    },
    update: { status },
    create: { sessionId: parsedSessionId, userId: parsedUserId, status }
  });

  res.json({ message: "Présence corrigée" });
});

// RESET SESSION
router.post("/attendance/reset/:sessionId", async (req, res) => {
  const sessionId = parsePositiveInt(req.params.sessionId);
  if (!sessionId) return res.status(400).json({ error: "Session invalide" });

  await prisma.attendanceRecord.deleteMany({
    where: { sessionId }
  });

  res.json({ message: "Session reset" });
});

// NFC LOGS
router.get("/nfc/logs", async (req, res) => {
  const logs = await prisma.nfcScan.findMany({
    orderBy: { scannedAt: "desc" },
    take: 100,
    select: {
      id: true,
      nfcUid: true,
      roomId: true,
      userId: true,
      sessionId: true,
      eventType: true,
      comment: true,
      scannedAt: true,
      ipAddress: true,
      deviceFingerprint: true,
    },
  });

  res.json(logs);
});

module.exports = router;
