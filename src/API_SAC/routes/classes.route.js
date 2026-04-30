// ./API_SAC/routes/classes.route.js
const express = require("express");
const { prisma } = require("../commons/prisma.common");
const require_access = require("../middlewares/require_access.middleware");
const { ROLES } = require("../commons/constants.common");
const { TECHNICAL_LEVELS, log_technical } = require("../commons/logger.common");

const router = express.Router();

function getSessionUser(req) {
  return req.session?.user || null;
}

function formatStaffStudent(student, latestBrowserSessionByUserId) {
  const lastLogin = latestBrowserSessionByUserId.get(Number(student.id))?.createdAt || null;
  const lastScan = student.nfcScans?.[0]?.scannedAt || null;
  const lastAttendance = student.attendance?.[0] || null;

  return {
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    role: student.role,
    edId: student.edId,
    o365Email: student.o365Email,
    edEmail: student.edEmail,
    o365AvatarB64: student.o365AvatarB64,
    edPhotoB64: student.edPhotoB64,
    hasO365AccountLinked: Boolean(student.o365Id || student.o365Email),
    hasLoggedIn: Boolean(student.o365Email),
    lastLoginAt: lastLogin,
    lastNfcScanAt: lastScan,
    attendanceRecordsCount: student._count?.attendance || 0,
    nfcScansCount: student._count?.nfcScans || 0,
    lastAttendance: lastAttendance
      ? {
          status: lastAttendance.status,
          scannedAt: lastAttendance.scannedAt,
          updatedAt: lastAttendance.updatedAt,
          session: lastAttendance.session
            ? {
                id: lastAttendance.session.id,
                label: lastAttendance.session.label,
                matiere: lastAttendance.session.matiere,
                startTime: lastAttendance.session.startTime,
                endTime: lastAttendance.session.endTime,
              }
            : null,
        }
      : null,
  };
}

router.get("/staff", require_access({ minRole: ROLES.STAFF }), async (req, res) => {
  try {
    const [classes, browserSessions] = await Promise.all([
      prisma.class.findMany({
        orderBy: [
          { name: "asc" },
          { code: "asc" },
        ],
        include: {
          users: {
            where: { role: "student" },
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
              edEmail: true,
              o365AvatarB64: true,
              edPhotoB64: true,
              nfcScans: {
                orderBy: { scannedAt: "desc" },
                take: 1,
                select: { scannedAt: true },
              },
              attendance: {
                orderBy: { updatedAt: "desc" },
                take: 1,
                select: {
                  status: true,
                  scannedAt: true,
                  updatedAt: true,
                  session: {
                    select: {
                      id: true,
                      label: true,
                      matiere: true,
                      startTime: true,
                      endTime: true,
                    },
                  },
                },
              },
              _count: {
                select: {
                  attendance: true,
                  nfcScans: true,
                },
              },
            },
          },
          _count: {
            select: {
              sessions: true,
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

    return res.json({
      classes: classes.map(cls => {
        const students = cls.users.map(student => formatStaffStudent(student, latestBrowserSessionByUserId));
        const linkedCount = students.filter(student => student.hasO365AccountLinked).length;
        const loggedInCount = students.filter(student => student.hasLoggedIn).length;
        const scannedCount = students.filter(student => student.nfcScansCount > 0).length;

        return {
          id: cls.id,
          edId: cls.edId,
          code: cls.code,
          name: cls.name,
          studentsCount: students.length,
          linkedCount,
          loggedInCount,
          scannedCount,
          sessionsCount: cls._count.sessions,
          students,
        };
      }),
    });
  } catch (err) {
    log_technical(TECHNICAL_LEVELS.ERROR, "Staff classes fetch failed", {
      error: err,
      userId: req.session?.user?.id,
    });

    return res.status(500).json({
      error: "STAFF_CLASSES_FETCH_FAILED",
      message: "Erreur lors du chargement des classes.",
    });
  }
});

router.get("/me", require_access({ minRole: ROLES.STUDENT }), async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser?.id) {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Utilisateur non authentifie." });
    }

    const user = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: {
        id: true,
        role: true,
        classId: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "Utilisateur introuvable." });
    }

    if (user.role !== "student") {
      return res.status(403).json({ error: "STUDENT_REQUIRED", message: "Cette route concerne la classe de l'eleve." });
    }

    if (!user.classId) {
      return res.status(404).json({ error: "CLASS_NOT_FOUND", message: "Aucune classe rattachee a cet eleve." });
    }

    const myClass = await prisma.class.findUnique({
      where: { id: user.classId },
      include: {
        users: {
          where: { role: "student" },
          orderBy: [
            { lastName: "asc" },
            { firstName: "asc" },
          ],
          select: {
            id: true,
            firstName: true,
            lastName: true,
            o365AvatarB64: true,
            edPhotoB64: true,
          },
        },
      },
    });

    return res.json(myClass);
  } catch (err) {
    log_technical(TECHNICAL_LEVELS.ERROR, "Class fetch failed", { error: err, userId: req.session?.user?.id });
    return res.status(500).json({
      error: "CLASS_FETCH_FAILED",
      message: "Erreur lors du chargement de la classe.",
    });
  }
});

module.exports = router;
