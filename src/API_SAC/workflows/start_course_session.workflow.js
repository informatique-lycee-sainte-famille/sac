// ./API_SAC/workflows/start_course_session.workflow.js
const sharp = require("sharp");
const { prisma } = require("../commons/prisma.common");
const { is_session_finalized } = require("./finalize_course_session.workflow");
const { LOG_DESTINATIONS, TECHNICAL_LEVELS, log_business, log_technical } = require("../commons/logger.common");

const SIGNATURE_MAX_INPUT_LENGTH = 750000;
const SIGNATURE_MAX_OUTPUT_LENGTH = 220000;

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
  const nfcUid = req.body?.nfcUid || req.query?.nfcUid || req.query?.nfc || null;
  if (!nfcUid || typeof nfcUid !== "string") return null;

  const value = nfcUid.trim();
  if (value.length < 2 || value.length > 120) return null;
  if (!/^[A-Za-z0-9:_-]+$/.test(value)) return null;

  return value;
}

function getSignature(req) {
  return req.body?.signature || null;
}

function isValidSignature(signature) {
  if (!signature || typeof signature !== "string") return false;
  if (signature.length > SIGNATURE_MAX_INPUT_LENGTH) return false;

  return /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(signature);
}

async function compressSignature(signature) {
  const match = signature.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;

  const inputBuffer = Buffer.from(match[2], "base64");
  const outputBuffer = await sharp(inputBuffer)
    .rotate()
    .resize({
      width: 900,
      height: 320,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    .jpeg({
      quality: 78,
      mozjpeg: true,
    })
    .toBuffer();

  const compressed = `data:image/jpeg;base64,${outputBuffer.toString("base64")}`;
  if (compressed.length > SIGNATURE_MAX_OUTPUT_LENGTH) {
    throw new Error("Compressed signature is too large.");
  }

  return compressed;
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
  const deviceFingerprint = String(req.headers["x-device-fingerprint"] || req.headers["x-device-id"] || "").slice(0, 128) || null;
  const userAgent = String(req.headers["user-agent"] || "").slice(0, 500) || null;

  await prisma.nfcScan.create({
    data: {
      nfcUid,
      roomId,
      userId,
      sessionId,
      ipAddress: req.ip,
      UserAgent: userAgent,
      deviceFingerprint,
    },
  });

  log_technical(TECHNICAL_LEVELS.VERBOSE, "NFC scan persisted", {
    nfcUid,
    roomId,
    userId,
    sessionId,
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

  await log_business("teacher_attendance_validated", "Scan et signature enseignant validés.", {
    destination: LOG_DESTINATIONS.BOTH,
    userId,
    entityType: "CourseSession",
    entityId: session.id,
    metadata: {
      roomId: session.roomId,
      roomCode: session.room.code,
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

  await log_business("student_attendance_validated", "Scan et signature élève validés.", {
    destination: LOG_DESTINATIONS.BOTH,
    userId: user.id,
    entityType: "CourseSession",
    entityId: session.id,
    metadata: {
      roomId: session.roomId,
      roomCode: session.room.code,
      classId: session.classId,
      scannedAt,
    },
  });

  return response(200, "STUDENT_ATTENDANCE_VALIDATED", "Presence eleve validee.", {
    sessionId: session.id,
    room: session.room.code,
    role: "student",
  });
}

async function process_nfc_scan(req, options = {}) {
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
    await log_business("unknown_nfc_scan", "Scan NFC sur une salle inconnue.", {
      req,
      destination: LOG_DESTINATIONS.DATABASE,
      userId: sessionUser.id,
      entityType: "NfcScan",
      metadata: { nfcUid },
    });
    return response(404, "UNKNOWN_ROOM", "Salle inconnue pour ce NFC.");
  }

  if (!user) {
    return response(401, "USER_NOT_FOUND", "Utilisateur introuvable.");
  }

  const role = sessionUser.role;

  if (role === "STAFF" || role === "ADMIN") {
    await logNfcScan(req, { nfcUid, roomId: room.id, userId: sessionUser.id });
    await log_business("staff_nfc_scan_logged", "Scan NFC personnel/admin enregistré.", {
      req,
      destination: LOG_DESTINATIONS.DATABASE,
      userId: sessionUser.id,
      entityType: "Room",
      entityId: room.id,
      metadata: { role: role.toLowerCase(), roomCode: room.code, nfcUid },
    });
    return response(200, "STAFF_SCAN_LOGGED", "Scan staff enregistre.", {
      room: room.code,
      role: role.toLowerCase(),
    });
  }

  const now = new Date();
  const courseSession = await findOngoingSession(room.id, now);

  if (!courseSession) {
    await logNfcScan(req, { nfcUid, roomId: room.id, userId: sessionUser.id });
    await log_business("nfc_scan_without_ongoing_session", "Scan NFC sans cours en cours.", {
      req,
      destination: LOG_DESTINATIONS.DATABASE,
      userId: sessionUser.id,
      entityType: "Room",
      entityId: room.id,
      metadata: { roomCode: room.code, nfcUid },
    });
    return response(
      403,
      "NO_ONGOING_SESSION",
      "Aucun cours en cours dans cette salle.",
      { room: room.code }
    );
  }

  await logNfcScan(req, { nfcUid, roomId: room.id, userId: sessionUser.id, sessionId: courseSession.id });

  if (await is_session_finalized(courseSession.id)) {
    return response(
      403,
      "APPEL_ALREADY_SENT",
      "L'appel a deja ete envoye pour ce cours.",
      { sessionId: courseSession.id, room: courseSession.room.code }
    );
  }

  const signature = getSignature(req);
  let compressedSignature = null;

  if (!dryRun && !isValidSignature(signature)) {
    return response(
      400,
      "SIGNATURE_REQUIRED",
      "Une signature manuscrite valide est obligatoire avant la validation."
    );
  }

  if (!dryRun) {
    try {
      compressedSignature = await compressSignature(signature);
    } catch {
      return response(
        400,
        "INVALID_SIGNATURE_IMAGE",
        "La signature manuscrite fournie est illisible ou trop volumineuse."
      );
    }
  }

  if (role === "TEACHER") {
    return validateTeacher(courseSession, user.id, now, compressedSignature, dryRun);
  }

  if (role === "STUDENT") {
    return validateStudent(courseSession, user, sessionUser, now, compressedSignature, dryRun);
  }

  return response(403, "ROLE_NOT_ALLOWED", "Role non autorise.");
}

module.exports = { process_nfc_scan };
