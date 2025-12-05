// src/routes/test.js
const express = require("express");
const { eleveScan } = require('../workflows/eleveScan.js');
const router = express.Router();

router.post("/scan", async (req, res) => {
  const { nfc_token } = req.body;
  const userType = req.session.userInfo.jobTitle.toLowerCase();
  switch (userType) {
    case "eleve":
      // Handle student NFC token
      console.log("Processing NFC token for student");
      const salleId = await eleveScan(req, res);
      console.log(`Salle ID for student: ${salleId}`);
      break;
    case "personnel":
      // Handle staff NFC token
      console.log("Processing NFC token for staff");
      break;
    case "enseignant":
      // Handle teacher NFC token
      console.log("Processing NFC token for teacher");
      const teacherSalleId = await enseignantScan(req, res);
      console.log(`Salle ID for teacher: ${teacherSalleId}`);
      break;
    default:
      break;
  }
  // Here you can add logic to handle the NFC token, e.g., save it to a database or process it
  console.log(`Received NFC token: ${nfc_token} from user: ${req.session.edProfile ? req.session.edProfile.ED.nom : 'unknown'}`);
  // res.json({ message: "NFC token received", nfc_token });
});
module.exports = router;
