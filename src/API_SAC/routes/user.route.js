// ./API_SAC/routes/user.route.js
const express = require("express");
const { prisma } = require("../commons/prisma.common");
const { format_session_user } = require("../commons/session_user.common");
const require_access = require("../middlewares/require_access.middleware");
const { ROLES } = require("../commons/constants.common");
const { TECHNICAL_LEVELS, log_technical } = require("../commons/logger.common");

const router = express.Router();

function formatTeacherUser(user, latestBrowserSessionByUserId) {
  const lastSession = latestBrowserSessionByUserId.get(Number(user.id)) || null;
  const lastNfcScan = user.nfcScans?.[0]?.scannedAt || null;
  const lastCourse = user.teachingSessions?.[0] || null;
  const lastFinalization = user.finalizedSessions?.[0] || null;

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    edId: user.edId,
    o365Email: user.o365Email,
    o365AvatarB64: user.o365AvatarB64,
    hasO365AccountLinked: Boolean(user.o365Id || user.o365Email),
    hasLoggedIn: Boolean(user.o365Email),
    lastLoginAt: lastSession?.createdAt || null,
    lastNfcScanAt: lastNfcScan,
    teachingSessionsCount: user._count?.teachingSessions || 0,
    finalizedSessionsCount: user._count?.finalizedSessions || 0,
    attendanceRecordsCount: user._count?.attendance || 0,
    nfcScansCount: user._count?.nfcScans || 0,
    lastCourse: lastCourse
      ? {
          id: lastCourse.id,
          label: lastCourse.label,
          matiere: lastCourse.matiere,
          startTime: lastCourse.startTime,
          endTime: lastCourse.endTime,
          class: lastCourse.class
            ? {
                id: lastCourse.class.id,
                code: lastCourse.class.code,
                name: lastCourse.class.name,
              }
            : null,
          room: lastCourse.room
            ? {
                id: lastCourse.room.id,
                code: lastCourse.room.code,
                name: lastCourse.room.name,
              }
            : null,
        }
      : null,
    lastFinalizationAt: lastFinalization?.createdAt || null,
  };
}

router.get("/teachers", require_access({ minRole: ROLES.STAFF }), async (req, res) => {
  try {
    const [teachers, browserSessions] = await Promise.all([
      prisma.user.findMany({
        where: { role: "teacher" },
        orderBy: [
          { lastName: "asc" },
          { firstName: "asc" },
        ],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
          o365Id: true,
          edId: true,
          o365Email: true,
          o365AvatarB64: true,
          nfcScans: {
            orderBy: { scannedAt: "desc" },
            take: 1,
            select: { scannedAt: true },
          },
          teachingSessions: {
            orderBy: { startTime: "desc" },
            take: 1,
            select: {
              id: true,
              label: true,
              matiere: true,
              startTime: true,
              endTime: true,
              class: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                },
              },
              room: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                },
              },
            },
          },
          finalizedSessions: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
          _count: {
            select: {
              teachingSessions: true,
              finalizedSessions: true,
              attendance: true,
              nfcScans: true,
            },
          },
        },
      }),
      prisma.browserSession.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          data: true,
          createdAt: true,
        },
      }),
    ]);

    const latestBrowserSessionByUserId = new Map();
    for (const browserSession of browserSessions) {
      const userId = Number(browserSession.data?.user?.id);
      if (Number.isInteger(userId) && !latestBrowserSessionByUserId.has(userId)) {
        latestBrowserSessionByUserId.set(userId, browserSession);
      }
    }

    const formattedTeachers = teachers.map(user => formatTeacherUser(user, latestBrowserSessionByUserId));

    return res.json({
      teachers: formattedTeachers,
      summary: {
        teachersCount: formattedTeachers.length,
        linkedCount: formattedTeachers.filter(user => user.hasO365AccountLinked).length,
        loggedInCount: formattedTeachers.filter(user => user.hasLoggedIn).length,
        scannedCount: formattedTeachers.filter(user => user.nfcScansCount > 0).length,
      },
    });
  } catch (err) {
    log_technical(TECHNICAL_LEVELS.ERROR, "Staff teachers fetch failed", {
      error: err,
      userId: req.session?.user?.id,
    });

    return res.status(500).json({
      error: "STAFF_TEACHERS_FETCH_FAILED",
      message: "Erreur lors du chargement des enseignants.",
    });
  }
});

router.get("/me", require_access({ minRole: ROLES.STUDENT }), async (req, res) => {
  try {
    if (!req.session?.user?.id) {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Utilisateur non authentifie." });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.session.user.id },
      include: { class: true },
    });

    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "Utilisateur introuvable." });
    }

    req.session.user = format_session_user(user, req.session.user);
    return res.json(req.session.user);
  } catch (err) {
    log_technical(TECHNICAL_LEVELS.ERROR, "User profile fetch failed", { error: err, userId: req.session?.user?.id });
    return res.status(500).json({
      error: "USER_FETCH_FAILED",
      message: "Erreur lors du chargement du profil.",
    });
  }
});

module.exports = router;
