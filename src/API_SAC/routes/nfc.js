// src/routes/test.js
const express = require("express");
const { getDataByType } = require('../../scripts/get_data.js');
const router = express.Router();

router.post("/scan", async (req, res) => {
  const { nfc_token } = req.body;
  // Here you can add logic to handle the NFC token, e.g., save it to a database or process it
  console.log(`Received NFC token: ${nfc_token} from user: ${req.session.edProfile ? req.session.edProfile.ED.nom : 'unknown'}`);
  const classeId = req.session.edProfile ? req.session.edProfile.ED.classeId : null;
  console.log(`User's classeId: ${classeId}`);
  if(!classeId) {
    return res.status(400).json({ error: "User's classeId not found" });
  }
  //   get current cours for this classeId and current time
  const currentTime = new Date();
  const cours = await getDataByType('EDT', { classe: classeId, date: "today" });
//   filter cours to keep only those matching current time
  const ongoingCours = cours.filter(c => {
    const start_date = new Date(c.start_date);
    const end_date = new Date(c.end_date);
    return currentTime >= start_date && currentTime <= end_date;
  });
  const salleId = await getDataByType('SALLES', { salle: ongoingCours[0].salle.toLowerCase() }).then(salle => {
    return salle.length > 0 ? salle[0].id : null;
  });
  console.log(`Ongoing cours salleId: ${salleId}`);
  console.log(`Ongoing cours for classeId ${classeId} at ${currentTime}:`, ongoingCours);
  res.json({ message: "NFC token received", nfc_token });
});
module.exports = router;
