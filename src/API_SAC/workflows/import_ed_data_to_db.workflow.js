// ./API_SAC/workflows/import_ed_data_to_db.workflow.js
require("../commons/env.common");
const { get_data_by_type } = require('../../scripts/auto/get_data.script.js');
const { fromParis, findBestUserTeacherMatch, normalizeSoft } = require("../commons/helpers.common");
const { prisma } = require("../commons/prisma.common");
const { LOG_DESTINATIONS, TECHNICAL_LEVELS, log_business, log_technical } = require("../commons/logger.common");

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------

function parseDateTime(dateStr, timeStr) {
  // ED format varies → adapt if needed
  return new Date(`${dateStr}T${timeStr}`);
}

function computeSessionStatus(c, startTime, endTime) {
  const now = new Date();

  if (c.isAnnule) return "cancelled";
  if (now < startTime) return "scheduled";
  if (now >= startTime && now <= endTime) return "ongoing";
  if (now > endTime) return "completed";

  return "scheduled"; // fallback safety
}

// -----------------------------------------------------------------------------
// IMPORT SALLES → Room
// -----------------------------------------------------------------------------

async function importRooms() {
  const salles = await get_data_by_type('SALLES');

  for (const s of salles) {
    await prisma.room.upsert({
      where: { code: s.code },
      update: {
        name: s.libelle,
      },
      create: {
        code: s.code,
        name: s.libelle,
        nfcUid: `ROOM_${s.id}`,
      },
    });
  }

  log_technical(TECHNICAL_LEVELS.INFO, "Rooms imported from EcoleDirecte", { count: salles.length });
  return salles.length;
}

// -----------------------------------------------------------------------------
// IMPORT CLASSES → Class
// -----------------------------------------------------------------------------

async function importClasses() {
  const classes = await get_data_by_type('CLASSES');

  for (const c of classes) {
    await prisma.class.upsert({
        where: { edId: c.id },
        update: {
            name: c.libelle,
            code: c.code,
        },
        create: {
            edId: c.id,
            code: c.code,
            name: c.libelle,
        },
    });
  }

  log_technical(TECHNICAL_LEVELS.INFO, "Classes imported from EcoleDirecte", { count: classes.length });
  return classes.length;
}

// -----------------------------------------------------------------------------
// IMPORT EDT_CLASSE → CourseSession
// -----------------------------------------------------------------------------

async function importSessions(options = {}) {
  const date = options.date || 'today';
  const classes = await prisma.class.findMany(
    // filter only class with edId exists
    { where: { edId: { not: null } } }
    // only ext id 142
    // { where: { edId: 16 } }
  );

  let total = 0;

  for (const cls of classes) {
    let totalForClass = 0;
    let skipped = 0;
    try {
      const cours = await get_data_by_type('EDT_CLASSE', {
        date,
        classe: cls.edId,
      });

      for (const c of cours) {
        if (c.isAnnule || c.codeMatiere.toUpperCase() === "JPEDA" || !c.prof || !c.salle || !c.start_date || !c.end_date || isNaN(Date.parse(c.start_date)) || isNaN(Date.parse(c.end_date))) {
            log_technical(TECHNICAL_LEVELS.INFO, "Skipping invalid EcoleDirecte course session", {
              edId: c.id,
              classCode: cls.code,
              reasons:
                `${c.isAnnule ? "Cancelled; " : ""}` +
                `${c.codeMatiere.toUpperCase() === "JPEDA" ? "JPEDA; " : ""}` +
                `${!c.prof ? "Missing teacher; " : ""}` +
                `${!c.salle ? "Missing room; " : ""}` +
                `${!c.start_date ? "Missing start date; " : ""}` +
                `${!c.end_date ? "Missing end date; " : ""}` +
                `${isNaN(Date.parse(c.start_date)) ? "Invalid start date; " : ""}` +
                `${isNaN(Date.parse(c.end_date)) ? "Invalid end date; " : ""}`
            });
            skipped++;
            continue;
        }
        try {
            const classEntity = cls;
            const teacher = await findBestUserTeacherMatch(c.prof);

            const room = await prisma.room.findFirst({
            where: {
                code: c.salle,
            },
            });

            if (!teacher) {
                log_technical(TECHNICAL_LEVELS.WARNING, "Unmatched teacher while importing course session", {
                  teacherLabel: c.prof,
                  edSessionId: c.id,
                  classCode: cls.code,
                });
            }

            if (!teacher || !room) continue;

            const startTime = fromParis(c.start_date);
            const endTime = fromParis(c.end_date);
            const edId = String(c.id);

            const status = computeSessionStatus(c, startTime, endTime);

            await prisma.courseSession.upsert({
            where: { edId },
            update: {
                classId: classEntity.id,
                teacherId: teacher.id,
                roomId: room.id,
                matiere: c.matiere,
                codeMatiere: c.codeMatiere,
                label: c.text,
                startTime: startTime,
                color: c.color,
                endTime: endTime,
                status: status,
            },
            create: {
                edId,
                classId: classEntity.id,
                teacherId: teacher.id,
                roomId: room.id,
                matiere: c.matiere,
                codeMatiere: c.codeMatiere,
                label: c.text,
                startTime: startTime,
                color: c.color,
                endTime: endTime,
                status: status,
            },
            });
            total++;
            totalForClass++;

        } catch (err) {
            log_technical(TECHNICAL_LEVELS.WARNING, "Course session import failed", {
              edSessionId: c.id,
              classCode: cls.code,
              error: err,
            });
        }
      }
      log_technical(TECHNICAL_LEVELS.INFO, "Class schedule imported", {
        classCode: cls.code,
        importedCount: totalForClass,
        skippedCount: skipped,
      });
    } catch (err) {
      log_technical(TECHNICAL_LEVELS.WARNING, "EcoleDirecte class schedule fetch failed", {
        classCode: cls.code,
        error: err,
      });
    }
  }

  log_technical(TECHNICAL_LEVELS.INFO, "Course sessions imported from EcoleDirecte", { count: total });
  return total;
}

async function importUsers() {
  const [students, teachers] = await Promise.all([
    get_data_by_type('ELEVES'),
    get_data_by_type('PROFESSEURS')
  ]);

  let studentsProcessed = 0;
  let teachersProcessed = 0;

  let studentsCreated = 0;
  let studentsUpdated = 0;

  let teachersCreated = 0;
  let teachersUpdated = 0;

  // 🔥 STUDENTS
  for (const s of students) {
    const edId = String(s.id);
    let classId = null;

    if (s.classeId) {
      const classEntity = await prisma.class.findUnique({
        where: { edId: Number(s.classeId) },
        select: { id: true },
      });

      classId = classEntity?.id || null;
    }

    const edPhotoFromImport = s.photo?.startsWith("//") ? `https:${s.photo}` : null;
    const newData = {
      firstName: s.prenom,
      lastName: normalizeSoft(s.nom),
      role: "student",
      edEmail: s.email || null,
      classId,
    };

    const existing = await prisma.user.findUnique({
      where: { edId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        edEmail: true,
        edPhotoUrl: true,
        edPhotoB64: true,
        classId: true,
      },
    });

    if (!existing) {
      await prisma.user.create({
        data: {
          edId,
          ...newData,
          edPhotoUrl: edPhotoFromImport,
        },
      });
      studentsCreated++;
    } else {
      const nextEdPhotoUrl = (existing.edPhotoUrl !== null || existing.edPhotoB64)
        ? (existing.edPhotoB64 ? null : edPhotoFromImport)
        : existing.edPhotoUrl;

      if (existing.edPhotoUrl !== null || existing.edPhotoB64) {
        newData.edPhotoUrl = nextEdPhotoUrl;
      }

      const hasChanged =
        existing.firstName !== newData.firstName ||
        existing.lastName !== newData.lastName ||
        existing.role !== newData.role ||
        existing.edEmail !== newData.edEmail ||
        existing.edPhotoUrl !== nextEdPhotoUrl ||
        existing.classId !== newData.classId;

      if (hasChanged) {
        await prisma.user.update({
          where: { id: existing.id },
          data: newData,
        });
        studentsUpdated++;
      }
    }

    studentsProcessed++;
  }

  // 🔥 TEACHERS
  for (const p of teachers) {
    const edId = String(p.id);

    const newData = {
      firstName: p.prenom,
      lastName: normalizeSoft(p.nom),
      role: "teacher",
    };

    const existing = await prisma.user.findUnique({
      where: { edId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });

    if (!existing) {
      await prisma.user.create({
        data: {
          edId,
          ...newData,
        },
      });
      teachersCreated++;
    } else {
      const hasChanged =
        existing.firstName !== newData.firstName ||
        existing.lastName !== newData.lastName ||
        existing.role !== newData.role;

      if (hasChanged) {
        await prisma.user.update({
          where: { id: existing.id },
          data: newData,
        });
        teachersUpdated++;
      }
    }

    teachersProcessed++;
  }

  const summary = {
    studentsProcessed,
    studentsCreated,
    studentsUpdated,
    teachersProcessed,
    teachersCreated,
    teachersUpdated,
    total: studentsProcessed + teachersProcessed,
  };

  log_technical(TECHNICAL_LEVELS.INFO, "Users imported from EcoleDirecte", summary);
  return summary;
}

// -----------------------------------------------------------------------------
// MAIN SEED FUNCTION
// -----------------------------------------------------------------------------

async function import_ed_data_to_db(dataTypes = ['SALLES', 'CLASSES', 'PROFESSEURS', 'EDT_CLASSE', 'ELEVES_ALL'], options = {}) {
  log_technical(TECHNICAL_LEVELS.INFO, "Starting EcoleDirecte import", { dataTypes });
  const summary = {};

  try {
    if (dataTypes.includes('SALLES')) summary.rooms = await importRooms();
    if (dataTypes.includes('CLASSES')) summary.classes = await importClasses();
    if (dataTypes.includes('USERS')) summary.users = await importUsers();
    if (dataTypes.includes('EDT_CLASSE')) summary.courseSessions = await importSessions(options.edtClasse || {});

    await log_business("ed_import_completed", "Import EcoleDirecte terminé.", {
      destination: LOG_DESTINATIONS.DATABASE,
      entityType: "EcoleDirecte",
      metadata: { dataTypes, summary },
    });
    log_technical(TECHNICAL_LEVELS.INFO, "EcoleDirecte import completed", summary);
    return summary;
  } catch (error) {
    log_technical(TECHNICAL_LEVELS.ERROR, "EcoleDirecte import failed", { error, dataTypes });
    throw error;
  }
}

// Run directly
if (require.main === module) {
  import_ed_data_to_db();
}

module.exports = { import_ed_data_to_db };
