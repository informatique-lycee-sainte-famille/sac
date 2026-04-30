// ./API_SAC/routes/sessions.route.js
const express = require("express");
const { DateTime } = require("luxon");
const sharp = require("sharp");
const { prisma } = require("../commons/prisma.common");
const require_access = require("../middlewares/require_access.middleware");
const { ROLES } = require("../commons/constants.common");
const { LOG_DESTINATIONS, TECHNICAL_LEVELS, log_business, log_technical } = require("../commons/logger.common");
const { broadcastAttendanceUpdate } = require("../commons/realtime.common");
const { generate_attendance_pdf } = require("../../scripts/auto/generate_attendance_pdf.script");

const router = express.Router();
const APP_TIMEZONE = process.env.TIMEZONE || "Europe/Paris";

function getSessionUser(req) {
  return req.session?.user || null;
}

function normalizeView(view) {
  return ["day", "week", "month"].includes(view) ? view : "day";
}

function getPeriodBounds(date, view = "day") {
  const requestedDay = date
    ? DateTime.fromISO(String(date), { zone: APP_TIMEZONE })
    : DateTime.now().setZone(APP_TIMEZONE);
  const day = requestedDay.isValid ? requestedDay : DateTime.now().setZone(APP_TIMEZONE);
  const safeView = normalizeView(view);
  const start = safeView === "week"
    ? day.startOf("week")
    : safeView === "month"
      ? day.startOf("month")
      : day.startOf("day");
  const end = safeView === "week"
    ? day.endOf("week")
    : safeView === "month"
      ? day.endOf("month")
      : day.endOf("day");

  return {
    isoDate: day.toISODate(),
    view: safeView,
    start: start.toJSDate(),
    end: end.toJSDate(),
    range: {
      start: start.toISODate(),
      end: end.toISODate(),
    },
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

function parseOptionalInt(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function getCourseLabel(session) {
  return session.label || session.matiere || session.codeMatiere || "Cours";
}

function makeEmptyAggregate(id, label) {
  return {
    id,
    label,
    sessions: 0,
    finalizedSessions: 0,
    expectedStudents: 0,
    presentCount: 0,
    absentCount: 0,
    presencePercent: 0,
  };
}

function addSessionToAggregate(aggregate, session) {
  const stats = getAttendanceStats(session);
  aggregate.sessions += 1;
  aggregate.finalizedSessions += session.finalization ? 1 : 0;
  aggregate.expectedStudents += stats.totalStudents;
  aggregate.presentCount += stats.presentCount;
  aggregate.absentCount += stats.absentCount;
  aggregate.presencePercent = aggregate.expectedStudents > 0
    ? Math.round((aggregate.presentCount / aggregate.expectedStudents) * 100)
    : 0;
}

function aggregateBy(sessions, getKey) {
  const groups = new Map();

  for (const session of sessions) {
    const { id, label } = getKey(session);
    const key = String(id || label || "unknown");
    if (!groups.has(key)) {
      groups.set(key, makeEmptyAggregate(id, label));
    }

    addSessionToAggregate(groups.get(key), session);
  }

  return [...groups.values()].sort((a, b) => b.presencePercent - a.presencePercent || a.label.localeCompare(b.label));
}

function buildStaffSummary(sessions) {
  const global = makeEmptyAggregate("global", "Global");
  sessions.forEach(session => addSessionToAggregate(global, session));

  return {
    global,
    byClass: aggregateBy(sessions, session => ({
      id: session.class?.id,
      label: session.class?.name || session.class?.code || "Classe inconnue",
    })),
    byTeacher: aggregateBy(sessions, session => ({
      id: session.teacher?.id,
      label: `${session.teacher?.lastName || ""} ${session.teacher?.firstName || ""}`.trim() || "Enseignant inconnu",
    })),
    bySubject: aggregateBy(sessions, session => ({
      id: session.codeMatiere || session.matiere || session.label || "unknown",
      label: session.matiere || session.label || session.codeMatiere || "Matiere inconnue",
    })),
    byRoom: aggregateBy(sessions, session => ({
      id: session.room?.id,
      label: session.room?.name || session.room?.code || "Salle inconnue",
    })),
  };
}

function formatStaffSession(session) {
  const stats = getAttendanceStats(session);

  return {
    id: session.id,
    label: getCourseLabel(session),
    matiere: session.matiere,
    codeMatiere: session.codeMatiere,
    status: session.status,
    startTime: session.startTime,
    endTime: session.endTime,
    class: session.class
      ? {
          id: session.class.id,
          code: session.class.code,
          name: session.class.name,
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
    finalization: session.finalization
      ? {
          sentToEdAt: session.finalization.sentToEdAt,
          pdfFilename: session.finalization.pdfFilename,
        }
      : null,
    stats,
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

async function manualSignatureDataUrl({ status, teacherName, studentName, scannedAt }) {
  const title = status === "present"
    ? "Présence validée manuellement"
    : "Absence validée manuellement";
  const timestamp = DateTime.fromJSDate(scannedAt).setZone(APP_TIMEZONE).toFormat("dd/MM/yyyy HH:mm");
  const escapeSvg = value => String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="220" viewBox="0 0 640 220">
      <rect width="640" height="220" fill="#ffffff"/>
      <rect x="10" y="10" width="620" height="200" fill="none" stroke="#624292" stroke-width="4"/>
      <text x="32" y="62" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#624292">${escapeSvg(title)}</text>
      <text x="32" y="108" font-family="Arial, sans-serif" font-size="24" fill="#111827">Elève: ${escapeSvg(studentName)}</text>
      <text x="32" y="148" font-family="Arial, sans-serif" font-size="22" fill="#374151">Validé par: ${escapeSvg(teacherName)}</text>
      <text x="32" y="184" font-family="Arial, sans-serif" font-size="20" fill="#6b7280">Validé le: ${escapeSvg(timestamp)}</text>
    </svg>
  `.trim();

  const pngBuffer = await sharp(Buffer.from(svg, "utf8")).png().toBuffer();
  return `data:image/png;base64,${pngBuffer.toString("base64")}`;
}

function canManageManualAttendance(user, session) {
  const role = String(user?.role || "").toLowerCase();
  return ["staff", "admin"].includes(role) || session.teacherId === Number(user?.id);
}

async function loadSessionForManualAttendance(sessionId) {
  return prisma.courseSession.findUnique({
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
      teacher: true,
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
}

router.get("/today", require_access({ minRole: ROLES.STUDENT }), async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser?.id) {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Utilisateur non authentifie." });
    }

    const userId = Number(sessionUser.id);
    const { start, end, isoDate, view, range } = getPeriodBounds(req.query.date, req.query.view);

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
      view,
      range,
      sessions: sessions.map(session => formatSession(session, dbUser.id)),
    });
  } catch (err) {
    log_technical(TECHNICAL_LEVELS.ERROR, "User session list fetch failed", {
      error: err,
      userId: req.session?.user?.id,
      date: req.query.date,
      view: req.query.view,
    });
    return res.status(500).json({
      error: "SESSION_FETCH_FAILED",
      message: "Erreur lors du chargement des sessions.",
    });
  }
});

router.get("/staff", require_access({ minRole: ROLES.STAFF }), async (req, res) => {
  try {
    const { start, end, isoDate, view, range } = getPeriodBounds(req.query.date, req.query.view);
    const classId = parseOptionalInt(req.query.classId);
    const roomId = parseOptionalInt(req.query.roomId);
    const teacherId = parseOptionalInt(req.query.teacherId);
    const subject = String(req.query.subject || "").trim();

    const where = {
      startTime: {
        gte: start,
        lte: end,
      },
    };

    if (classId) where.classId = classId;
    if (roomId) where.roomId = roomId;
    if (teacherId) where.teacherId = teacherId;
    if (subject) {
      where.OR = [
        { matiere: subject },
        { codeMatiere: subject },
        { label: subject },
      ];
    }

    const [sessions, classes, rooms, teachers, subjectRows] = await Promise.all([
      prisma.courseSession.findMany({
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
      }),
      prisma.class.findMany({
        orderBy: [{ name: "asc" }, { code: "asc" }],
        select: { id: true, code: true, name: true },
      }),
      prisma.room.findMany({
        orderBy: [{ name: "asc" }, { code: "asc" }],
        select: { id: true, code: true, name: true },
      }),
      prisma.user.findMany({
        where: { role: "teacher" },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: { id: true, firstName: true, lastName: true },
      }),
      prisma.courseSession.findMany({
        distinct: ["matiere", "codeMatiere", "label"],
        orderBy: [{ matiere: "asc" }, { label: "asc" }],
        select: { matiere: true, codeMatiere: true, label: true },
      }),
    ]);

    const subjectOptions = [...new Map(
      subjectRows
        .map(row => row.matiere || row.label || row.codeMatiere)
        .filter(Boolean)
        .map(value => [value, { id: value, name: value }])
    ).values()].sort((a, b) => a.name.localeCompare(b.name));

    return res.json({
      date: isoDate,
      view,
      range,
      filters: { classId, roomId, teacherId, subject },
      options: {
        classes,
        rooms,
        teachers,
        subjects: subjectOptions,
      },
      summary: buildStaffSummary(sessions),
      sessions: sessions.map(formatStaffSession),
    });
  } catch (err) {
    log_technical(TECHNICAL_LEVELS.ERROR, "Staff session list fetch failed", {
      error: err,
      userId: req.session?.user?.id,
      filters: req.query,
    });
    return res.status(500).json({
      error: "STAFF_SESSION_FETCH_FAILED",
      message: "Erreur lors du chargement des sessions.",
    });
  }
});

router.post("/:sessionId/attendance/manual", require_access({ minRole: ROLES.TEACHER }), async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    const sessionId = Number.parseInt(req.params.sessionId, 10);
    const studentId = Number.parseInt(req.body?.studentId, 10);
    const status = String(req.body?.status || "present").toLowerCase();

    if (!sessionUser?.id) {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Utilisateur non authentifie." });
    }

    if (!Number.isInteger(sessionId) || !Number.isInteger(studentId)) {
      return res.status(400).json({ error: "INVALID_MANUAL_ATTENDANCE", message: "Session ou eleve invalide." });
    }

    if (!["present", "absent"].includes(status)) {
      return res.status(400).json({ error: "INVALID_ATTENDANCE_STATUS", message: "Statut de presence invalide." });
    }

    const session = await loadSessionForManualAttendance(sessionId);
    if (!session) {
      return res.status(404).json({ error: "SESSION_NOT_FOUND", message: "Session introuvable." });
    }

    if (session.finalization) {
      return res.status(403).json({ error: "APPEL_ALREADY_SENT", message: "Appel deja envoye a EcoleDirecte." });
    }

    if (!canManageManualAttendance(sessionUser, session)) {
      return res.status(403).json({ error: "MANUAL_ATTENDANCE_FORBIDDEN", message: "Vous ne pouvez pas modifier l'appel de ce cours." });
    }

    const student = session.class?.users?.find(user => user.id === studentId);
    if (!student) {
      return res.status(404).json({ error: "STUDENT_NOT_IN_CLASS", message: "Cet eleve n'appartient pas a la classe du cours." });
    }

    const scannedAt = new Date();
    const teacherName = `${sessionUser.firstName || ""} ${sessionUser.lastName || ""}`.trim()
      || `${session.teacher.firstName || ""} ${session.teacher.lastName || ""}`.trim()
      || `User #${sessionUser.id}`;
    const studentName = `${student.firstName || ""} ${student.lastName || ""}`.trim() || `Student #${student.id}`;
    const signature = await manualSignatureDataUrl({
      status,
      teacherName,
      studentName,
      scannedAt,
    });

    const attendance = await prisma.attendanceRecord.upsert({
      where: {
        sessionId_userId: {
          sessionId,
          userId: studentId,
        },
      },
      update: {
        status,
        signature,
        scannedAt,
      },
      create: {
        sessionId,
        userId: studentId,
        status,
        signature,
        scannedAt,
      },
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

    await log_business(
      "teacher_manual_attendance",
      status === "present"
        ? "Presence eleve validee manuellement."
        : "Absence eleve indiquee manuellement.",
      {
        destination: LOG_DESTINATIONS.BOTH,
        req,
        userId: Number(sessionUser.id),
        entityType: "CourseSession",
        entityId: sessionId,
        metadata: {
          studentId,
          status,
        },
      }
    );

    broadcastAttendanceUpdate(sessionId, {
      updatedByUserId: Number(sessionUser.id),
    });

    const updatedSession = await loadSessionForManualAttendance(sessionId);
    return res.json({
      message: status === "present"
        ? "Presence validee manuellement."
        : "Absence indiquee manuellement.",
      attendance,
      stats: getAttendanceStats(updatedSession),
    });
  } catch (err) {
    log_technical(TECHNICAL_LEVELS.ERROR, "Manual attendance update failed", {
      error: err,
      userId: req.session?.user?.id,
      sessionId: req.params.sessionId,
      body: req.body,
    });
    return res.status(500).json({
      error: "MANUAL_ATTENDANCE_FAILED",
      message: "Erreur lors de la validation manuelle.",
    });
  }
});

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
    const hasFullAttendanceAccess = isTeacherOwner || ["staff", "admin"].includes(dbUser.role);
    const visibleAttendance = hasFullAttendanceAccess
      ? session.attendance
      : (userAttendance ? [userAttendance] : []);
    const attendanceByUser = new Map(session.attendance.map(record => [record.userId, record]));
    const visibleStudents = hasFullAttendanceAccess
      ? (session.class?.users || []).map(student => ({
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          role: student.role,
          attendance: attendanceByUser.get(student.id) || null,
        }))
      : [];

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
      students: visibleStudents,
      canGeneratePdf: isTeacherOwner,
      canManageAttendance: hasFullAttendanceAccess && !session.finalization,
    });
  } catch (err) {
    log_technical(TECHNICAL_LEVELS.ERROR, "Course session detail fetch failed", {
      error: err,
      userId: req.session?.user?.id,
      sessionId: req.params.sessionId,
    });
    return res.status(500).json({
      error: "SESSION_FETCH_FAILED",
      message: "Erreur lors du chargement des sessions.",
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
    const pdfBuffer = await generate_attendance_pdf(sessionToPdfData(session, author));
    const day = DateTime.fromJSDate(new Date(session.startTime)).setZone(APP_TIMEZONE).toFormat("yyyy-MM-dd_HH-mm");
    const filename = `${session.class.code}_${day}_emargement.pdf`;

    await log_business("course_session_pdf_generated", "PDF d'emargement genere manuellement.", {
      destination: LOG_DESTINATIONS.BOTH,
      req,
      entityType: "CourseSession",
      entityId: session.id,
      metadata: { filename },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=${filename}`);
    return res.send(pdfBuffer);
  } catch (err) {
    log_technical(TECHNICAL_LEVELS.ERROR, "Course session PDF generation failed", {
      error: err,
      userId: req.session?.user?.id,
      sessionId: req.params.sessionId,
    });
    return res.status(500).json({
      error: "SESSION_PDF_FAILED",
      message: "Erreur lors du chargement des sessions.",
    });
  }
});

module.exports = router;
