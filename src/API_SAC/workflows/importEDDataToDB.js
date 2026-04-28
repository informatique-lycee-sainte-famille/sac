require("../commons/env");
const { getDataByType } = require('../../scripts/get_data.js');
const { fromParis, findBestUserTeacherMatch, normalizeSoft } = require("../commons/helpers");
const { prisma } = require("../commons/prisma");

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
  const salles = await getDataByType('SALLES');

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

  console.log(`✅ Imported ${salles.length} rooms`);
}

// -----------------------------------------------------------------------------
// IMPORT CLASSES → Class
// -----------------------------------------------------------------------------

async function importClasses() {
  const classes = await getDataByType('CLASSES');

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

  console.log(`✅ Imported ${classes.length} classes`);
}

// -----------------------------------------------------------------------------
// IMPORT EDT_CLASSE → CourseSession
// -----------------------------------------------------------------------------

async function importSessions() {
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
      // 🔥 fetch EDT per class using edId
      const cours = await getDataByType('EDT_CLASSE', {
        date: 'today',
        classe: cls.edId,
      });
    //   console.log(`📥 Fetched ${cours.length} sessions for class ${cls.code}`);
    //   add debug log for each session
      for (const c of cours) {
        if (c.isAnnule || c.codeMatiere.toUpperCase() === "JPEDA" || !c.prof || !c.salle || !c.start_date || !c.end_date || isNaN(Date.parse(c.start_date)) || isNaN(Date.parse(c.end_date))) {
            console.warn(`⚠️ Skipping session with id ${c.id} for class ${cls.code} due to: ` +
                `${c.isAnnule ? "Cancelled; " : ""}` +
                `${c.codeMatiere.toUpperCase() === "JPEDA" ? "JPEDA; " : ""}` +
                `${!c.prof ? "Missing teacher; " : ""}` +
                `${!c.salle ? "Missing room; " : ""}` +
                `${!c.start_date ? "Missing start date; " : ""}` +
                `${!c.end_date ? "Missing end date; " : ""}` +
                `${isNaN(Date.parse(c.start_date)) ? "Invalid start date; " : ""}` +
                `${isNaN(Date.parse(c.end_date)) ? "Invalid end date; " : ""}`
            );
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
                console.warn("❌ UNMATCHED TEACHER:", c.prof);
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
            // console.log(`   ➕ Imported session ${c.id} for class ${cls.code}`);
            total++;
            totalForClass++;

        } catch (err) {
            console.error("Session import error:", err.message);
        }
      }
      console.log(`✅ Imported ${totalForClass} sessions for class ${cls.code} (Skipped: ${skipped})`);
    } catch (err) {
      console.error(`EDT fetch failed for class ${cls.code}`, err.message);
    }
  }

  console.log(`✅ Imported ${total} course sessions`);
}

async function importUsers() {
  const [students, teachers] = await Promise.all([
    getDataByType('ELEVES'),
    getDataByType('PROFESSEURS')
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

    const newData = {
      firstName: s.prenom,
      lastName: normalizeSoft(s.nom),
      role: "student",
      edEmail: s.email || null,
      edPhotoUrl: s.photo?.startsWith("//") ? `https:${s.photo}` : null,
      classId,
    };

    const existing = await prisma.user.findUnique({
      where: { edId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        edPhotoUrl: true,
        classId: true,
      },
    });

    if (!existing) {
      await prisma.user.create({
        data: {
          edId,
          ...newData,
        },
      });
      studentsCreated++;
    } else {
      const hasChanged =
        existing.firstName !== newData.firstName ||
        existing.lastName !== newData.lastName ||
        existing.role !== newData.role ||
        existing.edPhotoUrl !== newData.edPhotoUrl ||
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

  console.log(`
✅ Users import completed:
   👨‍🎓 Students → ${studentsProcessed} total (created: ${studentsCreated}, updated: ${studentsUpdated})
   👨‍🏫 Teachers → ${teachersProcessed} total (created: ${teachersCreated}, updated: ${teachersUpdated})
   📊 TOTAL → ${studentsProcessed + teachersProcessed}
  `);
}

// -----------------------------------------------------------------------------
// MAIN SEED FUNCTION
// -----------------------------------------------------------------------------

async function importEDDataToDB(dataTypes = ['SALLES', 'CLASSES', 'PROFESSEURS', 'EDT_CLASSE', 'ELEVES_ALL']) {
  console.log("🚀 Starting EcoleDirecte import...\n");

  try {
    if (dataTypes.includes('SALLES')) await importRooms();
    if (dataTypes.includes('CLASSES')) await importClasses();
    if (dataTypes.includes('USERS')) await importUsers();
    if (dataTypes.includes('EDT_CLASSE')) await importSessions();

    console.log("\n🎉 Import completed successfully");
  } catch (error) {
    console.error("💥 Global import error:", error);
  }
}

// Run directly
if (require.main === module) {
  importEDDataToDB();
}

module.exports = { importEDDataToDB };
