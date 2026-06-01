// ./API_SAC/routes/attendance.route.js
// Routes pour la gestion des feuilles d'émargement (PDF de présences).

// Importe Express pour créer le routeur
const express = require("express");
// Importe le client Prisma pour les requêtes en base de données
const { prisma } = require("../commons/prisma.common");
// Importe le middleware de contrôle d'accès par rôle
const require_access = require("../middlewares/require_access.middleware");
// Importe les constantes de rôles (STUDENT, TEACHER, STAFF, ADMIN)
const { ROLES } = require("../commons/constants.common");
// Importe la fonction de génération de PDF journalier depuis le workflow de finalisation
const { generate_class_day_pdf } = require("../workflows/finalize_course_session.workflow");
// Importe le système de logging (métier + technique)
const { LOG_DESTINATIONS, TECHNICAL_LEVELS, log_business, log_technical } = require("../commons/logger.common");
// Crée un nouveau routeur Express
const router = express.Router();

// Route GET /pdf/day : génère un PDF d'émargement journalier pour une classe donnée
// Accessible uniquement aux enseignants et rôles supérieurs (TEACHER, STAFF, ADMIN)
router.get("/pdf/day", require_access({ minRole: ROLES.TEACHER }), async (req, res) => {
  try {
    // Récupère l'ID de la classe depuis les paramètres de requête
    const classId = req.query.classId;
    // Récupère la date demandée (par défaut : aujourd'hui au format YYYY-MM-DD)
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    // Vérifie que l'ID de classe est fourni
    if (!classId) {
      return res.status(400).json({ error: "classId manquant" });
    }
    // Vérifie que la classe existe en base de données
    const classInfo = await prisma.class.findUnique({ where: { id: parseInt(classId) } });
    if (!classInfo) {
      return res.status(404).json({ error: "Classe non trouvée" });
    }

    // Construit le nom de l'auteur du PDF à partir des informations de session
    const author = `${req.session.user.firstName || ""} ${req.session.user.lastName || ""}`.trim() || "SAC";
    // Génère le PDF journalier contenant toutes les sessions de la classe pour cette date
    const { sessions, pdfBuffer } = await generate_class_day_pdf({ classId, date, author });

    // Si aucune session n'existe pour cette date, retourne une erreur 404
    if (!sessions.length) {
      return res.status(404).json({ error: "Aucune session trouvée pour cette classe et cette date" });
    }

    // Construit le nom du fichier PDF (ex: "3A_2025-01-15_emargements.pdf")
    const filename = `${classInfo.code}_${date}_emargements.pdf`;
    // Log métier : enregistre la génération du PDF
    await log_business("daily_attendance_pdf_generated", "PDF journalier d'emargement genere manuellement.", {
      destination: LOG_DESTINATIONS.BOTH,
      req,
      entityType: "Class",
      entityId: classInfo.id,
      metadata: { filename, date, sessionsCount: sessions.length },
    });

    // Définit les en-têtes HTTP pour le téléchargement/affichage du PDF
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=${filename}`);
    // Envoie le buffer PDF au client
    return res.send(pdfBuffer);
  } catch (err) {
    // En cas d'erreur, log l'erreur technique et retourne une erreur 500
    log_technical(TECHNICAL_LEVELS.ERROR, "Daily attendance PDF generation failed", {
      error: err,
      classId: req.query.classId,
      date: req.query.date,
      userId: req.session?.user?.id,
    });
    return res.status(500).json({ error: "Erreur generation PDF journalier" });
  }
});


// Exporte le routeur
module.exports = router;
