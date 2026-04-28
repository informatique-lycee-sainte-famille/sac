const { prisma } = require("../commons/prisma");
const { isSessionFinalized } = require("./finalizeCourseSession");

function normalizeRole(role) {
  return role ? String(role).toUpperCase() : null;
}

function getSessionUser(req) {
  const sessionUser = req.session?.user;
  if (!sessionUser?.id || !sessionUser?.role) return null;

  return {
    ...sessionUser,
    role: normalizeRole(sessionUser.role),
  };
}

function getNfcUid(req) {
  return req.body?.nfcUid || req.query?.nfcUid || req.query?.nfc || null;
}

function getSignature(req) {
  return req.body?.signature || null;
}

function isValidSignature(signature) {
  if (!signature || typeof signature !== "string") return false;
  if (signature.length > 750000) return false;

  return /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(signature);
}

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

async function logNfcScan(req, { nfcUid, roomId, userId, sessionId = null }) {
  await prisma.nfcScan.create({
    data: {
      nfcUid,
      roomId,
      userId,
      sessionId,
      ipAddress: req.ip,
      UserAgent: req.headers["user-agent"],
      deviceFingerprint: req.headers["x-device-fingerprint"] || req.headers["x-device-id"] || null,
    },
  });
}

async function findOngoingSession(roomId, now) {
  return prisma.courseSession.findFirst({
    where: {
      roomId,
      status: "ongoing",
      startTime: { lte: now },
      endTime: { gte: now },
    },
    include: {
      class: true,
      room: true,
      teacher: true,
    },
    orderBy: { startTime: "desc" },
  });
}

async function resolveStudentClassId(user, sessionUser) {
  if (user.classId) return user.classId;

  const externalClassId = sessionUser.edProfile?.ED?.classeId;
  if (!externalClassId) return null;

  const classEntity = await prisma.class.findUnique({
    where: { edId: Number(externalClassId) },
    select: { id: true },
  });

  return classEntity?.id || null;
}

function alreadyRegisteredResponse(session, role) {
  return response(
    403,
    "ATTENDANCE_ALREADY_REGISTERED",
    "Presence deja enregistree pour ce cours.",
    {
      sessionId: session.id,
      room: session.room.code,
      role,
    }
  );
}

async function findAttendance(sessionId, userId) {
  return prisma.attendanceRecord.findUnique({
    where: {
      sessionId_userId: {
        sessionId,
        userId,
      },
    },
  });
}

async function validateTeacher(session, userId, scannedAt, signature, dryRun = false) {
  if (session.teacherId !== userId) {
    return response(
      403,
      "TEACHER_NOT_ASSIGNED",
      "Cet enseignant n'est pas affecte au cours en cours dans cette salle.",
      { sessionId: session.id, room: session.room.code }
    );
  }

  const existingAttendance = await findAttendance(session.id, userId);
  if (existingAttendance?.status === "present") {
    if (dryRun) {
      return response(
        200,
        "TEACHER_SESSION_FINALIZE_AVAILABLE",
        "Presence enseignant deja validee. Vous pouvez finaliser l'appel.",
        {
          sessionId: session.id,
          room: session.room.code,
          role: "teacher",
          canFinalize: true,
        }
      );
    }

    return alreadyRegisteredResponse(session, "teacher");
  }

  if (dryRun) {
    return response(200, "SIGNATURE_REQUIRED", "Signature requise pour valider la presence.", {
      sessionId: session.id,
      room: session.room.code,
      role: "teacher",
    });
  }

  await prisma.attendanceRecord.upsert({
    where: {
      sessionId_userId: {
        sessionId: session.id,
        userId,
      },
    },
    update: {
      status: "present",
      signature,
      scannedAt,
    },
    create: {
      sessionId: session.id,
      userId,
      status: "present",
      signature,
      scannedAt,
    },
  });

  return response(
    200,
    "TEACHER_ATTENDANCE_VALIDATED",
    "Presence enseignant validee. Les eleves peuvent maintenant valider leur presence.",
    {
      sessionId: session.id,
      room: session.room.code,
      role: "teacher",
    }
  );
}

async function validateStudent(session, user, sessionUser, scannedAt, signature, dryRun = false) {
  const studentClassId = await resolveStudentClassId(user, sessionUser);

  if (!studentClassId) {
    return response(400, "STUDENT_CLASS_NOT_FOUND", "Classe de l'eleve introuvable.");
  }

  if (studentClassId !== session.classId) {
    return response(
      403,
      "STUDENT_NOT_IN_SESSION_CLASS",
      "Ce cours ne correspond pas a la classe de l'eleve.",
      { sessionId: session.id, room: session.room.code }
    );
  }

  const teacherAttendance = await prisma.attendanceRecord.findUnique({
    where: {
      sessionId_userId: {
        sessionId: session.id,
        userId: session.teacherId,
      },
    },
  });

  if (teacherAttendance?.status !== "present") {
    return response(
      403,
      "TEACHER_ATTENDANCE_REQUIRED",
      "L'enseignant doit d'abord valider sa presence.",
      { sessionId: session.id, room: session.room.code }
    );
  }

  const existingAttendance = await findAttendance(session.id, user.id);
  if (existingAttendance?.status === "present") {
    return alreadyRegisteredResponse(session, "student");
  }

  if (dryRun) {
    return response(200, "SIGNATURE_REQUIRED", "Signature requise pour valider la presence.", {
      sessionId: session.id,
      room: session.room.code,
      role: "student",
    });
  }

  await prisma.attendanceRecord.upsert({
    where: {
      sessionId_userId: {
        sessionId: session.id,
        userId: user.id,
      },
    },
    update: {
      status: "present",
      signature,
      scannedAt,
    },
    create: {
      sessionId: session.id,
      userId: user.id,
      status: "present",
      signature,
      scannedAt,
    },
  });

  return response(200, "STUDENT_ATTENDANCE_VALIDATED", "Presence eleve validee.", {
    sessionId: session.id,
    room: session.room.code,
    role: "student",
  });
}

async function processNfcScan(req, options = {}) {
  const dryRun = options.dryRun === true;
  const nfcUid = getNfcUid(req);
  if (!nfcUid) {
    return response(400, "MISSING_NFC_UID", "nfcUid manquant.");
  }

  const sessionUser = getSessionUser(req);
  if (!sessionUser) {
    return response(401, "UNAUTHENTICATED", "Utilisateur non authentifie.");
  }

  const [room, user] = await Promise.all([
    prisma.room.findUnique({ where: { nfcUid } }),
    prisma.user.findUnique({ where: { id: sessionUser.id } }),
  ]);

  if (!room) {
    await logNfcScan(req, { nfcUid, roomId: null, userId: sessionUser.id });
    return response(404, "UNKNOWN_ROOM", "Salle inconnue pour ce NFC.");
  }

  if (!user) {
    return response(401, "USER_NOT_FOUND", "Utilisateur introuvable.");
  }

  const role = sessionUser.role;

  if (role === "STAFF" || role === "ADMIN") {
    await logNfcScan(req, { nfcUid, roomId: room.id, userId: sessionUser.id });
    return response(200, "STAFF_SCAN_LOGGED", "Scan staff enregistre.", {
      room: room.code,
      role: role.toLowerCase(),
    });
  }

  const now = new Date();
  const courseSession = await findOngoingSession(room.id, now);

  if (!courseSession) {
    await logNfcScan(req, { nfcUid, roomId: room.id, userId: sessionUser.id });
    return response(
      403,
      "NO_ONGOING_SESSION",
      "Aucun cours en cours dans cette salle.",
      { room: room.code }
    );
  }

  await logNfcScan(req, { nfcUid, roomId: room.id, userId: sessionUser.id, sessionId: courseSession.id });

  if (await isSessionFinalized(courseSession.id)) {
    return response(
      403,
      "APPEL_ALREADY_SENT",
      "L'appel a deja ete envoye pour ce cours.",
      { sessionId: courseSession.id, room: courseSession.room.code }
    );
  }

  const signature = getSignature(req);
  if (!dryRun && !isValidSignature(signature)) {
    return response(
      400,
      "SIGNATURE_REQUIRED",
      "Une signature manuscrite valide est obligatoire avant la validation."
    );
  }

  if (role === "TEACHER") {
    return validateTeacher(courseSession, user.id, now, signature, dryRun);
  }

  if (role === "STUDENT") {
    return validateStudent(courseSession, user, sessionUser, now, signature, dryRun);
  }

  return response(403, "ROLE_NOT_ALLOWED", "Role non autorise.");
}

module.exports = { processNfcScan };
