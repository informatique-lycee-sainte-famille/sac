// src/API_SAC/workflows/eleveScan.js
const { getDataByType } = require('../../scripts/get_data.js');

async function eleveScan(req, res) {
    const classeId = req.session.edProfile ? req.session.edProfile.ED.classeId : null;
    const nfc_token = req.body.nfc_token;
    const response = {};
    console.log(`User's classeId: ${classeId} and NFC token: ${nfc_token}`);
    if(!classeId) {
        response.status = 400;
        response.text = "User's classeId not found";
        return response;
    }
    //   get current cours for this classeId and current time
    // const currentTime = new Date();
    // fake current time for testing is 22/12/2025 10:30
    const currentTime = new Date('2025-12-22T10:30:00');
    const cours = await getDataByType('EDT_SALLE', { salle: nfc_token, date: currentTime.toISOString().split('T')[0] });
    console.log(`Fetched cours for salle ${nfc_token} on ${currentTime.toISOString().split('T')[0]}:`, cours);
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
        response.status = 403;
        response.text = "No ongoing course found in this room for the student's class2";
        return response;
    }else{
        if(!ongoingCours.some(c => c.classeId === classeId)) {
            response.status = 403;
            response.text = "No ongoing course found in this room for the student's class1";
            return response;
        }else{
            console.log(`Student's class is assigned to an ongoing course in this room.`);
            response.status = 200;
            response.text = "Ongoing course found for the student's class";
            return response;
        }
    }
    console.log(`NFC token processed for classeId ${classeId} in salleId ${salleId}`);
    response.status = 200;
    response.text = "NFC token processed successfully";
    return response;
}

module.exports = { eleveScan };