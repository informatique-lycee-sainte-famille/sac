// src/API_SAC/routes/nfc.js
const express = require("express");
const { prisma } = require("../commons/prisma");
const { eleveScan } = require("../workflows/eleveScan.js");
const { enseignantScan } = require("../workflows/enseignantScan.js");

const router = express.Router();

router.post("/scan", async (req, res) => {
  try {
    const { nfcUid } = req.body;

    if (!nfcUid) {
      return res.status(400).json({ error: "nfcUid manquant" });
    }

    const user = req.session.userInfo;
    const userId = req.session.userId || null;
    const userType = user?.jobTitle?.toLowerCase();

    console.log(`📡 Scan NFC reçu: ${nfcUid}`);

    // 🔍 1. Trouver la salle associée au NFC
    const room = await prisma.room.findUnique({
      where: { nfcUid: nfcUid },
    });

    if (!room) {
      console.warn("❌ Salle inconnue pour ce NFC");
      return res.status(404).json({ error: "Salle inconnue" });
    }

    console.log(`🏫 Salle détectée: ${room.code}`);

    // 📝 2. Log du scan NFC
    await prisma.nfcScan.create({
      data: {
        nfcUid: nfcUid,
        userId: userId,
        ipAddress: req.ip,
        UserAgent: req.headers["user-agent"],
        DeviceId: req.headers["x-device-id"] || null
      }
    });

    // 🎯 3. Logique métier selon rôle
    switch (userType) {
      case "eleve":
        console.log("👨‍🎓 Traitement élève");

        const eleveResponse = await eleveScan(req, res, { room });

        return res
          .status(eleveResponse.status)
          .json({ message: eleveResponse.text });

      case "personnel":
        console.log("🧑‍💼 Traitement staff");

        // Exemple : juste confirmer scan
        return res.json({
          message: "Scan staff enregistré",
          room: room.code
        });

      case "enseignant":
      case "formateur":
        console.log("👨‍🏫 Traitement enseignant");

        const teacherResponse = await enseignantScan(req, res, { room });

        return res.json({
          message: "Scan enseignant OK",
          room: room.code
        });

      default:
        console.warn("❌ Type utilisateur inconnu");

        return res.status(403).json({
          error: "Type utilisateur non autorisé"
        });
    }

  } catch (err) {
    console.error("💥 Erreur NFC:", err);

    return res.status(500).json({
      error: "Erreur serveur NFC"
    });
  }
});

module.exports = router;