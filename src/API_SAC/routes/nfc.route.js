// ./API_SAC/routes/nfc.route.js
// Routes pour le scan NFC : permet aux utilisateurs de badger (scan NFC) pour
// enregistrer leur présence et aux enseignants de finaliser l'appel.

// Importe Express pour créer le routeur
const express = require("express");
// Importe le middleware de contrôle d'accès par rôle
const require_access = require("../middlewares/require_access.middleware");
// Importe les constantes de rôles
const { ROLES } = require("../commons/constants.common");
// Importe le système de logging technique
const { TECHNICAL_LEVELS, log_technical } = require("../commons/logger.common");
// Importe le workflow de traitement d'un scan NFC (démarrage/présence)
const { process_nfc_scan } = require("../workflows/start_course_session.workflow");
// Importe les workflows de finalisation d'une session via NFC
const {
  prepare_finalize_from_nfc,
  finalize_session,
} = require("../workflows/finalize_course_session.workflow");

// Crée un nouveau routeur Express
const router = express.Router();

// Route POST /scan/prepare : prépare un scan NFC sans l'enregistrer (mode "dry run")
// Retourne ce qui se passerait si l'utilisateur scannait (aperçu de la session, etc.)
// Accessible aux élèves et rôles supérieurs
router.post("/scan/prepare", require_access({ minRole: ROLES.STUDENT }), async (req, res) => {
  try {
    // Exécute le workflow de scan NFC en mode dry run (aucune donnée n'est enregistrée)
    const result = await process_nfc_scan(req, { dryRun: true });
    // Retourne le résultat avec le code HTTP approprié
    return res.status(result.status).json(result.body);
  } catch (err) {
    // Log l'erreur technique et retourne une erreur 500
    log_technical(TECHNICAL_LEVELS.ERROR, "NFC prepare failed", { error: err, userId: req.session?.user?.id });

    return res.status(500).json({
      error: "Erreur serveur NFC",
    });
  }
});

// Route POST /scan/finalize/prepare : prépare la finalisation d'un appel via NFC (aperçu)
// L'enseignant scanne le badge NFC pour prévisualiser l'envoi de l'appel à EcoleDirecte
// Accessible aux enseignants et rôles supérieurs
router.post("/scan/finalize/prepare", require_access({ minRole: ROLES.TEACHER }), async (req, res) => {
  try {
    // Exécute le workflow de préparation de finalisation
    const result = await prepare_finalize_from_nfc(req);
    // Retourne le résultat avec le code HTTP approprié
    return res.status(result.status).json(result.body);
  } catch (err) {
    // Log l'erreur technique et retourne une erreur 500
    log_technical(TECHNICAL_LEVELS.ERROR, "NFC finalize prepare failed", { error: err, userId: req.session?.user?.id });

    return res.status(500).json({
      error: "Erreur serveur NFC",
    });
  }
});

// Route POST /scan/finalize : finalise l'appel d'une session (envoi à EcoleDirecte + PDF)
// L'enseignant confirme l'envoi de l'appel après la prévisualisation
// Accessible aux enseignants et rôles supérieurs
router.post("/scan/finalize", require_access({ minRole: ROLES.TEACHER }), async (req, res) => {
  try {
    // Exécute le workflow de finalisation (envoi de l'appel à EcoleDirecte, génération du PDF, email)
    const result = await finalize_session(req);
    // Retourne le résultat avec le code HTTP approprié
    return res.status(result.status).json(result.body);
  } catch (err) {
    // Log l'erreur technique et retourne une erreur 500
    log_technical(TECHNICAL_LEVELS.ERROR, "NFC finalize failed", { error: err, userId: req.session?.user?.id });

    return res.status(500).json({
      error: "Erreur serveur NFC",
    });
  }
});

// Route POST /scan : enregistre un scan NFC réel (marque la présence de l'utilisateur)
// L'utilisateur scanne le badge NFC de la salle pour s'enregistrer comme présent
// Accessible aux élèves et rôles supérieurs
router.post("/scan", require_access({ minRole: ROLES.STUDENT }), async (req, res) => {
  try {
    // Exécute le workflow de scan NFC (enregistre la présence en base de données)
    const result = await process_nfc_scan(req);
    // Retourne le résultat avec le code HTTP approprié
    return res.status(result.status).json(result.body);
  } catch (err) {
    // Log l'erreur technique et retourne une erreur 500
    log_technical(TECHNICAL_LEVELS.ERROR, "NFC scan failed", { error: err, userId: req.session?.user?.id });

    return res.status(500).json({
      error: "Erreur serveur NFC",
    });
  }
});

// Exporte le routeur
module.exports = router;
