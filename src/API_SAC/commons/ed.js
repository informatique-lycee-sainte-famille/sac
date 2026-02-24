// src/API_SAC/commons/ed.js
const { fetchData, BASE_URLS, API_VERSION } = require('./helpers');

/**
 * Send attendance records for a session (séance) to EcoleDirecte.
 *
 * @param {number|string} seanceId  ID of the session in ED
 * @param {string} date           ISO date (YYYY-MM-DD)
 * @param {Array<Object>} records List of student records:
 *   { idEleve, statut:'present'|'late'|'absent'|'excused', justifie?, motif? }
 */
async function sendAttendance(seanceId, date, records) {
  const url = `${BASE_URLS.APIP}/appels/ajout.awp?verbe=post&v=${API_VERSION}`;
  const body = {
    idSeance: seanceId,
    date,
    eleves: records.map(r => ({
      id: r.idEleve,
      statut: r.statut,
      justifie: r.justifie ? 1 : 0,
      motif: r.motif || ''
    }))
  };
  return fetchData(url, body);
}

/**
 * Create absence entries instead of a bulk appel
 * @param {Array<Object>} absences
 *   each object: { idSeance, idEleve, date, justifie?, motif? }
 */
async function postAbsences(absences) {
  const url = `${BASE_URLS.APIP}/absences/ajout.awp?verbe=post&v=${API_VERSION}`;
  return fetchData(url, { absences });
}

module.exports = { sendAttendance, postAbsences };
