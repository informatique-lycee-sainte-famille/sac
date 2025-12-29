// src/API_SAC/workflows/enseignantScan.js
const { getDataByType } = require('../../scripts/get_data.js');

async function enseignantScan(req, res) {
    const coursProfName = req.session.edProfile ? req.session.edProfile.ED.nom + " " + req.session.edProfile.ED.prenom.slice(0, 1) + "." : null;
    const nfc_token = req.body.nfc_token;
    console.log(`User's coursProfName: ${coursProfName} and NFC token: ${nfc_token}`);
    if(!coursProfName) {
        return res.status(400).json({ error: "User's coursProfName not found" });
    }
    //   get current cours for this classeId and current time
    //   get current cours for this classeId and current time
    const currentTime = new Date();
    const cours = await getDataByType('EDT_SALLE', { salle: nfc_token, date: "today" });
    //   filter cours to keep only those matching current time
    const ongoingCours = cours.filter(c => {
    const start_date = new Date(c.start_date);
    const end_date = new Date(c.end_date);
    return currentTime >= start_date && currentTime <= end_date;
    });
    const coursProfNamesInOngoingCours = ongoingCours.map(c => c.prof).filter(name => name);
    if (!coursProfNamesInOngoingCours.includes(coursProfName)) {
        return res.status(403).json({ error: "Teacher not assigned to the current course in this room" });
    }
    const isTheRightProfessor = coursProfNamesInOngoingCours.includes(coursProfName);
    if (!isTheRightProfessor) {
        return res.status(403).json({ error: "Teacher not assigned to the current course in this room" });
    }else {
        console.log(`Ongoing cours for teacher ${coursProfName} at ${currentTime}:`, ongoingCours);
    }
    return res.status(200).json({ message: `NFC token ${nfc_token} received for teacher ${coursProfName}` });
}

module.exports = { enseignantScan };