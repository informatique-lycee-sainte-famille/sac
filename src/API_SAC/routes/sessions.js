const express = require("express");
const { DateTime } = require("luxon");
const { prisma } = require("../commons/prisma");
const require_access = require("../middlewares/require_access");
const { ROLES } = require("../commons/constants");

const router = express.Router();
const APP_TIMEZONE = process.env.TIMEZONE || "Europe/Paris";

function getSessionUser(req) {
  return req.session?.user || null;
}

function getTodayBounds() {
  const now = DateTime.now().setZone(APP_TIMEZONE);

  return {
    start: now.startOf("day").toJSDate(),
    end: now.endOf("day").toJSDate(),
  };
}

function formatSession(session, currentUserId) {
  const currentUserAttendance = session.attendance?.find(record => record.userId === currentUserId) || null;

  return {
    id: session.id,
    label: session.label,
    matiere: session.matiere,
    codeMatiere: session.codeMatiere,
    color: session.color,
    status: session.status,
    startTime: session.startTime,
    endTime: session.endTime,
    class: session.class
      ? {
          id: session.class.id,
          code: session.class.code,
          name: session.class.name,
          edId: session.class.edId,
        }
      : null,
    room: session.room
      ? {
          id: session.room.id,
          code: session.room.code,
          name: session.room.name,
        }
      : null,
    teacher: session.teacher
      ? {
          id: session.teacher.id,
          firstName: session.teacher.firstName,
          lastName: session.teacher.lastName,
          email: session.teacher.o365Email || session.teacher.edEmail,
        }
      : null,
    attendance: currentUserAttendance
      ? {
          status: currentUserAttendance.status,
          scannedAt: currentUserAttendance.scannedAt,
        }
      : null,
    isFinalized: Boolean(session.finalization),
  };
}

// Sessions du jour
router.get("/today", require_access({ minRole: ROLES.STUDENT }), async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser?.id) {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Utilisateur non authentifie." });
    }

    const userId = Number(sessionUser.id);
    const { start, end } = getTodayBounds();

    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        classId: true,
      },
    });

    if (!dbUser) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "Utilisateur introuvable." });
    }

    const visibilityFilters = [];
    const canSeeAllSessions = ["staff", "admin"].includes(dbUser.role);

    if (dbUser.role === "teacher") {
      visibilityFilters.push({ teacherId: dbUser.id });
    }

    if (dbUser.role === "student") {
      if (!dbUser.classId) {
        return res.json([]);
      }

      visibilityFilters.push({ classId: dbUser.classId });
    }

    if (!canSeeAllSessions && visibilityFilters.length === 0) {
      return res.json([]);
    }

    const where = {
      startTime: {
        gte: start,
        lte: end,
      },
    };

    if (!canSeeAllSessions) {
      where.OR = visibilityFilters;
    }

    const sessions = await prisma.courseSession.findMany({
      where,
      include: {
        class: true,
        room: true,
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            o365Email: true,
            edEmail: true,
          },
        },
        attendance: {
          where: { userId: dbUser.id },
          select: {
            userId: true,
            status: true,
            scannedAt: true,
          },
        },
        finalization: {
          select: {
            id: true,
          },
        },
      },
      orderBy: [
        { startTime: "asc" },
        { endTime: "asc" },
      ],
    });

    return res.json(sessions.map(session => formatSession(session, dbUser.id)));
  } catch (err) {
    return res.status(500).json({
      error: "SESSION_FETCH_FAILED",
      message: err.message,
    });
  }
});

// Détail session
router.get("/:sessionId", require_access({ minRole: ROLES.STUDENT }), async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    const sessionId = Number.parseInt(req.params.sessionId, 10);

    if (!sessionUser?.id) {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Utilisateur non authentifie." });
    }

    if (!Number.isInteger(sessionId)) {
      return res.status(400).json({ error: "INVALID_SESSION_ID", message: "Identifiant de session invalide." });
    }

    const session = await prisma.courseSession.findUnique({
      where: { id: sessionId },
      include: {
        class: true,
        room: true,
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            o365Email: true,
            edEmail: true,
          },
        },
        attendance: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
        },
        finalization: true,
      },
    });

    if (!session) {
      return res.status(404).json({ error: "SESSION_NOT_FOUND", message: "Session introuvable." });
    }

    return res.json(session);
  } catch (err) {
    return res.status(500).json({
      error: "SESSION_FETCH_FAILED",
      message: err.message,
    });
  }
});

module.exports = router;
