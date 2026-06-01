// ./API_SAC/routes/admin.route.js
// Routes d'administration : CRUD complet pour les utilisateurs, sessions de cours, présences, salles, classes.
// Toutes les routes nécessitent le rôle ADMIN.

// Charge les variables d'environnement
require("../commons/env.common");
// Importe Express pour créer le routeur
const express = require("express");
// Importe le client Prisma pour les requêtes en base de données
const { prisma } = require("../commons/prisma.common");
// Importe le middleware de contrôle d'accès par rôle
const require_access = require("../middlewares/require_access.middleware");
// Importe les constantes de rôles
const { ROLES } = require("../commons/constants.common");
// Importe le système de logging métier et la fonction de purge
const { LOG_DESTINATIONS, log_business, purge_business_logs } = require("../commons/logger.common");
// Crée un nouveau routeur Express
const router = express.Router();
// Liste des rôles utilisateurs valides (pour la validation)
const USER_ROLES = ["student", "teacher", "staff", "admin"];
// Liste des statuts de session valides
const SESSION_STATUSES = ["scheduled", "ongoing", "completed", "cancelled"];
// Liste des statuts de présence valides
const ATTENDANCE_STATUSES = ["present", "absent"];
// Sélection des champs utilisateur retournés par les requêtes (évite d'exposer des données sensibles)
const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  role: true,
  o365Email: true,
  edEmail: true,
  edId: true,
  classId: true,
  o365AvatarB64: true,
  edPhotoUrl: true,
  edPhotoB64: true,
};
// Sélection des champs session retournés par les requêtes
const sessionSelect = {
  id: true,
  label: true,
  matiere: true,
  codeMatiere: true,
  color: true,
  status: true,
  classId: true,
  roomId: true,
  teacherId: true,
  startTime: true,
  endTime: true,
};

// Fonction utilitaire : parse une valeur en entier positif, retourne null si invalide
function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

// Fonction utilitaire : retourne une chaîne nettoyée et tronquée, ou null si vide
function stringOrNull(value, maxLength = 120) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

// Valide et parse les données du corps d'une requête de création/modification de session
function parseSessionPayload(body) {
  // Parse les ID obligatoires (classe, salle, enseignant)
  const classId = parsePositiveInt(body.classId);
  const roomId = parsePositiveInt(body.roomId);
  const teacherId = parsePositiveInt(body.teacherId);
  // Parse les dates de début et fin
  const startTime = new Date(body.startTime);
  const endTime = new Date(body.endTime);
  // Statut par défaut : "scheduled" (programmé)
  const status = body.status || "scheduled";

  // Vérifie que tous les champs obligatoires sont valides
  if (!classId || !roomId || !teacherId || Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    return { error: "Champs session invalides." };
  }

  // Vérifie que la fin du cours est après le début
  if (endTime <= startTime) {
    return { error: "La fin du cours doit etre apres le debut." };
  }

  // Vérifie que le statut est valide
  if (!SESSION_STATUSES.includes(status)) {
    return { error: "Statut de session invalide." };
  }

  // Retourne les données validées
  return {
    data: {
      label: stringOrNull(body.label), // Libellé du cours (optionnel)
      matiere: stringOrNull(body.matiere), // Nom de la matière (optionnel)
      codeMatiere: stringOrNull(body.codeMatiere, 40), // Code de la matière (optionnel)
      color: stringOrNull(body.color, 40), // Couleur d'affichage (optionnel)
      status, // Statut de la session
      classId, // ID de la classe
      roomId, // ID de la salle
      teacherId, // ID de l'enseignant
      startTime, // Date/heure de début
      endTime, // Date/heure de fin
    },
  };
}

// Applique le middleware d'accès à TOUTES les routes de ce routeur : rôle ADMIN minimum requis
router.use(require_access({ minRole: ROLES.ADMIN }));

// ═══════════════════════════════════════════════════════════════
// GESTION DES UTILISATEURS
// ═══════════════════════════════════════════════════════════════

// Route GET /users : récupère la liste de tous les utilisateurs (avec filtre optionnel par rôle)
router.get("/users", async (req, res) => {
  const { role } = req.query;
  // Vérifie que le rôle demandé (s'il est fourni) est valide
  if (role && !USER_ROLES.includes(role)) {
    return res.status(400).json({ error: "Role invalide" });
  }

  // Récupère les utilisateurs (filtrés par rôle si fourni) triés par nom
  const users = await prisma.user.findMany({
    where: role ? { role } : {},
    select: userSelect,
    orderBy: [
      { lastName: "asc" },
      { firstName: "asc" },
    ],
  });

  res.json(users);
});

// Route PATCH /users/:userId/role : modifie le rôle d'un utilisateur
router.patch("/users/:userId/role", async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;
  const parsedUserId = parsePositiveInt(userId);

  // Vérifie que l'ID utilisateur et le rôle sont valides
  if (!parsedUserId || !USER_ROLES.includes(role)) {
    return res.status(400).json({ error: "Utilisateur ou role invalide" });
  }

  // Met à jour le rôle en base de données
  const user = await prisma.user.update({
    where: { id: parsedUserId },
    data: { role },
    select: userSelect,
  });

  // Log métier : enregistre la modification de rôle
  await log_business("admin_user_role_updated", "Un admin a modifié le rôle d'un utilisateur.", {
    req,
    destination: LOG_DESTINATIONS.BOTH,
    entityType: "User",
    entityId: parsedUserId,
    metadata: { role },
  });

  res.json(user);
});

// Route POST /users/:userId/force-logout : force la déconnexion d'un utilisateur
// Supprime toutes les sessions de navigateur de cet utilisateur
router.post("/users/:userId/force-logout", async (req, res) => {
  const { userId } = req.params;
  const parsedUserId = parsePositiveInt(userId);

  if (!parsedUserId) {
    return res.status(400).json({ error: "Utilisateur invalide" });
  }

  // Vérifie que l'utilisateur existe
  const user = await prisma.user.findUnique({
    where: { id: parsedUserId },
    select: { id: true, firstName: true, lastName: true },
  });

  if (!user) {
    return res.status(404).json({ error: "Utilisateur non trouvé" });
  }

  // Supprime toutes les sessions de navigateur dont les données contiennent l'ID de cet utilisateur
  const deletedSessions = await prisma.browserSession.deleteMany({
    where: {
      data: {
        path: ["user", "id"], // Chemin JSON vers l'ID utilisateur dans les données de session
        equals: parsedUserId,
      },
    },
  });

  // Log métier : enregistre la déconnexion forcée
  await log_business("admin_user_force_logout", "Un admin a forcé la déconnexion d'un utilisateur.", {
    req,
    destination: LOG_DESTINATIONS.BOTH,
    entityType: "User",
    entityId: parsedUserId,
    metadata: {
      deletedSessionCount: deletedSessions.count,
    },
  });

  res.json({ message: "Utilisateur déconnecté", deletedSessionCount: deletedSessions.count });
});

// Route DELETE /users/:userId : supprime un utilisateur et toutes ses données associées
router.delete("/users/:userId", async (req, res) => {
  const { userId } = req.params;
  const parsedUserId = parsePositiveInt(userId);

  if (!parsedUserId) {
    return res.status(400).json({ error: "Utilisateur invalide" });
  }

  // Vérifie que l'utilisateur existe
  const user = await prisma.user.findUnique({
    where: { id: parsedUserId },
    select: { id: true, firstName: true, lastName: true, role: true },
  });

  if (!user) {
    return res.status(404).json({ error: "Utilisateur non trouvé" });
  }

  // Empêche la suppression du dernier administrateur (pour éviter de bloquer l'accès à l'application)
  if (user.role === "admin") {
    const adminCount = await prisma.user.count({
      where: { role: "admin" },
    });
    if (adminCount <= 1) {
      return res.status(400).json({ error: "Impossible de supprimer le dernier administrateur" });
    }
  }

  // Supprime toutes les données associées dans l'ordre correct (respect des contraintes de clés étrangères)
  // 1. Supprime les enregistrements de présence
  await prisma.attendanceRecord.deleteMany({
    where: { userId: parsedUserId },
  });

  // 2. Supprime les scans NFC
  await prisma.nfcScan.deleteMany({
    where: { userId: parsedUserId },
  });

  // 3. Supprime les sessions de navigateur
  await prisma.browserSession.deleteMany({
    where: {
      data: {
        path: ["user", "id"],
        equals: parsedUserId,
      },
    },
  });

  // 4. Supprime l'utilisateur lui-même
  const deletedUser = await prisma.user.delete({
    where: { id: parsedUserId },
    select: userSelect,
  });

  // Log métier : enregistre la suppression
  await log_business("admin_user_deleted", "Un admin a supprimé un compte utilisateur.", {
    req,
    destination: LOG_DESTINATIONS.BOTH,
    entityType: "User",
    entityId: parsedUserId,
    metadata: {
      deletedUser: {
        id: deletedUser.id,
        firstName: deletedUser.firstName,
        lastName: deletedUser.lastName,
        role: deletedUser.role,
      },
    },
  });

  res.json({ message: "Utilisateur supprimé", deletedUser });
});

// ═══════════════════════════════════════════════════════════════
// GESTION DES SALLES
// ═══════════════════════════════════════════════════════════════

// Route GET /rooms : récupère la liste de toutes les salles
router.get("/rooms", async (req, res) => {
  const rooms = await prisma.room.findMany({
    orderBy: [
      { name: "asc" },
      { code: "asc" },
    ],
    select: {
      id: true,
      code: true, // Code de la salle (ex: "S201")
      name: true, // Nom complet de la salle
      nfcUid: true, // UID du badge NFC de la salle
    },
  });

  res.json(rooms);
});

// ═══════════════════════════════════════════════════════════════
// GESTION DES CLASSES
// ═══════════════════════════════════════════════════════════════

// Route GET /classes : récupère la liste de toutes les classes
router.get("/classes", async (req, res) => {
  const classes = await prisma.class.findMany({
    orderBy: [
      { name: "asc" },
      { code: "asc" },
    ],
    select: {
      id: true,
      code: true, // Code de la classe (ex: "3A")
      name: true, // Nom complet
    },
  });

  res.json(classes);
});

// ═══════════════════════════════════════════════════════════════
// GESTION DES ENSEIGNANTS
// ═══════════════════════════════════════════════════════════════

// Route GET /teachers : récupère la liste de tous les enseignants
router.get("/teachers", async (req, res) => {
  const teachers = await prisma.user.findMany({
    where: { role: "teacher" }, // Filtre uniquement les enseignants
    orderBy: [
      { lastName: "asc" },
      { firstName: "asc" },
    ],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      o365Email: true,
      edEmail: true,
    },
  });

  res.json(teachers);
});

// ═══════════════════════════════════════════════════════════════
// CRUD SESSIONS DE COURS
// ═══════════════════════════════════════════════════════════════

// Route POST /sessions : crée une nouvelle session de cours
router.post("/sessions", async (req, res) => {
  // Valide et parse les données du corps de la requête
  const parsed = parseSessionPayload(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  // Crée la session en base de données
  const session = await prisma.courseSession.create({
    data: parsed.data,
    select: sessionSelect,
  });

  // Log métier : enregistre la création
  await log_business("admin_course_session_created", "Un admin a créé un cours.", {
    req,
    destination: LOG_DESTINATIONS.BOTH,
    entityType: "CourseSession",
    entityId: session.id,
    metadata: parsed.data,
  });

  res.json(session);
});

// Route PATCH /sessions/:id : modifie une session de cours existante
router.patch("/sessions/:id", async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  const parsed = parseSessionPayload(req.body);
  if (!id) return res.status(400).json({ error: "Session invalide" });
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  // Met à jour la session en base de données
  const session = await prisma.courseSession.update({
    where: { id },
    data: parsed.data,
    select: sessionSelect,
  });

  // Log métier : enregistre la modification
  await log_business("admin_course_session_updated", "Un admin a modifié un cours.", {
    req,
    destination: LOG_DESTINATIONS.BOTH,
    entityType: "CourseSession",
    entityId: id,
    metadata: parsed.data,
  });

  res.json(session);
});

// Route DELETE /sessions/:id : supprime une session de cours
router.delete("/sessions/:id", async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "Session invalide" });

  // Supprime la session (les enregistrements de présence sont supprimés en cascade grâce au schema Prisma)
  await prisma.courseSession.delete({
    where: { id }
  });

  // Log métier : enregistre la suppression
  await log_business("admin_course_session_deleted", "Un admin a supprimé un cours.", {
    req,
    destination: LOG_DESTINATIONS.BOTH,
    entityType: "CourseSession",
    entityId: id,
  });

  res.json({ message: "Session supprimée" });
});

// ═══════════════════════════════════════════════════════════════
// CORRECTION DE PRÉSENCES
// ═══════════════════════════════════════════════════════════════

// Route POST /attendance/override : corrige manuellement la présence d'un élève
router.post("/attendance/override", async (req, res) => {
  const { sessionId, studentId, status } = req.body;
  const parsedSessionId = parseInt(sessionId, 10);
  const parsedUserId = parseInt(studentId, 10);

  // Vérifie que les IDs sont valides
  if (!Number.isInteger(parsedSessionId) || !Number.isInteger(parsedUserId)) {
    return res.status(400).json({ error: "Session ou utilisateur invalide" });
  }

  // Vérifie que le statut est valide (present ou absent)
  if (!ATTENDANCE_STATUSES.includes(status)) {
    return res.status(400).json({ error: "Statut invalide" });
  }

  // Crée ou met à jour l'enregistrement de présence (upsert)
  await prisma.attendanceRecord.upsert({
    where: {
      sessionId_userId: { sessionId: parsedSessionId, userId: parsedUserId }
    },
    update: { status }, // Met à jour le statut si l'enregistrement existe
    create: { sessionId: parsedSessionId, userId: parsedUserId, status } // Crée l'enregistrement s'il n'existe pas
  });

  // Log métier : enregistre la correction
  await log_business("admin_attendance_overridden", "Un admin a corrigé une présence.", {
    req,
    destination: LOG_DESTINATIONS.BOTH,
    entityType: "AttendanceRecord",
    entityId: `${parsedSessionId}:${parsedUserId}`,
    metadata: { sessionId: parsedSessionId, userId: parsedUserId, status },
  });

  res.json({ message: "Présence corrigée" });
});

// Route POST /attendance/reset/:sessionId : réinitialise toutes les présences d'une session
router.post("/attendance/reset/:sessionId", async (req, res) => {
  const sessionId = parsePositiveInt(req.params.sessionId);
  if (!sessionId) return res.status(400).json({ error: "Session invalide" });

  // Supprime tous les enregistrements de présence de cette session
  await prisma.attendanceRecord.deleteMany({
    where: { sessionId }
  });

  // Log métier : enregistre la réinitialisation
  await log_business("admin_attendance_reset", "Un admin a réinitialisé les présences d'un cours.", {
    req,
    destination: LOG_DESTINATIONS.BOTH,
    entityType: "CourseSession",
    entityId: sessionId,
  });

  res.json({ message: "Session reset" });
});

// ═══════════════════════════════════════════════════════════════
// CONSULTATION DES LOGS NFC
// ═══════════════════════════════════════════════════════════════

// Route GET /nfc/logs : récupère les 100 derniers scans NFC
router.get("/nfc/logs", async (req, res) => {
  const logs = await prisma.nfcScan.findMany({
    orderBy: { scannedAt: "desc" }, // Les plus récents d'abord
    take: 100, // Limite à 100 résultats
    select: {
      id: true,
      nfcUid: true, // UID du badge NFC scanné
      roomId: true, // ID de la salle associée
      userId: true, // ID de l'utilisateur qui a scanné
      sessionId: true, // ID de la session associée
      eventType: true, // Type d'événement (room_scan, system_event)
      comment: true, // Commentaire optionnel
      scannedAt: true, // Date/heure du scan
      ipAddress: true, // IP du client
      deviceFingerprint: true, // Empreinte de l'appareil
    },
  });

  res.json(logs);
});

// ═══════════════════════════════════════════════════════════════
// CONSULTATION ET PURGE DES LOGS MÉTIER
// ═══════════════════════════════════════════════════════════════

// Route GET /business/logs : récupère les logs métier avec filtrage
router.get("/business/logs", async (req, res) => {
  // Nombre maximum de logs (par défaut 100, maximum 500)
  const take = Math.min(parsePositiveInt(req.query.take) || 100, 500);
  // Filtres optionnels
  const userId = parsePositiveInt(req.query.userId);
  const event = stringOrNull(req.query.event, 160);
  const entityType = stringOrNull(req.query.entityType, 80);

  // Construit l'objet de filtrage dynamiquement
  const where = {};
  if (userId) where.userId = userId;
  if (event) where.event = event;
  if (entityType) where.entityType = entityType;

  // Récupère les logs avec les informations utilisateur associées
  const logs = await prisma.businessLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
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

  res.json(logs);
});

// Route POST /business/logs/purge : supprime les anciens logs métier
router.post("/business/logs/purge", async (req, res) => {
  // Nombre de jours de rétention (optionnel, sinon utilise la valeur de la variable d'environnement)
  const retentionDays = parsePositiveInt(req.body?.retentionDays);
  // Exécute la purge
  const result = await purge_business_logs(retentionDays ? { retentionDays } : {});

  // Log métier : enregistre la purge
  await log_business("admin_business_logs_purged", "Un admin a purge les logs metier.", {
    req,
    destination: LOG_DESTINATIONS.BOTH,
    entityType: "BusinessLog",
    metadata: {
      retentionDays: retentionDays || Number.parseInt(process.env.BUSINESS_LOG_RETENTION_DAYS || "30", 10),
      deletedCount: result.count,
    },
  });

  res.json({ deletedCount: result.count });
});

// Exporte le routeur
module.exports = router;
