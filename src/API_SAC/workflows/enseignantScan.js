// src/API_SAC/workflows/enseignantScan.js
const { getDataByType } = require('../../scripts/get_data.js');

async function enseignantScan(nfcUid, user) {
    const coursProfName = user.edProfile ? user.edProfile.ED.nom + " " + user.edProfile.ED.prenom.slice(0, 1) + "." : null;
    nfcUid = nfcUid.replace("ROOM_", ""); // Assuming NFC UIDs are stored without the "ROOM_" prefix
    console.log(`User's coursProfName: ${coursProfName} and NFC uid: ${nfcUid}`);
    if(!coursProfName) {
        return { error: "User's coursProfName not found" };
    }
    //   get current cours for this classeId and current time
    const currentTime = new Date();
    const cours = await getDataByType('EDT_SALLE', { salle: nfcUid, date: "today" });
    //   filter cours to keep only those matching current time
    const ongoingCours = cours.filter(c => {
    const start_date = new Date(c.start_date);
    const end_date = new Date(c.end_date);
    return currentTime >= start_date && currentTime <= end_date;
    });
    const coursProfNamesInOngoingCours = ongoingCours.map(c => c.prof).filter(name => name);
    if (!coursProfNamesInOngoingCours.includes(coursProfName)) {
        return { error: "Teacher not assigned to the current course in this room" };
    }
    const isTheRightProfessor = coursProfNamesInOngoingCours.includes(coursProfName);
    if (!isTheRightProfessor) {
        return { error: "Teacher not assigned to the current course in this room" };
    }else {
        console.log(`Ongoing cours for teacher ${coursProfName} at ${currentTime}:`, ongoingCours);
    }
    return { message: `NFC uid ${nfcUid} received for teacher ${coursProfName}` };
}

module.exports = { enseignantScan };