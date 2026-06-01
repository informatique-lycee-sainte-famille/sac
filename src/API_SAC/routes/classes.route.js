// ./API_SAC/routes/classes.route.js
// Routes pour la gestion des classes : vue "staff" (personnel) et vue "élève" (ma classe).

// Importe Express pour créer le routeur
const express = require("express");
// Importe le client Prisma pour les requêtes en base de données
const { prisma } = require("../commons/prisma.common");
// Importe le middleware de contrôle d'accès par rôle
const require_access = require("../middlewares/require_access.middleware");
// Importe les constantes de rôles
const { ROLES } = require("../commons/constants.common");
// Importe le système de logging technique
const { TECHNICAL_LEVELS, log_technical } = require("../commons/logger.common");

// Crée un nouveau routeur Express
const router = express.Router();

// Récupère l'utilisateur connecté depuis la session Express
function getSessionUser(req) {
  return req.session?.user || null;
}

// Formate les données d'un élève pour la vue "staff" (tableau de bord du personnel).
// Enrichit les données de l'élève avec des statistiques d'activité
// (dernière connexion, dernier scan, dernière présence, etc.)
function formatStaffStudent(student, latestBrowserSessionByUserId) {
  // Récupère la date de dernière connexion (dernière session de navigateur)
  const lastLogin = latestBrowserSessionByUserId.get(Number(student.id))?.createdAt || null;
  // Récupère la date du dernier scan NFC
  const lastScan = student.nfcScans?.[0]?.scannedAt || null;
  // Récupère le dernier enregistrement de présence
  const lastAttendance = student.attendance?.[0] || null;

  return {
    id: student.id, // ID interne de l'élève
    firstName: student.firstName, // Prénom
    lastName: student.lastName, // Nom
    role: student.role, // Rôle (devrait être "student")
    edId: student.edId, // ID EcoleDirecte
    o365Email: student.o365Email, // Email Office 365
    edEmail: student.edEmail, // Email EcoleDirecte
    o365AvatarB64: student.o365AvatarB64, // Avatar Office 365 en base64
    edPhotoB64: student.edPhotoB64, // Photo EcoleDirecte en base64
    hasO365AccountLinked: Boolean(student.o365Id || student.o365Email), // L'élève a-t-il un compte O365 lié ?
    hasLoggedIn: Boolean(student.o365Email), // L'élève s'est-il déjà connecté ?
    lastLoginAt: lastLogin, // Date de la dernière connexion
    lastNfcScanAt: lastScan, // Date du dernier scan NFC
    attendanceRecordsCount: student._count?.attendance || 0, // Nombre total de présences enregistrées
    nfcScansCount: student._count?.nfcScans || 0, // Nombre total de scans NFC
    // Dernier enregistrement de présence (avec détails de la session associée)
    lastAttendance: lastAttendance
      ? {
          status: lastAttendance.status, // Statut (present/absent)
          scannedAt: lastAttendance.scannedAt, // Date du scan
          updatedAt: lastAttendance.updatedAt, // Date de mise à jour
          session: lastAttendance.session // Session de cours associée
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

// Route GET /staff : récupère toutes les classes avec leurs élèves et statistiques
// Accessible uniquement au personnel (STAFF) et aux administrateurs
router.get("/staff", require_access({ minRole: ROLES.STAFF }), async (req, res) => {
  try {
    // Exécute 2 requêtes en parallèle pour optimiser les performances
    const [classes, browserSessions] = await Promise.all([
      // 1. Récupère toutes les classes avec les élèves et leurs activités
      prisma.class.findMany({
        orderBy: [
          { name: "asc" }, // Tri par nom de classe
          { code: "asc" }, // Puis par code
        ],
        include: {
          // Inclut les élèves de la classe (filtrés par rôle "student")
          users: {
            where: { role: "student" },
            orderBy: [
              { lastName: "asc" }, // Tri par nom de famille
              { firstName: "asc" }, // Puis par prénom
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
              // Dernier scan NFC de l'élève
              nfcScans: {
                orderBy: { scannedAt: "desc" },
                take: 1,
                select: { scannedAt: true },
              },
              // Dernier enregistrement de présence (avec la session associée)
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
              // Compteurs d'activité agrégés
              _count: {
                select: {
                  attendance: true, // Nombre total de présences
                  nfcScans: true, // Nombre total de scans NFC
                },
              },
            },
          },
          // Compteur du nombre de sessions de cours pour cette classe
          _count: {
            select: {
              sessions: true,
            },
          },
        },
      }),
      // 2. Récupère toutes les sessions de navigateur (pour trouver la dernière connexion de chaque user)
      prisma.browserSession.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          data: true,
          createdAt: true,
        },
      }),
    ]);

    // Construit une Map pour trouver rapidement la dernière session de navigateur de chaque utilisateur
    const latestBrowserSessionByUserId = new Map();
    for (const browserSession of browserSessions) {
      const userId = Number(browserSession.data?.user?.id);
      // Ne garde que la première occurrence (la plus récente car triée par date desc)
      if (Number.isInteger(userId) && !latestBrowserSessionByUserId.has(userId)) {
        latestBrowserSessionByUserId.set(userId, browserSession);
      }
    }

    // Formate et retourne les classes avec les statistiques agrégées
    return res.json({
      classes: classes.map(cls => {
        // Formate chaque élève avec ses statistiques
        const students = cls.users.map(student => formatStaffStudent(student, latestBrowserSessionByUserId));
        // Calcule les statistiques de la classe
        const linkedCount = students.filter(student => student.hasO365AccountLinked).length;
        const loggedInCount = students.filter(student => student.hasLoggedIn).length;
        const scannedCount = students.filter(student => student.nfcScansCount > 0).length;

        return {
          id: cls.id, // ID interne de la classe
          edId: cls.edId, // ID EcoleDirecte de la classe
          code: cls.code, // Code de la classe (ex: "3A")
          name: cls.name, // Nom complet de la classe
          studentsCount: students.length, // Nombre total d'élèves
          linkedCount, // Nombre d'élèves avec un compte O365 lié
          loggedInCount, // Nombre d'élèves qui se sont connectés
          scannedCount, // Nombre d'élèves qui ont déjà scanné NFC
          sessionsCount: cls._count.sessions, // Nombre total de sessions de cours
          students, // Liste des élèves avec leurs données
        };
      }),
    });
  } catch (err) {
    // En cas d'erreur, log et retourne une erreur 500
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

// Route GET /me : retourne la classe de l'élève actuellement connecté
// Accessible à tous les utilisateurs authentifiés
router.get("/me", require_access({ minRole: ROLES.STUDENT }), async (req, res) => {
  try {
    // Récupère l'utilisateur depuis la session
    const sessionUser = getSessionUser(req);
    if (!sessionUser?.id) {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Utilisateur non authentifie." });
    }

    // Récupère les données de l'utilisateur en base (rôle et classId)
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

    // Cette route est réservée aux élèves
    if (user.role !== "student") {
      return res.status(403).json({ error: "STUDENT_REQUIRED", message: "Cette route concerne la classe de l'eleve." });
    }

    // Vérifie que l'élève est rattaché à une classe
    if (!user.classId) {
      return res.status(404).json({ error: "CLASS_NOT_FOUND", message: "Aucune classe rattachee a cet eleve." });
    }

    // Récupère la classe avec la liste des élèves (triés par nom)
    const myClass = await prisma.class.findUnique({
      where: { id: user.classId },
      include: {
        users: {
          where: { role: "student" }, // Filtre uniquement les élèves
          orderBy: [
            { lastName: "asc" },
            { firstName: "asc" },
          ],
          select: {
            id: true,
            firstName: true,
            lastName: true,
            o365AvatarB64: true, // Avatar O365
            edPhotoB64: true, // Photo EcoleDirecte
          },
        },
      },
    });

    // Retourne la classe avec ses élèves
    return res.json(myClass);
  } catch (err) {
    // En cas d'erreur, log et retourne une erreur 500
    log_technical(TECHNICAL_LEVELS.ERROR, "Class fetch failed", { error: err, userId: req.session?.user?.id });
    return res.status(500).json({
      error: "CLASS_FETCH_FAILED",
      message: "Erreur lors du chargement de la classe.",
    });
  }
});

// Exporte le routeur
module.exports = router;
