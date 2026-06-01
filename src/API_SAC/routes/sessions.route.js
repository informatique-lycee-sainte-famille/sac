// ./API_SAC/routes/sessions.route.js
// Routes pour la gestion des sessions de cours (emploi du temps, présences, PDF, remplacement enseignant).
// C'est le fichier de routes le plus complexe du projet : il gère les vues élève, enseignant et staff.

// Importe Express pour créer le routeur
const express = require("express");
// Importe Luxon pour la manipulation de dates avec fuseaux horaires
const { DateTime } = require("luxon");
// Importe Sharp pour la manipulation d'images (signature manuelle)
const sharp = require("sharp");
// Importe le client Prisma pour les requêtes en base de données
const { prisma } = require("../commons/prisma.common");
// Importe le middleware de contrôle d'accès par rôle
const require_access = require("../middlewares/require_access.middleware");
// Importe les constantes de rôles
const { ROLES } = require("../commons/constants.common");
// Importe le système de logging (métier + technique)
const { LOG_DESTINATIONS, TECHNICAL_LEVELS, log_business, log_technical } = require("../commons/logger.common");
// Importe la diffusion WebSocket en temps réel (pour notifier les clients d'un changement de présence)
const { broadcastAttendanceUpdate } = require("../commons/realtime.common");
// Importe le générateur de PDF d'émargement
const { generate_attendance_pdf } = require("../../scripts/auto/generate_attendance_pdf.script");

// Crée un nouveau routeur Express
const router = express.Router();
// Fuseau horaire de l'application (par défaut : Europe/Paris)
const APP_TIMEZONE = process.env.TIMEZONE || "Europe/Paris";

// ═══════════════════════════════════════════════════════════════
// FONCTIONS UTILITAIRES
// ═══════════════════════════════════════════════════════════════

// Récupère l'utilisateur connecté depuis la session Express
function getSessionUser(req) {
  return req.session?.user || null;
}

// Normalise la vue demandée (day, week, month) — par défaut "day"
function normalizeView(view) {
  return ["day", "week", "month"].includes(view) ? view : "day";
}

// Calcule les bornes temporelles (début/fin) d'une période selon la vue (jour, semaine, mois)
// Retourne les dates au format JavaScript Date et ISO pour les requêtes en base
function getPeriodBounds(date, view = "day") {
  // Parse la date demandée ou utilise la date du jour
  const requestedDay = date
    ? DateTime.fromISO(String(date), { zone: APP_TIMEZONE })
    : DateTime.now().setZone(APP_TIMEZONE);
  // Si la date est invalide, utilise aujourd'hui
  const day = requestedDay.isValid ? requestedDay : DateTime.now().setZone(APP_TIMEZONE);
  const safeView = normalizeView(view);
  // Calcule le début de la période selon la vue
  const start = safeView === "week"
    ? day.startOf("week") // Début de la semaine (lundi)
    : safeView === "month"
      ? day.startOf("month") // Début du mois
      : day.startOf("day"); // Début de la journée
  // Calcule la fin de la période selon la vue
  const end = safeView === "week"
    ? day.endOf("week") // Fin de la semaine (dimanche)
    : safeView === "month"
      ? day.endOf("month") // Fin du mois
      : day.endOf("day"); // Fin de la journée

  return {
    isoDate: day.toISODate(), // Date au format ISO (YYYY-MM-DD)
    view: safeView, // Vue utilisée
    start: start.toJSDate(), // Date de début en JavaScript Date
    end: end.toJSDate(), // Date de fin en JavaScript Date
    range: {
      start: start.toISODate(), // Date de début ISO
      end: end.toISODate(), // Date de fin ISO
    },
  };
}

// Formate une session de cours pour l'affichage côté client (vue élève/enseignant)
// Inclut les infos du cours, la présence de l'utilisateur courant, et les statistiques
function formatSession(session, currentUserId) {
  // Cherche l'enregistrement de présence de l'utilisateur courant dans cette session
  const currentUserAttendance = session.attendance?.find(record => record.userId === currentUserId) || null;
  // Calcule les statistiques de présence
  const stats = getAttendanceStats(session);

  return {
    id: session.id, // ID de la session
    label: session.label, // Libellé du cours
    matiere: session.matiere, // Nom de la matière
    codeMatiere: session.codeMatiere, // Code de la matière
    color: session.color, // Couleur d'affichage
    status: session.status, // Statut (scheduled, ongoing, completed, cancelled)
    startTime: session.startTime, // Heure de début
    endTime: session.endTime, // Heure de fin
    // Informations de la classe (si disponible)
    class: session.class
      ? {
          id: session.class.id,
          code: session.class.code,
          name: session.class.name,
          edId: session.class.edId,
        }
      : null,
    // Informations de la salle (si disponible)
    room: session.room
      ? {
          id: session.room.id,
          code: session.room.code,
          name: session.room.name,
        }
      : null,
    // Informations de l'enseignant (si disponible)
    teacher: session.teacher
      ? {
          id: session.teacher.id,
          firstName: session.teacher.firstName,
          lastName: session.teacher.lastName,
          email: session.teacher.o365Email || session.teacher.edEmail,
        }
      : null,
    // Présence de l'utilisateur courant (null s'il n'a pas encore badgé)
    attendance: currentUserAttendance
      ? {
          status: currentUserAttendance.status, // "present" ou "absent"
          scannedAt: currentUserAttendance.scannedAt, // Date/heure du scan
          hasSignature: Boolean(currentUserAttendance.signature), // A-t-il signé ?
        }
      : null,
    isFinalized: Boolean(session.finalization), // L'appel a-t-il été envoyé à EcoleDirecte ?
    // Détails de la finalisation (si l'appel a été envoyé)
    finalization: session.finalization
      ? {
          sentToEdAt: session.finalization.sentToEdAt, // Date d'envoi à ED
          pdfFilename: session.finalization.pdfFilename, // Nom du fichier PDF
        }
      : null,
    stats, // Statistiques de présence
  };
}

// Récupère la liste des élèves d'une session (filtre par rôle "student")
function getStudentUsers(session) {
  return session.class?.users?.filter(user => user.role === "student") || [];
}

// Calcule les statistiques de présence d'une session
// (nombre total d'élèves, présents, absents, pourcentage de présence)
function getAttendanceStats(session) {
  const students = getStudentUsers(session);
  // Crée un ensemble des IDs des élèves de la classe
  const studentIds = new Set(students.map(student => student.id));
  // Compte les élèves marqués comme présents (filtre par rôle student)
  const presentCount = (session.attendance || []).filter(record => (
    record.status === "present" &&
    (record.user?.role === "student" || studentIds.has(record.userId))
  )).length;
  // Le nombre total d'élèves est le nombre d'élèves dans la classe (ou le nombre de présents si pas de classe)
  const totalStudents = students.length || presentCount;
  // Le nombre d'absents est le total moins les présents (minimum 0)
  const absentCount = Math.max(totalStudents - presentCount, 0);
  // Calcule le pourcentage de présence
  const presencePercent = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

  return {
    totalStudents,
    presentCount,
    absentCount,
    presencePercent,
  };
}

// Parse un entier optionnel depuis les paramètres de requête (retourne null si invalide)
function parseOptionalInt(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

// Retourne le libellé du cours à afficher (label > matiere > codeMatiere > "Cours")
function getCourseLabel(session) {
  return session.label || session.matiere || session.codeMatiere || "Cours";
}

// ═══════════════════════════════════════════════════════════════
// FONCTIONS D'AGRÉGATION (pour la vue staff/tableau de bord)
// ═══════════════════════════════════════════════════════════════

// Crée un objet d'agrégation vide (pour les statistiques par classe, enseignant, matière, salle)
function makeEmptyAggregate(id, label) {
  return {
    id,
    label,
    sessions: 0, // Nombre de sessions
    finalizedSessions: 0, // Nombre de sessions finalisées
    expectedStudents: 0, // Nombre d'élèves attendus
    presentCount: 0, // Nombre de présents
    absentCount: 0, // Nombre d'absents
    presencePercent: 0, // Pourcentage de présence
  };
}

// Ajoute les statistiques d'une session à un agrégat existant
function addSessionToAggregate(aggregate, session) {
  const stats = getAttendanceStats(session);
  aggregate.sessions += 1;
  aggregate.finalizedSessions += session.finalization ? 1 : 0;
  aggregate.expectedStudents += stats.totalStudents;
  aggregate.presentCount += stats.presentCount;
  aggregate.absentCount += stats.absentCount;
  // Recalcule le pourcentage global de présence
  aggregate.presencePercent = aggregate.expectedStudents > 0
    ? Math.round((aggregate.presentCount / aggregate.expectedStudents) * 100)
    : 0;
}

// Agrège les sessions par une clé donnée (classe, enseignant, matière, salle)
// et retourne un tableau trié par pourcentage de présence décroissant
function aggregateBy(sessions, getKey) {
  const groups = new Map();

  for (const session of sessions) {
    // Récupère la clé d'agrégation (ex: id et nom de la classe)
    const { id, label } = getKey(session);
    const key = String(id || label || "unknown");
    // Crée le groupe s'il n'existe pas encore
    if (!groups.has(key)) {
      groups.set(key, makeEmptyAggregate(id, label));
    }

    // Ajoute cette session au groupe
    addSessionToAggregate(groups.get(key), session);
  }

  // Retourne les groupes triés par % de présence décroissant, puis par nom alphabétique
  return [...groups.values()].sort((a, b) => b.presencePercent - a.presencePercent || a.label.localeCompare(b.label));
}

// Construit un résumé complet pour la vue staff : statistiques globales + ventilation par classe, enseignant, matière, salle
function buildStaffSummary(sessions) {
  // Calcule les statistiques globales
  const global = makeEmptyAggregate("global", "Global");
  sessions.forEach(session => addSessionToAggregate(global, session));

  return {
    global,
    // Ventilation par classe
    byClass: aggregateBy(sessions, session => ({
      id: session.class?.id,
      label: session.class?.name || session.class?.code || "Classe inconnue",
    })),
    // Ventilation par enseignant
    byTeacher: aggregateBy(sessions, session => ({
      id: session.teacher?.id,
      label: `${session.teacher?.lastName || ""} ${session.teacher?.firstName || ""}`.trim() || "Enseignant inconnu",
    })),
    // Ventilation par matière
    bySubject: aggregateBy(sessions, session => ({
      id: session.codeMatiere || session.matiere || session.label || "unknown",
      label: session.matiere || session.label || session.codeMatiere || "Matiere inconnue",
    })),
    // Ventilation par salle
    byRoom: aggregateBy(sessions, session => ({
      id: session.room?.id,
      label: session.room?.name || session.room?.code || "Salle inconnue",
    })),
  };
}

// Formate une session pour la vue staff (avec les statistiques mais sans les données de présence individuelles)
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

// Formate l'horaire d'une session au format "HH:mm-HH:mm" dans le fuseau horaire de Paris
function formatHoraire(session) {
  const start = DateTime.fromJSDate(new Date(session.startTime)).setZone(APP_TIMEZONE).toFormat("HH:mm");
  const end = DateTime.fromJSDate(new Date(session.endTime)).setZone(APP_TIMEZONE).toFormat("HH:mm");
  return `${start}-${end}`;
}

// Retourne l'année scolaire au format "2024 - 2025" (basé sur le mois : sept-déc = année courante, jan-août = année précédente)
function schoolYear(date = new Date()) {
  const year = date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1;
  return `${year} - ${year + 1}`;
}

// ═══════════════════════════════════════════════════════════════
// FONCTIONS POUR LA GÉNÉRATION DE PDF
// ═══════════════════════════════════════════════════════════════

// Convertit une session Prisma en objet de données pour le générateur de PDF d'émargement
function sessionToPdfData(session, author) {
  // Crée une Map de présence par utilisateur pour un accès rapide
  const attendanceByUser = new Map(session.attendance.map(record => [record.userId, record]));
  // Récupère la présence de l'enseignant
  const teacherAttendance = attendanceByUser.get(session.teacherId);
  // Récupère la liste des élèves de la classe
  const students = session.class.users || [];

  return {
    className: session.class.name || session.class.code, // Nom de la classe
    year: schoolYear(new Date(session.startTime)), // Année scolaire
    courseLabel: session.label || session.matiere || session.codeMatiere, // Libellé du cours
    roomCode: session.room.code, // Code de la salle
    roomName: session.room.name, // Nom de la salle
    startTime: session.startTime, // Heure de début
    endTime: session.endTime, // Heure de fin
    author, // Auteur du PDF (nom de l'enseignant)
    // Informations de finalisation
    finalization: session.finalization
      ? {
          sentToEdAt: session.finalization.sentToEdAt,
          sentByUserId: session.finalization.sentByUserId,
          pdfFilename: session.finalization.pdfFilename,
        }
      : null,
    // Données de l'enseignant pour le PDF
    teacher: {
      firstName: session.teacher.firstName,
      lastName: session.teacher.lastName,
      status: teacherAttendance?.status === "present" ? "present" : "absent",
      scannedAt: teacherAttendance?.scannedAt || null,
      signature: teacherAttendance?.signature || null,
      comment: teacherAttendance?.comment || null,
    },
    // Données de chaque élève pour le PDF
    students: students.map(student => {
      const attendance = attendanceByUser.get(student.id);
      return {
        firstName: student.firstName,
        lastName: student.lastName,
        status: attendance?.status === "present" ? "present" : "absent",
        scannedAt: attendance?.scannedAt || null,
        signature: attendance?.signature || null,
        comment: attendance?.comment || null,
      };
    }),
  };
}

// ═══════════════════════════════════════════════════════════════
// FONCTIONS DE CONTRÔLE D'ACCÈS AUX SESSIONS
// ═══════════════════════════════════════════════════════════════

// Vérifie si un utilisateur a le droit de voir une session
// - Staff/Admin : peuvent tout voir
// - Enseignant : uniquement ses propres cours
// - Élève : uniquement les cours de sa classe
function canReadSession(user, session) {
  if (["staff", "admin"].includes(user.role)) return true;
  if (user.role === "teacher") return session.teacherId === user.id;
  if (user.role === "student") return session.classId === user.classId;
  return false;
}

// ═══════════════════════════════════════════════════════════════
// FONCTIONS POUR LA PRÉSENCE MANUELLE
// ═══════════════════════════════════════════════════════════════

// Génère une image de signature SVG pour une validation manuelle de présence
// (quand l'enseignant marque manuellement un élève présent/absent sans scan NFC)
async function manualSignatureDataUrl({ status, teacherName, studentName, scannedAt }) {
  // Détermine le titre selon le statut
  const title = status === "present"
    ? "Présence validée manuellement"
    : "Absence validée manuellement";
  // Formate la date/heure du scan
  const timestamp = DateTime.fromJSDate(scannedAt).setZone(APP_TIMEZONE).toFormat("dd/MM/yyyy HH:mm");
  // Fonction d'échappement pour les caractères spéciaux SVG
  const escapeSvg = value => String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  // Génère un SVG contenant les informations de la validation manuelle
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

  // Convertit le SVG en PNG puis en base64
  const pngBuffer = await sharp(Buffer.from(svg, "utf8")).png().toBuffer();
  return `data:image/png;base64,${pngBuffer.toString("base64")}`;
}

// Vérifie si un utilisateur peut gérer manuellement la présence sur une session
// (l'enseignant assigné au cours, le staff ou l'admin)
function canManageManualAttendance(user, session) {
  const role = String(user?.role || "").toLowerCase();
  return ["staff", "admin"].includes(role) || session.teacherId === Number(user?.id);
}

// Charge une session de cours complète avec toutes ses relations pour la gestion de présence manuelle
async function loadSessionForManualAttendance(sessionId) {
  return prisma.courseSession.findUnique({
    where: { id: sessionId },
    include: {
      class: {
        include: {
          users: {
            where: { role: "student" }, // Uniquement les élèves
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
      room: true, // Inclut la salle
      teacher: true, // Inclut l'enseignant
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
      finalization: true, // Inclut la finalisation (si envoyé à ED)
    },
  });
}

// ═══════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════

// Route GET /today : récupère les sessions de cours de l'utilisateur connecté pour la période demandée
// Accessible à tous les utilisateurs authentifiés (élèves inclus)
// Les sessions visibles dépendent du rôle :
// - Élève : ses cours (par classe)
// - Enseignant : ses cours (par enseignant)
// - Staff/Admin : tous les cours
router.get("/today", require_access({ minRole: ROLES.STUDENT }), async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser?.id) {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Utilisateur non authentifie." });
    }

    const userId = Number(sessionUser.id);
    // Calcule les bornes temporelles de la période demandée
    const { start, end, isoDate, view, range } = getPeriodBounds(req.query.date, req.query.view);

    // Récupère les infos de l'utilisateur en base (rôle et classe)
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

    // Construit les filtres de visibilité selon le rôle
    const visibilityFilters = [];
    const canSeeAllSessions = ["staff", "admin"].includes(dbUser.role);

    // Les enseignants ne voient que leurs propres cours
    if (dbUser.role === "teacher") {
      visibilityFilters.push({ teacherId: dbUser.id });
    }

    // Les élèves ne voient que les cours de leur classe
    if (dbUser.role === "student") {
      if (!dbUser.classId) {
        return res.json([]); // Pas de classe = pas de cours
      }

      visibilityFilters.push({ classId: dbUser.classId });
    }

    // Si l'utilisateur n'est ni staff/admin et n'a aucun filtre, pas de cours à afficher
    if (!canSeeAllSessions && visibilityFilters.length === 0) {
      return res.json([]);
    }

    // Construit la requête Prisma avec les filtres temporels
    const where = {
      startTime: {
        gte: start, // Après le début de la période
        lte: end, // Avant la fin de la période
      },
    };

    // Ajoute les filtres de visibilité si l'utilisateur n'est pas staff/admin
    if (!canSeeAllSessions) {
      where.OR = visibilityFilters;
    }

    // Récupère les sessions avec toutes les relations nécessaires
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
        { startTime: "asc" }, // Tri par heure de début
        { endTime: "asc" },
      ],
    });

    // Retourne les sessions formatées avec la date et la vue
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

// Route GET /staff : récupère TOUTES les sessions pour la vue staff/admin (tableau de bord)
// Inclut les filtres par classe, salle, enseignant, matière + les statistiques agrégées
// Accessible uniquement au personnel (STAFF) et aux administrateurs
router.get("/staff", require_access({ minRole: ROLES.STAFF }), async (req, res) => {
  try {
    // Calcule les bornes temporelles
    const { start, end, isoDate, view, range } = getPeriodBounds(req.query.date, req.query.view);
    // Récupère les filtres optionnels depuis les paramètres de requête
    const classId = parseOptionalInt(req.query.classId);
    const roomId = parseOptionalInt(req.query.roomId);
    const teacherId = parseOptionalInt(req.query.teacherId);
    const subject = String(req.query.subject || "").trim();

    // Construit la requête Prisma avec les filtres temporels
    const where = {
      startTime: {
        gte: start,
        lte: end,
      },
    };

    // Ajoute les filtres optionnels si fournis
    if (classId) where.classId = classId;
    if (roomId) where.roomId = roomId;
    if (teacherId) where.teacherId = teacherId;
    if (subject) {
      // Filtre par matière (cherche dans matiere, codeMatiere et label)
      where.OR = [
        { matiere: subject },
        { codeMatiere: subject },
        { label: subject },
      ];
    }

    // Exécute 5 requêtes en parallèle pour optimiser les performances
    const [sessions, classes, rooms, teachers, subjectRows] = await Promise.all([
      // 1. Récupère les sessions filtrées avec toutes les relations
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
      // 2. Récupère toutes les classes (pour les options de filtre)
      prisma.class.findMany({
        orderBy: [{ name: "asc" }, { code: "asc" }],
        select: { id: true, code: true, name: true },
      }),
      // 3. Récupère toutes les salles (pour les options de filtre)
      prisma.room.findMany({
        orderBy: [{ name: "asc" }, { code: "asc" }],
        select: { id: true, code: true, name: true },
      }),
      // 4. Récupère tous les enseignants (pour les options de filtre)
      prisma.user.findMany({
        where: { role: "teacher" },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: { id: true, firstName: true, lastName: true },
      }),
      // 5. Récupère les matières distinctes (pour les options de filtre)
      prisma.courseSession.findMany({
        distinct: ["matiere", "codeMatiere", "label"],
        orderBy: [{ matiere: "asc" }, { label: "asc" }],
        select: { matiere: true, codeMatiere: true, label: true },
      }),
    ]);

    // Déduplique les matières pour les options de filtre
    const subjectOptions = [...new Map(
      subjectRows
        .map(row => row.matiere || row.label || row.codeMatiere)
        .filter(Boolean)
        .map(value => [value, { id: value, name: value }])
    ).values()].sort((a, b) => a.name.localeCompare(b.name));

    // Retourne les sessions avec les filtres, les options et les statistiques agrégées
    return res.json({
      date: isoDate,
      view,
      range,
      filters: { classId, roomId, teacherId, subject }, // Filtres actuellement appliqués
      options: {
        classes, // Options de filtre par classe
        rooms, // Options de filtre par salle
        teachers, // Options de filtre par enseignant
        subjects: subjectOptions, // Options de filtre par matière
      },
      summary: buildStaffSummary(sessions), // Statistiques agrégées
      sessions: sessions.map(formatStaffSession), // Sessions formatées
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

// Route POST /:sessionId/attendance/manual : valide manuellement la présence/absence d'un élève
// L'enseignant peut marquer un élève présent ou absent sans scan NFC
// Accessible aux enseignants et rôles supérieurs
router.post("/:sessionId/attendance/manual", require_access({ minRole: ROLES.TEACHER }), async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    const sessionId = Number.parseInt(req.params.sessionId, 10);
    const studentId = Number.parseInt(req.body?.studentId, 10);
    // Récupère le statut demandé (par défaut "present")
    const status = String(req.body?.status || "present").toLowerCase();
    // Récupère le commentaire optionnel (tronqué à 500 caractères)
    const comment = typeof req.body?.comment === "string"
      ? req.body.comment.trim().slice(0, 500) || null
      : null;

    // Vérifie l'authentification
    if (!sessionUser?.id) {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Utilisateur non authentifie." });
    }

    // Vérifie les IDs
    if (!Number.isInteger(sessionId) || !Number.isInteger(studentId)) {
      return res.status(400).json({ error: "INVALID_MANUAL_ATTENDANCE", message: "Session ou eleve invalide." });
    }

    // Vérifie le statut
    if (!["present", "absent"].includes(status)) {
      return res.status(400).json({ error: "INVALID_ATTENDANCE_STATUS", message: "Statut de presence invalide." });
    }

    // Charge la session complète
    const session = await loadSessionForManualAttendance(sessionId);
    if (!session) {
      return res.status(404).json({ error: "SESSION_NOT_FOUND", message: "Session introuvable." });
    }

    // Vérifie que l'appel n'a pas déjà été envoyé à EcoleDirecte
    if (session.finalization) {
      return res.status(403).json({ error: "APPEL_ALREADY_SENT", message: "Appel deja envoye a EcoleDirecte." });
    }

    // Vérifie que l'utilisateur a le droit de gérer la présence sur ce cours
    if (!canManageManualAttendance(sessionUser, session)) {
      return res.status(403).json({ error: "MANUAL_ATTENDANCE_FORBIDDEN", message: "Vous ne pouvez pas modifier l'appel de ce cours." });
    }

    // Vérifie que l'élève fait partie de la classe du cours
    const student = session.class?.users?.find(user => user.id === studentId);
    if (!student) {
      return res.status(404).json({ error: "STUDENT_NOT_IN_CLASS", message: "Cet eleve n'appartient pas a la classe du cours." });
    }

    // Génère les données de la validation manuelle
    const scannedAt = new Date();
    const teacherName = `${sessionUser.firstName || ""} ${sessionUser.lastName || ""}`.trim()
      || `${session.teacher.firstName || ""} ${session.teacher.lastName || ""}`.trim()
      || `User #${sessionUser.id}`;
    const studentName = `${student.firstName || ""} ${student.lastName || ""}`.trim() || `Student #${student.id}`;
    // Génère une image de signature automatique (SVG → PNG → base64)
    const signature = await manualSignatureDataUrl({
      status,
      teacherName,
      studentName,
      scannedAt,
    });

    // Crée ou met à jour l'enregistrement de présence
    const attendance = await prisma.attendanceRecord.upsert({
      where: {
        sessionId_userId: {
          sessionId,
          userId: studentId,
        },
      },
      update: {
        status, // Met à jour le statut
        signature, // Met à jour la signature
        comment, // Met à jour le commentaire
        scannedAt, // Met à jour la date de scan
      },
      create: {
        sessionId,
        userId: studentId,
        status,
        signature,
        comment,
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

    // Log métier : enregistre la validation manuelle
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
          comment,
        },
      }
    );

    // Notifie tous les clients WebSocket abonnés à cette session
    broadcastAttendanceUpdate(sessionId, {
      updatedByUserId: Number(sessionUser.id),
    });

    // Recharge la session pour retourner les statistiques à jour
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

// Route POST /:sessionId/teacher : remplace l'enseignant assigné à une session de cours
// Utilisé quand un enseignant est absent et qu'un remplaçant prend le cours
// Accessible uniquement au personnel (STAFF) et aux administrateurs
router.post("/:sessionId/teacher", require_access({ minRole: ROLES.STAFF }), async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    const sessionId = Number.parseInt(req.params.sessionId, 10);
    const teacherId = Number.parseInt(req.body?.teacherId, 10);

    if (!sessionUser?.id) {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Utilisateur non authentifie." });
    }

    if (!Number.isInteger(sessionId) || !Number.isInteger(teacherId)) {
      return res.status(400).json({ error: "INVALID_TEACHER_REPLACEMENT", message: "Session ou enseignant invalide." });
    }

    // Charge la session et vérifie que le nouvel enseignant existe
    const [session, teacher] = await Promise.all([
      prisma.courseSession.findUnique({
        where: { id: sessionId },
        include: { finalization: true, teacher: true },
      }),
      prisma.user.findFirst({
        where: { id: teacherId, role: "teacher" },
        select: { id: true, firstName: true, lastName: true, role: true },
      }),
    ]);

    if (!session) {
      return res.status(404).json({ error: "SESSION_NOT_FOUND", message: "Session introuvable." });
    }

    if (!teacher) {
      return res.status(404).json({ error: "TEACHER_NOT_FOUND", message: "Enseignant introuvable." });
    }

    // Vérifie que l'appel n'a pas déjà été envoyé
    if (session.finalization) {
      return res.status(403).json({ error: "APPEL_ALREADY_SENT", message: "Appel deja envoye a EcoleDirecte." });
    }

    // Sauvegarde l'ancien enseignant pour le log
    const previousTeacherId = session.teacherId;
    // Met à jour l'enseignant de la session
    const updated = await prisma.courseSession.update({
      where: { id: sessionId },
      data: { teacherId },
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
      },
    });

    // Log métier : enregistre le remplacement
    await log_business("course_session_teacher_replaced", "Enseignant remplacé sur une session de cours.", {
      destination: LOG_DESTINATIONS.BOTH,
      req,
      userId: Number(sessionUser.id),
      entityType: "CourseSession",
      entityId: sessionId,
      metadata: {
        previousTeacherId,
        teacherId,
      },
    });

    // Notifie les clients WebSocket du changement
    broadcastAttendanceUpdate(sessionId, {
      updatedByUserId: Number(sessionUser.id),
      reason: "teacher_replaced",
    });

    return res.json({
      message: "Enseignant remplaçant affecté.",
      session: updated,
    });
  } catch (err) {
    log_technical(TECHNICAL_LEVELS.ERROR, "Course session teacher replacement failed", {
      error: err,
      userId: req.session?.user?.id,
      sessionId: req.params.sessionId,
      body: req.body,
    });
    return res.status(500).json({
      error: "TEACHER_REPLACEMENT_FAILED",
      message: "Erreur lors du remplacement enseignant.",
    });
  }
});

// Route GET /:sessionId : récupère les détails complets d'une session de cours
// Inclut la liste des élèves avec leur présence (si l'utilisateur y a droit)
// Accessible à tous les utilisateurs authentifiés
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

    // Récupère les infos de l'utilisateur en base
    const dbUser = await prisma.user.findUnique({
      where: { id: Number(sessionUser.id) },
      select: { id: true, role: true, classId: true },
    });

    if (!dbUser) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "Utilisateur introuvable." });
    }

    // Charge la session complète avec toutes les relations
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

    // Vérifie que l'utilisateur a le droit de voir cette session
    if (!canReadSession(dbUser, session)) {
      return res.status(403).json({ error: "SESSION_FORBIDDEN", message: "Acces interdit a cette session." });
    }

    // Détermine les données visibles selon le rôle de l'utilisateur
    const isTeacherOwner = dbUser.role === "teacher" && session.teacherId === dbUser.id;
    // Récupère la présence de l'utilisateur courant
    const userAttendance = session.attendance.find(record => record.userId === dbUser.id) || null;
    // L'enseignant du cours et le staff/admin peuvent voir toutes les présences
    const hasFullAttendanceAccess = isTeacherOwner || ["staff", "admin"].includes(dbUser.role);
    // Filtre les présences visibles selon le rôle
    const visibleAttendance = hasFullAttendanceAccess
      ? session.attendance
      : (userAttendance ? [userAttendance] : []); // Les élèves ne voient que leur propre présence
    // Crée une Map de présence par utilisateur
    const attendanceByUser = new Map(session.attendance.map(record => [record.userId, record]));
    // Les élèves visibles avec leur présence (uniquement pour l'enseignant et le staff)
    const visibleStudents = hasFullAttendanceAccess
      ? (session.class?.users || []).map(student => ({
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          role: student.role,
          attendance: attendanceByUser.get(student.id) || null,
        }))
      : [];

    // Retourne les données de la session avec les droits d'accès adaptés
    return res.json({
      id: session.id,
      label: session.label,
      matiere: session.matiere,
      codeMatiere: session.codeMatiere,
      color: session.color,
      status: session.status,
      startTime: session.startTime,
      endTime: session.endTime,
      horaire: formatHoraire(session), // Horaire formaté (ex: "08:00-09:00")
      class: session.class,
      room: session.room,
      teacher: session.teacher,
      finalization: session.finalization,
      stats: getAttendanceStats(session), // Statistiques de présence
      currentUserAttendance: userAttendance, // Présence de l'utilisateur courant
      attendance: visibleAttendance, // Présences visibles
      students: visibleStudents, // Élèves avec leur présence
      canGeneratePdf: isTeacherOwner, // L'utilisateur peut-il générer le PDF ?
      canManageAttendance: hasFullAttendanceAccess && !session.finalization, // L'utilisateur peut-il modifier les présences ?
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

// Route GET /:sessionId/pdf : génère le PDF d'émargement pour une session de cours
// Accessible uniquement aux enseignants et rôles supérieurs
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

    // Charge la session complète avec les élèves et les présences
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

    // Vérifie que l'enseignant est bien assigné à ce cours
    if (session.teacherId !== Number(sessionUser.id)) {
      return res.status(403).json({ error: "TEACHER_NOT_ASSIGNED", message: "Cet enseignant n'est pas affecte a ce cours." });
    }

    // Construit le nom de l'auteur du PDF
    const author = `${sessionUser.firstName || ""} ${sessionUser.lastName || ""}`.trim() || "SAC";
    // Génère le buffer PDF
    const pdfBuffer = await generate_attendance_pdf(sessionToPdfData(session, author));
    // Construit le nom du fichier PDF (ex: "3A_2025-01-15_08-00_emargement.pdf")
    const day = DateTime.fromJSDate(new Date(session.startTime)).setZone(APP_TIMEZONE).toFormat("yyyy-MM-dd_HH-mm");
    const filename = `${session.class.code}_${day}_emargement.pdf`;

    // Log métier : enregistre la génération du PDF
    await log_business("course_session_pdf_generated", "PDF d'emargement genere manuellement.", {
      destination: LOG_DESTINATIONS.BOTH,
      req,
      entityType: "CourseSession",
      entityId: session.id,
      metadata: { filename },
    });

    // Définit les en-têtes HTTP et envoie le PDF
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

// Exporte le routeur
module.exports = router;
