const express = require("express");
const { DateTime } = require("luxon");
const { prisma } = require("../commons/prisma");
const require_access = require("../middlewares/require_access");
const { ROLES } = require("../commons/constants");
const { generateAttendancePdf } = require("../../scripts/generateAttendancePdf");

const router = express.Router();
const APP_TIMEZONE = process.env.TIMEZONE || "Europe/Paris";

function getSessionUser(req) {
  return req.session?.user || null;
}

function getDayBounds(date) {
  const requestedDay = date
    ? DateTime.fromISO(String(date), { zone: APP_TIMEZONE })
    : DateTime.now().setZone(APP_TIMEZONE);
  const day = requestedDay.isValid ? requestedDay : DateTime.now().setZone(APP_TIMEZONE);

  return {
    isoDate: day.toISODate(),
    start: day.startOf("day").toJSDate(),
    end: day.endOf("day").toJSDate(),
  };
}

function formatSession(session, currentUserId) {
  const currentUserAttendance = session.attendance?.find(record => record.userId === currentUserId) || null;
  const stats = getAttendanceStats(session);

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
          hasSignature: Boolean(currentUserAttendance.signature),
        }
      : null,
    isFinalized: Boolean(session.finalization),
    finalization: session.finalization
      ? {
          sentToEdAt: session.finalization.sentToEdAt,
          pdfFilename: session.finalization.pdfFilename,
        }
      : null,
    stats,
  };
}

function getStudentUsers(session) {
  return session.class?.users?.filter(user => user.role === "student") || [];
}

function getAttendanceStats(session) {
  const students = getStudentUsers(session);
  const studentIds = new Set(students.map(student => student.id));
  const presentCount = (session.attendance || []).filter(record => (
    record.status === "present" &&
    (record.user?.role === "student" || studentIds.has(record.userId))
  )).length;
  const totalStudents = students.length || presentCount;
  const absentCount = Math.max(totalStudents - presentCount, 0);
  const presencePercent = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

  return {
    totalStudents,
    presentCount,
    absentCount,
    presencePercent,
  };
}

function formatHoraire(session) {
  const start = DateTime.fromJSDate(new Date(session.startTime)).setZone(APP_TIMEZONE).toFormat("HH:mm");
  const end = DateTime.fromJSDate(new Date(session.endTime)).setZone(APP_TIMEZONE).toFormat("HH:mm");
  return `${start}-${end}`;
}

function schoolYear(date = new Date()) {
  const year = date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1;
  return `${year} - ${year + 1}`;
}

function sessionToPdfData(session, author) {
  const attendanceByUser = new Map(session.attendance.map(record => [record.userId, record]));
  const teacherAttendance = attendanceByUser.get(session.teacherId);
  const students = session.class.users || [];

  return {
    className: session.class.name || session.class.code,
    year: schoolYear(new Date(session.startTime)),
    courseLabel: session.label || session.matiere || session.codeMatiere,
    roomCode: session.room.code,
    roomName: session.room.name,
    startTime: session.startTime,
    endTime: session.endTime,
    author,
    finalization: session.finalization
      ? {
          sentToEdAt: session.finalization.sentToEdAt,
          sentByUserId: session.finalization.sentByUserId,
          pdfFilename: session.finalization.pdfFilename,
        }
      : null,
    teacher: {
      firstName: session.teacher.firstName,
      lastName: session.teacher.lastName,
      status: teacherAttendance?.status === "present" ? "present" : "absent",
      scannedAt: teacherAttendance?.scannedAt || null,
      signature: teacherAttendance?.signature || null,
    },
    students: students.map(student => {
      const attendance = attendanceByUser.get(student.id);
      return {
        firstName: student.firstName,
        lastName: student.lastName,
        status: attendance?.status === "present" ? "present" : "absent",
        scannedAt: attendance?.scannedAt || null,
        signature: attendance?.signature || null,
      };
    }),
  };
}

function canReadSession(user, session) {
  if (["staff", "admin"].includes(user.role)) return true;
  if (user.role === "teacher") return session.teacherId === user.id;
  if (user.role === "student") return session.classId === user.classId;
  return false;
}

// Sessions du jour
router.get("/today", require_access({ minRole: ROLES.STUDENT }), async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser?.id) {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Utilisateur non authentifie." });
    }

    const userId = Number(sessionUser.id);
    const { start, end, isoDate } = getDayBounds(req.query.date);

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
        class: {
          include: {
            users: {
              where: { role: "student" },
              select: {
                id: true,
                role: true,
              },
            },
          },
        },
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
                role: true,
              },
            },
          },
        },
        finalization: {
          select: {
            id: true,
            sentToEdAt: true,
            pdfFilename: true,
          },
        },
      },
      orderBy: [
        { startTime: "asc" },
        { endTime: "asc" },
      ],
    });

    return res.json({
      date: isoDate,
      sessions: sessions.map(session => formatSession(session, dbUser.id)),
    });
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

    const dbUser = await prisma.user.findUnique({
      where: { id: Number(sessionUser.id) },
      select: { id: true, role: true, classId: true },
    });

    if (!dbUser) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "Utilisateur introuvable." });
    }

    const session = await prisma.courseSession.findUnique({
      where: { id: sessionId },
      include: {
        class: {
          include: {
            users: {
              where: { role: "student" },
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
              },
              orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
            },
          },
        },
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
                o365Email: true,
                edEmail: true,
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

    if (!canReadSession(dbUser, session)) {
      return res.status(403).json({ error: "SESSION_FORBIDDEN", message: "Acces interdit a cette session." });
    }

    const isTeacherOwner = dbUser.role === "teacher" && session.teacherId === dbUser.id;
    const userAttendance = session.attendance.find(record => record.userId === dbUser.id) || null;
    const visibleAttendance = isTeacherOwner || ["staff", "admin"].includes(dbUser.role)
      ? session.attendance
      : (userAttendance ? [userAttendance] : []);

    return res.json({
      id: session.id,
      label: session.label,
      matiere: session.matiere,
      codeMatiere: session.codeMatiere,
      color: session.color,
      status: session.status,
      startTime: session.startTime,
      endTime: session.endTime,
      horaire: formatHoraire(session),
      class: session.class,
      room: session.room,
      teacher: session.teacher,
      finalization: session.finalization,
      stats: getAttendanceStats(session),
      currentUserAttendance: userAttendance,
      attendance: visibleAttendance,
      canGeneratePdf: isTeacherOwner,
    });
  } catch (err) {
    return res.status(500).json({
      error: "SESSION_FETCH_FAILED",
      message: err.message,
    });
  }
});

router.get("/:sessionId/pdf", require_access({ minRole: ROLES.TEACHER }), async (req, res) => {
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
        class: {
          include: {
            users: {
              where: { role: "student" },
              orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
            },
          },
        },
        room: true,
        teacher: true,
        attendance: { include: { user: true } },
        finalization: true,
      },
    });

    if (!session) {
      return res.status(404).json({ error: "SESSION_NOT_FOUND", message: "Session introuvable." });
    }

    if (session.teacherId !== Number(sessionUser.id)) {
      return res.status(403).json({ error: "TEACHER_NOT_ASSIGNED", message: "Cet enseignant n'est pas affecte a ce cours." });
    }

    const author = `${sessionUser.firstName || ""} ${sessionUser.lastName || ""}`.trim() || "SAC";
    const pdfBuffer = await generateAttendancePdf(sessionToPdfData(session, author));
    const day = DateTime.fromJSDate(new Date(session.startTime)).setZone(APP_TIMEZONE).toFormat("yyyy-MM-dd_HH-mm");
    const filename = `${session.class.code}_${day}_emargement.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=${filename}`);
    return res.send(pdfBuffer);
  } catch (err) {
    return res.status(500).json({
      error: "SESSION_PDF_FAILED",
      message: err.message,
    });
  }
});

module.exports = router;
