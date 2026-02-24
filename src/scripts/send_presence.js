#!/usr/bin/env node
// src/scripts/send_presence.js
const { parseArgs } = require('../API_SAC/commons/helpers');
const { sendAttendance, postAbsences } = require('../API_SAC/commons/ed');

async function main() {
  const args = parseArgs();
  const mode = args.mode || 'attendance';

  try {
    if (mode === 'attendance') {
      if (!args.seance || !args.date || !args.eleve || !args.statut) {
        throw new Error('Usage: --seance=ID --date=YYYY-MM-DD --eleve=ID --statut=present|absent|... [--justifie] [--motif=TEXT]');
      }
      const rec = {
        idEleve: args.eleve,
        statut: args.statut,
        justifie: args.justifie,
        motif: args.motif,
      };
      const res = await sendAttendance(args.seance, args.date, [rec]);
      console.log('E.D. response:', res);
    } else if (mode === 'absence') {
      if (!args.seance || !args.date || !args.eleve) {
        throw new Error('Usage (absence): --seance=ID --date=YYYY-MM-DD --eleve=ID [--justifie] [--motif=TEXT]');
      }
      const absence = {
        idSeance: args.seance,
        idEleve: args.eleve,
        date: args.date,
        justifie: args.justifie,
        motif: args.motif,
      };
      const res = await postAbsences([absence]);
      console.log('E.D. response:', res);
    } else {
      throw new Error(`Unknown mode ${mode}`);
    }
  } catch (err) {
    console.error('💥 Erreur :', err.message);
    process.exitCode = 2;
  }
}

if (require.main === module) main();
