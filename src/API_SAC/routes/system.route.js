// ./API_SAC/routes/system.route.js
// Route système simple pour vérifier que l'API est en ligne (health check).

// Importe Express pour créer le routeur
const express = require("express");
// Crée un nouveau routeur Express
const router = express.Router();

// Route GET /test : point de vérification de l'état de l'API (aucune authentification requise)
router.get("/test", (req, res) => {
  // Retourne un message JSON simple confirmant que l'API fonctionne
  res.json({ message: "API is running" });
});

// Exporte le routeur
module.exports = router;