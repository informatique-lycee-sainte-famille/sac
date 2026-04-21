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

    const user = req.session?.user;
    const userId = user?.id || null;
    const role = user?.role?.toUpperCase();

    console.log(
      `👤 NFC User: ${user?.firstName || "Unknown"} (ID: ${userId}) Role: ${role}`
    );

    console.log(`📡 Scan NFC reçu: ${nfcUid}`);

    if (!userId || !role) {
      return res.status(401).json({ error: "Utilisateur non authentifié" });
    }

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
        DeviceId: req.headers["x-device-id"] || null,
      },
    });

    // 🎯 3. Logique métier selon rôle
    switch (role) {
      case "STUDENT":
        console.log("👨‍🎓 Traitement élève");

        const eleveResponse = await eleveScan(req, res, { room });

        return res
          .status(eleveResponse.status)
          .json({ message: eleveResponse.text });

      case "TEACHER":
        console.log("👨‍🏫 Traitement enseignant");

        const enseignantResponse = await enseignantScan(nfcUid, user);

        if (enseignantResponse.error) {
          return res.status(403).json({ error: enseignantResponse.error });
        }

        return res.json({
          message: "Scan enseignant OK",
          room: room.code,
        });

      case "STAFF":
      case "ADMIN":
        console.log("🧑‍💼 Traitement staff");

        return res.json({
          message: "Scan staff enregistré",
          room: room.code,
        });

      default:
        console.warn(`❌ Rôle inconnu: ${role}`);

        return res.status(403).json({
          error: "Rôle non autorisé",
        });
    }

  } catch (err) {
    console.error("💥 Erreur NFC:", err);

    return res.status(500).json({
      error: "Erreur serveur NFC",
    });
  }
});

module.exports = router;