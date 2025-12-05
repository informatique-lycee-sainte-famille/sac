const { getDataByType } = require('../../scripts/get_data.js');

async function eleveScan(req, res) {
    const classeId = req.session.edProfile ? req.session.edProfile.ED.classeId : null;
    const nfc_token = req.body.nfc_token;
    console.log(`User's classeId: ${classeId} and NFC token: ${nfc_token}`);
    if(!classeId) {
        return res.status(400).json({ error: "User's classeId not found" });
    }
    //   get current cours for this classeId and current time
    const currentTime = new Date();
    const cours = await getDataByType('EDT_SALLE', { salle: nfc_token, date: "today" });
    //   filter cours to keep only those matching current time
    const ongoingCours = cours.filter(c => {
        const start_date = new Date(c.start_date);
        const end_date = new Date(c.end_date);
        return currentTime >= start_date && currentTime <= end_date;
    });
    const salleId = nfc_token;
    console.log(`Ongoing cours salleId: ${salleId}`);
    console.log(`Ongoing cours for classeId ${classeId} at ${currentTime}:`, ongoingCours);
    if(ongoingCours.length === 0) {
        return res.status(403).json({ error: "No ongoing course found in this room for the student's class" });
    }else{
        if(!ongoingCours.some(c => c.classeId === classeId)) {
            return res.status(403).json({ error: "No ongoing course found in this room for the student's class" });
        }else{
            console.log(`Student's class is assigned to an ongoing course in this room.`);
        }
    }
    return res.status(200).json({ coursId: ongoingCours[0].id, salleId: salleId });
}

module.exports = { eleveScan };