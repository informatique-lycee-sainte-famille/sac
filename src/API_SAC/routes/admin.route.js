// ./API_SAC/routes/admin.route.js
require("../commons/env.common");
const express = require("express");
const { prisma } = require("../commons/prisma.common");
const require_access = require("../middlewares/require_access.middleware");
const { ROLES } = require("../commons/constants.common");
const { LOG_DESTINATIONS, log_business, purge_business_logs } = require("../commons/logger.common");
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
  o365AvatarB64: true,
  edPhotoUrl: true,
  edPhotoB64: true,
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

  await log_business("admin_user_role_updated", "Un admin a modifié le rôle d'un utilisateur.", {
    req,
    destination: LOG_DESTINATIONS.BOTH,
    entityType: "User",
    entityId: parsedUserId,
    metadata: { role },
  });

  res.json(user);
});

router.post("/users/:userId/force-logout", async (req, res) => {
  const { userId } = req.params;
  const parsedUserId = parsePositiveInt(userId);

  if (!parsedUserId) {
    return res.status(400).json({ error: "Utilisateur invalide" });
  }

  // Check user exists
  const user = await prisma.user.findUnique({
    where: { id: parsedUserId },
    select: { id: true, firstName: true, lastName: true },
  });

  if (!user) {
    return res.status(404).json({ error: "Utilisateur non trouvé" });
  }

  // Delete all browser sessions for this user
  const deletedSessions = await prisma.browserSession.deleteMany({
    where: {
      data: {
        path: ["user", "id"],
        equals: parsedUserId,
      },
    },
  });

  await log_business("admin_user_force_logout", "Un admin a forcé la déconnexion d'un utilisateur.", {
    req,
    destination: LOG_DESTINATIONS.BOTH,
    entityType: "User",
    entityId: parsedUserId,
    metadata: {
      deletedSessionCount: deletedSessions.count,
    },
  });

  res.json({ message: "Utilisateur déconnecté", deletedSessionCount: deletedSessions.count });
});

router.delete("/users/:userId", async (req, res) => {
  const { userId } = req.params;
  const parsedUserId = parsePositiveInt(userId);

  if (!parsedUserId) {
    return res.status(400).json({ error: "Utilisateur invalide" });
  }

  // Check user exists
  const user = await prisma.user.findUnique({
    where: { id: parsedUserId },
    select: { id: true, firstName: true, lastName: true, role: true },
  });

  if (!user) {
    return res.status(404).json({ error: "Utilisateur non trouvé" });
  }

  // Prevent deletion of the last admin
  if (user.role === "admin") {
    const adminCount = await prisma.user.count({
      where: { role: "admin" },
    });
    if (adminCount <= 1) {
      return res.status(400).json({ error: "Impossible de supprimer le dernier administrateur" });
    }
  }

  // Delete all related data in correct order
  await prisma.attendanceRecord.deleteMany({
    where: { userId: parsedUserId },
  });

  await prisma.nfcScan.deleteMany({
    where: { userId: parsedUserId },
  });

  await prisma.browserSession.deleteMany({
    where: {
      data: {
        path: ["user", "id"],
        equals: parsedUserId,
      },
    },
  });

  const deletedUser = await prisma.user.delete({
    where: { id: parsedUserId },
    select: userSelect,
  });

  await log_business("admin_user_deleted", "Un admin a supprimé un compte utilisateur.", {
    req,
    destination: LOG_DESTINATIONS.BOTH,
    entityType: "User",
    entityId: parsedUserId,
    metadata: {
      deletedUser: {
        id: deletedUser.id,
        firstName: deletedUser.firstName,
        lastName: deletedUser.lastName,
        role: deletedUser.role,
      },
    },
  });

  res.json({ message: "Utilisateur supprimé", deletedUser });
});

// ROOMS
router.get("/rooms", async (req, res) => {
  const rooms = await prisma.room.findMany({
    orderBy: [
      { name: "asc" },
      { code: "asc" },
    ],
    select: {
      id: true,
      code: true,
      name: true,
      nfcUid: true,
    },
  });

  res.json(rooms);
});

// CLASSES
router.get("/classes", async (req, res) => {
  const classes = await prisma.class.findMany({
    orderBy: [
      { name: "asc" },
      { code: "asc" },
    ],
    select: {
      id: true,
      code: true,
      name: true,
    },
  });

  res.json(classes);
});

// TEACHERS
router.get("/teachers", async (req, res) => {
  const teachers = await prisma.user.findMany({
    where: { role: "teacher" },
    orderBy: [
      { lastName: "asc" },
      { firstName: "asc" },
    ],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      o365Email: true,
      edEmail: true,
    },
  });

  res.json(teachers);
});

// SESSION CRUD
router.post("/sessions", async (req, res) => {
  const parsed = parseSessionPayload(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const session = await prisma.courseSession.create({
    data: parsed.data,
    select: sessionSelect,
  });

  await log_business("admin_course_session_created", "Un admin a créé un cours.", {
    req,
    destination: LOG_DESTINATIONS.BOTH,
    entityType: "CourseSession",
    entityId: session.id,
    metadata: parsed.data,
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

  await log_business("admin_course_session_updated", "Un admin a modifié un cours.", {
    req,
    destination: LOG_DESTINATIONS.BOTH,
    entityType: "CourseSession",
    entityId: id,
    metadata: parsed.data,
  });

  res.json(session);
});

router.delete("/sessions/:id", async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "Session invalide" });

  await prisma.courseSession.delete({
    where: { id }
  });

  await log_business("admin_course_session_deleted", "Un admin a supprimé un cours.", {
    req,
    destination: LOG_DESTINATIONS.BOTH,
    entityType: "CourseSession",
    entityId: id,
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

  await log_business("admin_attendance_overridden", "Un admin a corrigé une présence.", {
    req,
    destination: LOG_DESTINATIONS.BOTH,
    entityType: "AttendanceRecord",
    entityId: `${parsedSessionId}:${parsedUserId}`,
    metadata: { sessionId: parsedSessionId, userId: parsedUserId, status },
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

  await log_business("admin_attendance_reset", "Un admin a réinitialisé les présences d'un cours.", {
    req,
    destination: LOG_DESTINATIONS.BOTH,
    entityType: "CourseSession",
    entityId: sessionId,
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

// BUSINESS LOGS
router.get("/business/logs", async (req, res) => {
  const take = Math.min(parsePositiveInt(req.query.take) || 100, 500);
  const userId = parsePositiveInt(req.query.userId);
  const event = stringOrNull(req.query.event, 160);
  const entityType = stringOrNull(req.query.entityType, 80);

  const where = {};
  if (userId) where.userId = userId;
  if (event) where.event = event;
  if (entityType) where.entityType = entityType;

  const logs = await prisma.businessLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
          o365Email: true,
          edEmail: true,
        },
      },
    },
  });

  res.json(logs);
});

router.post("/business/logs/purge", async (req, res) => {
  const retentionDays = parsePositiveInt(req.body?.retentionDays);
  const result = await purge_business_logs(retentionDays ? { retentionDays } : {});

  await log_business("admin_business_logs_purged", "Un admin a purge les logs metier.", {
    req,
    destination: LOG_DESTINATIONS.BOTH,
    entityType: "BusinessLog",
    metadata: {
      retentionDays: retentionDays || Number.parseInt(process.env.BUSINESS_LOG_RETENTION_DAYS || "30", 10),
      deletedCount: result.count,
    },
  });

  res.json({ deletedCount: result.count });
});

module.exports = router;
