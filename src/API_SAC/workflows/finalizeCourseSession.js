const { DateTime } = require("luxon");
const { prisma } = require("../commons/prisma");
const { sendMail } = require("../commons/mail");
const { getDataByType } = require("../../scripts/get_data");
const {
  generateAttendancePdf,
  generateDailyAttendancePdf,
} = require("../../scripts/generateAttendancePdf");

function response(status, code, message, extra = {}) {
  return {
    status,
    body: {
      status: code,
      message,
      ...extra,
    },
  };
}

function getNfcUid(req) {
  return req.body?.nfcUid || req.query?.nfcUid || req.query?.nfc || null;
}

function getSessionUser(req) {
  const user = req.session?.user;
  if (!user?.id || user.role !== "teacher") return null;
  return user;
}

function toParisDateTime(date) {
  return DateTime.fromJSDate(new Date(date)).setZone("Europe/Paris");
}

function formatHoraire(session) {
  const start = toParisDateTime(session.startTime).toFormat("HH:mm");
  const end = toParisDateTime(session.endTime).toFormat("HH:mm");
  return `${start}-${end}`;
}

function uniqEmails(emails) {
  return [...new Set(
    emails
      .filter(Boolean)
      .map(email => String(email).trim().toLowerCase())
      .filter(email => email.includes("@"))
  )];
}

async function isSessionFinalized(sessionId) {
  const finalization = await prisma.courseSessionFinalization.findUnique({
    where: {
      sessionId: Number(sessionId),
    },
    select: { id: true },
  });

  return Boolean(finalization);
}

async function markSessionFinalized(session, user, edResult, filename) {
  return prisma.courseSessionFinalization.create({
    data: {
      sessionId: session.id,
      sentByUserId: user.id,
      pdfFilename: filename,
      edResponse: edResult,
    },
  });
}

async function fetchPersonnelEmails() {
  const users = await prisma.user.findMany({
    where: {
      role: { in: ["staff", "admin"] },
      OR: [
        { o365Email: { not: null } },
        { edEmail: { not: null } },
      ],
    },
    select: {
      o365Email: true,
      edEmail: true,
    },
  });

  return uniqEmails(users.map(user => user.o365Email || user.edEmail));
}

function getTeacherEmail(session) {
  return uniqEmails([session.teacher?.o365Email, session.teacher?.edEmail])[0] || null;
}

function schoolYear(date = new Date()) {
  const year = date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1;
  return `${year} - ${year + 1}`;
}

async function findCurrentSessionByRoom(roomId) {
  const now = new Date();

  return prisma.courseSession.findFirst({
    where: {
      roomId,
      status: "ongoing",
      startTime: { lte: now },
      endTime: { gte: now },
    },
    include: {
      class: { include: { users: { where: { role: "student" }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] } } },
      room: true,
      teacher: true,
      attendance: { include: { user: true } },
      finalization: true,
    },
    orderBy: { startTime: "desc" },
  });
}

async function findSessionById(sessionId) {
  return prisma.courseSession.findUnique({
    where: { id: Number(sessionId) },
    include: {
      class: { include: { users: { where: { role: "student" }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] } } },
      room: true,
      teacher: true,
      attendance: { include: { user: true } },
      finalization: true,
    },
  });
}

async function isLastSessionOfClassDay(session) {
  const day = toParisDateTime(session.startTime).toISODate();
  const start = DateTime.fromISO(day, { zone: "Europe/Paris" }).startOf("day").toJSDate();
  const end = DateTime.fromISO(day, { zone: "Europe/Paris" }).endOf("day").toJSDate();

  const laterSession = await prisma.courseSession.findFirst({
    where: {
      classId: session.classId,
      startTime: { gte: start, lte: end },
      endTime: { gt: session.endTime },
      status: { not: "cancelled" },
    },
    select: { id: true },
    orderBy: { endTime: "asc" },
  });

  return !laterSession;
}

function sessionToPdfData(session, author) {
  return sessionToPdfDataFromStudents(session, session.class.users, author);
}

function sessionToPdfDataFromStudents(session, students, author) {
  const attendanceByUser = new Map(session.attendance.map(record => [record.userId, record]));
  const attendanceByEdId = new Map(
    session.attendance
      .filter(record => record.user?.edId)
      .map(record => [String(record.user.edId), record])
  );
  const teacherAttendance = attendanceByUser.get(session.teacherId);

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
      const attendance = student.id
        ? attendanceByUser.get(student.id)
        : attendanceByEdId.get(String(student.edId));

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

async function fetchDbStudents(classId) {
  const students = await prisma.user.findMany({
    where: {
      role: "student",
      classId: Number(classId),
      edId: { not: null },
    },
    orderBy: [
      { lastName: "asc" },
      { firstName: "asc" },
    ],
  });

  return students.map(student => ({
    id: student.id,
    edId: String(student.edId),
    firstName: student.firstName || "",
    lastName: student.lastName || "",
  }));
}

function buildEdPayload(session, students) {
  const presentEdIds = new Set(
    session.attendance
      .filter(record => record.status === "present" && record.user?.role === "student" && record.user?.edId)
      .map(record => String(record.user.edId))
  );

  return students.map(student => ({
    id: Number(student.edId),
    isAbsent: !presentEdIds.has(String(student.edId)),
  }));
}

async function sendSessionPdfToTeacher({ session, pdfBuffer, filename }) {
  const teacherEmail = getTeacherEmail(session);
  if (!teacherEmail) return null;

  await sendMail({
    to: teacherEmail,
    subject: `Feuille d'emargement - ${session.class.code} - ${formatHoraire(session)}`,
    html:
      `<b>Bonjour,</b><br><br>` +
      `Veuillez trouver ci-joint la feuille d'emargement pour votre cours ` +
      `${session.label || session.matiere || session.codeMatiere || ""} ` +
      `avec la classe ${session.class.name || session.class.code} ` +
      `(${formatHoraire(session)}).<br><br>` +
      `Cordialement,<br>L'outil SAC.`,
    attachments: [
      {
        name: filename,
        contentType: "application/pdf",
        contentBytes: pdfBuffer.toString("base64"),
      },
    ],
  });

  return teacherEmail;
}

async function sendDailyPdfToPersonnelIfLastSession({ session, author }) {
  if (!(await isLastSessionOfClassDay(session))) {
    return {
      sent: false,
      reason: "NOT_LAST_SESSION",
      recipients: [],
    };
  }

  const recipients = await fetchPersonnelEmails();
  if (!recipients.length) {
    return {
      sent: false,
      reason: "NO_PERSONNEL_EMAILS",
      recipients: [],
    };
  }

  const day = toParisDateTime(session.startTime).toISODate();
  const { pdfBuffer } = await generateClassDayPdf({
    classId: session.classId,
    date: day,
    author,
  });
  const filename = `${session.class.code}_${day}_emargements_journee.pdf`;

  await sendMail({
    to: recipients,
    subject: `Feuilles d'emargement journee - ${session.class.code} - ${day}`,
    html:
      `<b>Bonjour,</b><br><br>` +
      `Veuillez trouver ci-joint le PDF journalier des feuilles d'emargement ` +
      `pour la classe ${session.class.name || session.class.code} du ${day}.<br><br>` +
      `Cordialement,<br>L'outil SAC.`,
    attachments: [
      {
        name: filename,
        contentType: "application/pdf",
        contentBytes: pdfBuffer.toString("base64"),
      },
    ],
  });

  return {
    sent: true,
    reason: "LAST_SESSION",
    recipients,
    filename,
  };
}

async function prepareFinalizeFromNfc(req) {
  const user = getSessionUser(req);
  if (!user) return response(403, "TEACHER_REQUIRED", "Seul l'enseignant peut valider l'appel.");

  const nfcUid = getNfcUid(req);
  if (!nfcUid) return response(400, "MISSING_NFC_UID", "nfcUid manquant.");

  const room = await prisma.room.findUnique({ where: { nfcUid } });
  if (!room) return response(404, "UNKNOWN_ROOM", "Salle inconnue pour ce NFC.");

  const session = await findCurrentSessionByRoom(room.id);
  if (!session) return response(403, "NO_ONGOING_SESSION", "Aucun cours en cours dans cette salle.");

  if (session.teacherId !== user.id) {
    return response(403, "TEACHER_NOT_ASSIGNED", "Cet enseignant n'est pas affecte a ce cours.");
  }

  const teacherAttendance = session.attendance.find(record => record.userId === user.id);
  if (teacherAttendance?.status !== "present") {
    return response(403, "TEACHER_ATTENDANCE_REQUIRED", "Validez d'abord votre presence.");
  }

  if (await isSessionFinalized(session.id)) {
    return response(403, "APPEL_ALREADY_SENT", "L'appel a deja ete envoye pour ce cours.", {
      sessionId: session.id,
      room: room.code,
    });
  }

  if (!session.class.edId) {
    return response(400, "MISSING_CLASS_ED_ID", "Identifiant EcoleDirecte de classe manquant.");
  }

  const dbStudents = await fetchDbStudents(session.classId);
  const presentEdIds = new Set(
    session.attendance
      .filter(record => record.user.role === "student" && record.status === "present" && record.user.edId)
      .map(record => String(record.user.edId))
  );
  const presentCount = dbStudents.filter(student => presentEdIds.has(String(student.edId))).length;
  const totalStudents = dbStudents.length;

  return response(200, "TEACHER_SESSION_FINALIZE_CONFIRM", "Confirmer l'envoi de l'appel a EcoleDirecte ?", {
    sessionId: session.id,
    room: room.code,
    className: session.class.name || session.class.code,
    courseLabel: session.label || session.matiere || session.codeMatiere,
    horaire: formatHoraire(session),
    presentCount,
    absentCount: Math.max(totalStudents - presentCount, 0),
    totalStudents,
  });
}

async function finalizeSession(req) {
  const user = getSessionUser(req);
  if (!user) return response(403, "TEACHER_REQUIRED", "Seul l'enseignant peut valider l'appel.");

  const sessionId = req.body?.sessionId;
  if (!sessionId) return response(400, "MISSING_SESSION_ID", "sessionId manquant.");

  const session = await findSessionById(sessionId);
  if (!session) return response(404, "SESSION_NOT_FOUND", "Session introuvable.");

  if (session.teacherId !== user.id) {
    return response(403, "TEACHER_NOT_ASSIGNED", "Cet enseignant n'est pas affecte a ce cours.");
  }

  if (!session.class.edId) {
    return response(400, "MISSING_CLASS_ED_ID", "Identifiant EcoleDirecte de classe manquant.");
  }

  if (await isSessionFinalized(session.id)) {
    return response(403, "APPEL_ALREADY_SENT", "L'appel a deja ete envoye pour ce cours.", {
      sessionId: session.id,
    });
  }

  const dbStudents = await fetchDbStudents(session.classId);
  const eleves = buildEdPayload(session, dbStudents);
  if (!eleves.length) {
    return response(400, "NO_DB_STUDENTS", "Aucun eleve Prisma rattache a cette classe avec identifiant EcoleDirecte.");
  }

  const horaire = formatHoraire(session);
  const edResult = await getDataByType("APPEL", {
    classe: session.class.edId,
    horaire,
    eleves,
  });

  const author = `${user.firstName || ""} ${user.lastName || ""}`.trim() || "SAC";
  const filename = `${session.class.code}_${toParisDateTime(session.startTime).toFormat("yyyy-MM-dd_HH-mm")}_emargement.pdf`;
  const finalization = await markSessionFinalized(session, user, edResult, filename);
  session.finalization = finalization;
  const pdfBuffer = await generateAttendancePdf(sessionToPdfDataFromStudents(session, dbStudents, author));

  const sessionPdfSentTo = await sendSessionPdfToTeacher({
    session,
    pdfBuffer,
    filename,
  });
  const dailyPdf = await sendDailyPdfToPersonnelIfLastSession({ session, author });

  return response(200, "SESSION_ATTENDANCE_FINALIZED", "Appel envoye a EcoleDirecte et PDF generé et envoyé par mail.", {
    sessionId: session.id,
    ed: edResult,
    mail: {
      sessionPdfSentTo,
      dailyPdf,
    },
    pdf: {
      filename,
      contentType: "application/pdf",
      contentBase64: pdfBuffer.toString("base64"),
    },
  });
}

async function generateClassDayPdf({ classId, date, author = "SAC" }) {
  const day = date || DateTime.now().setZone("Europe/Paris").toISODate();
  const start = DateTime.fromISO(day, { zone: "Europe/Paris" }).startOf("day").toJSDate();
  const end = DateTime.fromISO(day, { zone: "Europe/Paris" }).endOf("day").toJSDate();

  const sessions = await prisma.courseSession.findMany({
    where: {
      classId: Number(classId),
      startTime: { gte: start, lte: end },
    },
    include: {
      class: { include: { users: { where: { role: "student" }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] } } },
      room: true,
      teacher: true,
      attendance: { include: { user: true } },
      finalization: true,
    },
    orderBy: { startTime: "asc" },
  });

  let edStudents = [];
  if (sessions[0]?.classId) {
    edStudents = await fetchDbStudents(sessions[0].classId);
  }

  const data = sessions.map(session => {
    const students = edStudents.length ? edStudents : session.class.users;
    return sessionToPdfDataFromStudents(session, students, author);
  });
  const pdfBuffer = await generateDailyAttendancePdf(data);

  return {
    sessions,
    pdfBuffer,
  };
}

module.exports = {
  prepareFinalizeFromNfc,
  finalizeSession,
  generateClassDayPdf,
  isSessionFinalized,
};
