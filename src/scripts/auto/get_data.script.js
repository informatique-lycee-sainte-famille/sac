// ./scripts/auto/get_data.script.js
const {
  fetchData,
  USER_ID,
  parseArgs,
  buildUrl,
  outputJSON,
} = require('../../API_SAC/commons/helpers.common');

const crypto = require('crypto');

function computeEdtDateRange(rawDateOpt) {
  const opt = (rawDateOpt || '').toString().trim().toLowerCase();
  const fmt = d => d.toISOString().slice(0, 10);
  const today = new Date();

  const startOfWeek = d => {
    const n = new Date(d);
    const day = n.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    n.setDate(n.getDate() + diff);
    n.setHours(0, 0, 0, 0);
    return n;
  };

  if (!opt || opt === 'today') {
    const d = new Date();
    return { dateDebut: fmt(d), dateFin: fmt(d) };
  }
  if (opt === 'yesterday') {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return { dateDebut: fmt(d), dateFin: fmt(d) };
  }
  if (opt === 'tomorrow') {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return { dateDebut: fmt(d), dateFin: fmt(d) };
  }
  if (opt === 'week') {
    const s = startOfWeek(today);
    const e = new Date(s);
    e.setDate(e.getDate() + 6);
    return { dateDebut: fmt(s), dateFin: fmt(e) };
  }
  if (opt === 'nextweek') {
    const s = startOfWeek(today);
    s.setDate(s.getDate() + 7);
    const e = new Date(s);
    e.setDate(e.getDate() + 6);
    return { dateDebut: fmt(s), dateFin: fmt(e) };
  }
  if (opt === 'prevweek' || opt === 'lastweek') {
    const s = startOfWeek(today);
    s.setDate(s.getDate() - 7);
    const e = new Date(s);
    e.setDate(e.getDate() + 6);
    return { dateDebut: fmt(s), dateFin: fmt(e) };
  }

  if (opt.includes('start=') || opt.includes('end=')) {
    const parts = opt.split(',');
    let start, end;
    for (const p of parts) {
      const [k, v] = p.split('=').map(x => x.trim());
      if (k === 'start') start = v;
      if (k === 'end') end = v;
    }
    if (!start && !end) throw new Error(`Format date invalide: ${rawDateOpt}`);
    if (!start) start = end;
    if (!end) end = start;
    return { dateDebut: start, dateFin: end };
  }

  if (opt.includes(':')) {
    const [start, end] = opt.split(':').map(x => x.trim());
    if (!start || !end) throw new Error(`Format date invalide: ${rawDateOpt}`);
    return { dateDebut: start, dateFin: end };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(opt)) {
    return { dateDebut: opt, dateFin: opt };
  }

  throw new Error(`Option de date EDT_CLASSE  invalide: ${rawDateOpt}`);
}

async function get_data_by_type(type, args = {}) {
  const dataType = type?.toUpperCase();
  if (!dataType) {
    throw new Error(
      'Aucun type de donnée spécifié (ex: ETABLISSEMENTS, ELEVES, ...).',
    );
  }

  let data;

  if (dataType === 'ELEVES') {
    let eleves = [];

    if (!args.classe) {
      const niveauxAllUrl = await buildUrl('NIVEAUX_ALL', {});
      const niveauxAllData = await fetchData(niveauxAllUrl);
      if (niveauxAllData?.code !== 200) {
        throw new Error('Impossible de récupérer la structure NIVEAUX_ALL.');
      }
      const etablissements = niveauxAllData.data?.etablissements || [];
      const allClasses = etablissements.flatMap(e =>
        (e.niveaux || []).flatMap(n => n.classes || []),
      );

      for (const c of allClasses) {
        const classeId = c.id;
        const urlClasse = await buildUrl('ELEVES', { classe: classeId });
        try {
          const res = await fetchData(urlClasse);
          if (res?.code === 200 && Array.isArray(res.data?.eleves)) {
            eleves.push(
              ...res.data.eleves.map(e => ({
                ...e,
                classeCode: c.code,
                classeLibelle: c.libelle,
                classeId,
              })),
            );
          }
        } catch {
          // Multi-class imports stay best-effort because ED can fail on one class while others are valid.
        }
      }
    } else {
      const url = await buildUrl('ELEVES', args);
      const res = await fetchData(url);
      if (res?.code === 200 && Array.isArray(res.data?.eleves)) {
        eleves = res.data.eleves;
      } else {
        throw new Error('Aucun élève trouvé pour la classe demandée.');
      }
    }

    if (args.eleve) {
      eleves = eleves.filter(e => e.id.toString() === args.eleve.toString());
    } else if (args.search) {
      const keyword = args.search.toLowerCase();
      eleves = eleves.filter(
        e =>
          e.nom?.toLowerCase().includes(keyword) ||
          e.prenom?.toLowerCase().includes(keyword) ||
          (e.email && e.email.toLowerCase().includes(keyword)),
      );
    }

    return eleves;
  }
  if (dataType === 'ELEVES_ALL') {
    const url = await buildUrl('ELEVES_ALL', args);
    const res = await fetchData(url, {});
    if (!(res?.code === 200 && Array.isArray(res.data?.contacts))) {
      console.log(res);
      throw new Error('Aucun eleve trouvé.');
    }
    let eleves = res.data.contacts;

    if (args.search) {
      const keyword = args.search.toLowerCase();
      eleves = eleves.filter(
        e =>
          e.nom?.toLowerCase().includes(keyword) ||
          e.prenom?.toLowerCase().includes(keyword) ||
          (e.email && e.email.toLowerCase().includes(keyword)),
      );
    }
    if (args.classe) {
      const classeId = args.classe.toString();
      eleves = eleves.filter(
        e =>
          Array.isArray(e.classes) &&
          e.classes.some(c => c.id?.toString() === classeId),
      );
    }
    if (args.matiere) {
      const kw = args.matiere.toLowerCase();
      eleves = eleves.filter(
        e =>
          Array.isArray(e.classes) &&
          e.classes.some(c => c.matiere?.toLowerCase().includes(kw)),
      );
    }

    return eleves;
  }
  if (dataType === 'PROFESSEURS') {
    const url = await buildUrl('PROFESSEURS', args);
    const res = await fetchData(url, {});
    if (!(res?.code === 200 && Array.isArray(res.data?.contacts))) {
      throw new Error('Aucun professeur trouvé.');
    }
    let profs = res.data.contacts;

    if (args.search) {
      const keyword = args.search.toLowerCase();
      profs = profs.filter(
        p =>
          p.nom?.toLowerCase().includes(keyword) ||
          p.prenom?.toLowerCase().includes(keyword) ||
          (p.email && p.email.toLowerCase().includes(keyword)),
      );
    }
    if (args.classe) {
      const classeId = args.classe.toString();
      profs = profs.filter(
        p =>
          Array.isArray(p.classes) &&
          p.classes.some(c => c.id?.toString() === classeId),
      );
    }
    if (args.matiere) {
      const kw = args.matiere.toLowerCase();
      profs = profs.filter(
        p =>
          Array.isArray(p.classes) &&
          p.classes.some(c => c.matiere?.toLowerCase().includes(kw)),
      );
    }

    return profs;
  }
  if (dataType === 'PERSONNELS') {
    const url = await buildUrl('PERSONNELS', args);
    const res = await fetchData(url, {});
    if (!(res?.code === 200 && Array.isArray(res.data?.contacts))) {
      throw new Error('Aucun personnel trouvé.');
    }
    let personnels = res.data.contacts;
    if (args.search) {
      const keyword = args.search.toLowerCase();
      personnels = personnels.filter(
        p =>
          p.nom?.toLowerCase().includes(keyword) ||
          p.prenom?.toLowerCase().includes(keyword) ||
          (p.email && p.email.toLowerCase().includes(keyword)),
      );
    }
    return personnels;
  }
  if (dataType === 'EDT_CLASSE') {
    let cours = [];

    let dateParams;
    try {
      dateParams = computeEdtDateRange(args.date || 'today');
    } catch (e) {
      throw e;
    }

    const commonBody = {
      ...dateParams,
      avecTrous: false,
    };

    if (!args.classe) {
      const niveauxAllUrl = await buildUrl('NIVEAUX_ALL', {});
      const niveauxAllData = await fetchData(niveauxAllUrl);
      if (niveauxAllData?.code !== 200) {
        throw new Error('Impossible de récupérer la structure NIVEAUX_ALL.');
      }
      const etablissements = niveauxAllData.data?.etablissements || [];
      const allClasses = etablissements.flatMap(e =>
        (e.niveaux || []).flatMap(n => n.classes || []),
      );

      for (const c of allClasses) {
        const url = await buildUrl('EDT_CLASSE', { classe: c.id });
        try {
          const res = await fetchData(url, commonBody);
          if (res?.code === 200 && Array.isArray(res.data)) {
            cours.push(
              ...res.data.map(ev => ({
                ...ev,
                classeCode: c.code,
                classeLibelle: c.libelle,
                classeId: c.id,
              })),
            );
          }
        } catch {
          // Multi-class imports stay best-effort because ED can fail on one class while others are valid.
        }
      }
    } else {
      const url = await buildUrl('EDT_CLASSE', { classe: args.classe });
      const res = await fetchData(url, commonBody);
      if (res?.code === 200 && Array.isArray(res.data)) {
        cours = res.data;
      } else {
        throw new Error('Aucun cours trouvé pour la classe demandée.');
      }
    }

    if (args.search) {
      const keyword = args.search.toLowerCase();
      cours = cours.filter(
        ev =>
          ev.matiere?.toLowerCase().includes(keyword) ||
          ev.prof?.toLowerCase().includes(keyword) ||
          ev.salle?.toLowerCase().includes(keyword) ||
          ev.classe?.toLowerCase().includes(keyword),
      );
    }
    if (args.prof) {
      const keyword = args.prof.toLowerCase();
      cours = cours.filter(ev => ev.prof?.toLowerCase().includes(keyword));
    }
    if (args.salle) {
      const keyword = args.salle.toLowerCase();
      cours = cours.filter(ev => ev.salle?.toLowerCase().includes(keyword));
    }

    return cours;
  }

  if (dataType === 'EDT_SALLE') {
    let cours = [];

    let dateParams;
    try {
      dateParams = computeEdtDateRange(args.date || 'today');
    } catch (e) {
      throw e;
    }

    const commonBody = {
      ...dateParams,
      avecTrous: false,
    };

    if (!args.salle) {
      const sallesUrl = await buildUrl('SALLES', {});
      const sallesAllData = await fetchData(sallesUrl);
      if (sallesAllData?.code !== 200) {
        throw new Error('Impossible de récupérer la structure SALLES.');
      }

      for (const s of sallesAllData.data?.salles || []) {
        const url = await buildUrl('EDT_SALLE', { salle: s.id });
        try {
          const res = await fetchData(url, commonBody);
          if (res?.code === 200 && Array.isArray(res.data)) {
            cours.push(
              ...res.data.map(ev => ({
                ...ev,
                salleCode: s.code,
                salleLibelle: s.libelle,
                salleId: s.id,
              })),
            );
          }
        } catch {
          // Keep aggregated room schedules best-effort for the same reason as class schedules.
        }
      }
    } else {
      const url = await buildUrl('EDT_SALLE', { salle: args.salle });
      const res = await fetchData(url, commonBody);
      if (res?.code === 200 && Array.isArray(res.data)) {
        cours = res.data;
      } else {
        throw new Error('Aucun cours trouvé pour la salle demandée.');
      }
    }

    if (args.search) {
      const keyword = args.search.toLowerCase();
      cours = cours.filter(
        ev =>
          ev.salle?.toLowerCase().includes(keyword) ||
          ev.matiere?.toLowerCase().includes(keyword)
      );
    }
    // Do NOT filter again by salle: API already scoped results correctly.

    return cours;
  }

  if (dataType === 'EDT_PROFESSEUR') {
    let cours = [];

    let dateParams;
    try {
      dateParams = computeEdtDateRange(args.date || 'today');
    } catch (e) {
      throw e;
    }

    const commonBody = {
      ...dateParams,
      avecTrous: false,
    };

    if (!args.prof) {
      const profsUrl = await buildUrl('PROFESSEURS', {});
      const profsData = await fetchData(profsUrl);

      if (!(profsData?.code === 200 && Array.isArray(profsData.data?.contacts))) {
        throw new Error('Impossible de récupérer la structure PROFESSEURS.');
      }

      for (const p of profsData.data.contacts) {
        const url = await buildUrl('EDT_PROFESSEUR', { prof: p.id });

        try {
          const res = await fetchData(url, commonBody);
          if (res?.code === 200 && Array.isArray(res.data)) {
            cours.push(
              ...res.data.map(ev => ({
                ...ev,
                profId: p.id,
                profNom: p.nom,
                profPrenom: p.prenom,
                profCode: p.code,
              }))
            );
          }
        } catch {
          // Keep aggregated teacher schedules best-effort for the same reason as class schedules.
        }
      }
    } else {
      const url = await buildUrl('EDT_PROFESSEUR', { prof: args.prof });
      const res = await fetchData(url, commonBody);

      if (res?.code === 200 && Array.isArray(res.data)) {
        cours = res.data;
      } else {
        throw new Error('Aucun cours trouvé pour le professeur demandé.');
      }
    }

    if (args.search) {
      const keyword = args.search.toLowerCase();
      cours = cours.filter(
        ev =>
          ev.matiere?.toLowerCase().includes(keyword) ||
          ev.salle?.toLowerCase().includes(keyword) ||
          ev.prof?.toLowerCase().includes(keyword) ||
          ev.classe?.toLowerCase().includes(keyword)
      );
    }

    if (args.salle) {
      const keyword = args.salle.toLowerCase();
      cours = cours.filter(ev => ev.salle?.toLowerCase().includes(keyword));
    }

    if (args.classe) {
      const keyword = args.classe.toLowerCase();
      cours = cours.filter(ev => ev.classeCode?.toLowerCase().includes(keyword));
    }

    return cours;
  }

  if (dataType === 'APPEL') {
    if (!args.classe) {
      throw new Error('Paramètre --classe requis pour APPEL.');
    }

    if (!args.horaire) {
      throw new Error('Paramètre --horaire requis (ex: 13:00-14:00).');
    }

    if (typeof args.eleves === 'string') {
      try {
        args.eleves = JSON.parse(args.eleves);
      } catch {
        throw new Error('Format JSON invalide pour --eleves');
      }
    }

    if (!Array.isArray(args.eleves) || args.eleves.length === 0) {
      throw new Error(
        'Paramètre --eleves requis (array d\'objets { id, isAbsent }).'
      );
    }

    const normalizedInput = args.eleves
      .filter(e => e && e.id !== undefined)
      .map(e => ({
        id: Number(e.id),
        isAbsent: Boolean(e.isAbsent),
      }));

    if (!normalizedInput.length) {
      throw new Error('Aucun élève valide à envoyer.');
    }

    normalizedInput.sort((a, b) => a.id - b.id);

    // ED has no session id for APPEL, so idempotency is based on class, slot and payload.
    const today = new Date().toISOString().slice(0, 10);
    const appelKey = `${args.classe}_${args.horaire}_${today}`;

    const payloadHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(normalizedInput))
      .digest('hex');

    if (!global.__SENT_APPELS__) {
      global.__SENT_APPELS__ = new Map();
    }

    const existingHash = global.__SENT_APPELS__.get(appelKey);

    if (existingHash && existingHash === payloadHash) {
      return {
        skipped: true,
        message: 'Appel déjà envoyé avec le même contenu.',
        classe: args.classe,
        horaire: args.horaire,
        date: today,
      };
    }

    const url = await buildUrl(
      "APPEL",
      {
        id: args.classe,
        horaire: args.horaire,
      },
      { verbe: "post" }
    );

    const body = {
      eleves: normalizedInput,
    };

    const response = await fetchData(url, body);

    if (response?.code !== 200) {
      console.log(response);
      throw new Error('Erreur lors de l\'envoi de l\'appel.');
    }

    global.__SENT_APPELS__.set(appelKey, payloadHash);

    return {
      success: true,
      classe: args.classe,
      horaire: args.horaire,
      date: today,
      count: normalizedInput.length,
      response: response.data || response,
    };
  }


  const baseUrl = await buildUrl(dataType, args);
  data = await fetchData(baseUrl);

  if (dataType === 'MESSAGES') {
    if (data?.code !== 200) {
      throw new Error('Impossible de récupérer les messages.');
    }
    let messages = data.data?.messages?.received || [];
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Aucun message reçu.');
    }

    if (args.unread === true) {
      messages = messages.filter(m => m.read === false);
    }
    if (args.message) {
      messages = messages.filter(
        m => m.id.toString() === args.message.toString(),
      );
    }
    if (args.from) {
      const searchFrom = args.from.toLowerCase();
      messages = messages.filter(m =>
        `${m.from?.prenom || ''} ${m.from?.nom || ''}`
          .toLowerCase()
          .includes(searchFrom),
      );
    }
    if (args.search) {
      const keyword = args.search.toLowerCase();
      messages = messages.filter(
        m =>
          m.subject?.toLowerCase().includes(keyword) ||
          `${m.from?.prenom || ''} ${m.from?.nom || ''}`
            .toLowerCase()
            .includes(keyword) ||
          m.content?.toLowerCase?.().includes(keyword),
      );
    }
    if (args.limit && !isNaN(args.limit)) {
      messages = messages.slice(0, parseInt(args.limit, 10));
    }

    return messages;
  }

  if (dataType === 'CLASSES') {
    let etablissements = data.data?.etablissements || [];

    if (args.etab) {
      etablissements = etablissements.filter(
        e => e.id.toString() === args.etab.toString(),
      );
    }
    if (args.classe) {
      etablissements = etablissements
        .map(e => {
          const filteredNiveaux = (e.niveaux || []).map(n => {
            const filteredClasses = (n.classes || []).filter(
              c => c.id.toString() === args.classe.toString(),
            );
            return { ...n, classes: filteredClasses };
          });
          return { ...e, niveaux: filteredNiveaux };
        })
        .filter(e => (e.niveaux || []).length > 0);
    }
    if (args.search) {
      const keyword = args.search.toLowerCase();
      etablissements = etablissements
        .map(e => {
          const filteredNiveaux = (e.niveaux || []).map(n => {
            const filteredClasses = (n.classes || []).filter(
              c =>
                c.libelle?.toLowerCase().includes(keyword) ||
                c.code?.toLowerCase().includes(keyword),
            );
            return { ...n, classes: filteredClasses };
          });
          return { ...e, niveaux: filteredNiveaux };
        })
        .filter(e => (e.niveaux || []).length > 0);
    }

    const classes = [];
    for (const e of etablissements) {
      let niveaux = e.niveaux || [];
      if (args.niveau) {
        niveaux = niveaux.filter(
          n => n.id.toString() === args.niveau.toString(),
        );
        if (!niveaux.length) continue;
      }
      for (const n of niveaux) {
        (n.classes || []).forEach(c => classes.push(c));
      }
    }

    return classes;
  }

  if (dataType === 'NIVEAUX') {
    let etablissements = data.data?.etablissements || [];

    if (args.etab) {
      etablissements = etablissements.filter(
        e => e.id.toString() === args.etab.toString(),
      );
    }
    if (args.niveau || args.search) {
      const keyword = args.search?.toLowerCase();
      etablissements = etablissements
        .map(e => ({
          ...e,
          niveaux: (e.niveaux || []).filter(
            n =>
              (args.niveau &&
                n.id.toString() === args.niveau.toString()) ||
              (args.search &&
                n.libelle?.toLowerCase().includes(keyword)),
          ),
        }))
        .filter(e => e.niveaux.length > 0);
    }

    return etablissements;
  }

  if (dataType === 'NIVEAUX_ALL') {
    let etablissements = data.data?.etablissements || [];
    let groupes = data.data?.groupes || [];

    if (args.etab) {
      etablissements = etablissements.filter(
        e => e.id.toString() === args.etab.toString(),
      );
      groupes = groupes.filter(
        g => g.etabId?.toString() === args.etab.toString(),
      );
    }
    if (args.niveau) {
      etablissements = etablissements
        .map(e => ({
          ...e,
          niveaux: (e.niveaux || []).filter(
            n => n.id.toString() === args.niveau.toString(),
          ),
        }))
        .filter(e => e.niveaux.length > 0);
    }
    if (args.classe) {
      etablissements = etablissements
        .map(e => ({
          ...e,
          niveaux: (e.niveaux || [])
            .map(n => ({
              ...n,
              classes: (n.classes || []).filter(
                c => c.id.toString() === args.classe.toString(),
              ),
            }))
            .filter(n => n.classes?.length),
        }))
        .filter(e => e.niveaux?.length);
    }
    if (args.search) {
      const kw = args.search.toLowerCase();
      etablissements = etablissements
        .map(e => ({
          ...e,
          niveaux: (e.niveaux || [])
            .map(n => ({
              ...n,
              classes: (n.classes || []).filter(
                c =>
                  c.libelle?.toLowerCase().includes(kw) ||
                  c.code?.toLowerCase().includes(kw),
              ),
            }))
            .filter(
              n =>
                n.libelle?.toLowerCase().includes(kw) ||
                n.classes?.length,
            ),
        }))
        .filter(
          e =>
            e.libelle?.toLowerCase().includes(kw) || e.niveaux?.length,
        );
    }

    return { etablissements, groupes };
  }

  if (dataType === 'ETABLISSEMENTS') {
    let etablissements = data.data?.etablissements || [];

    if (args.etab) {
      etablissements = etablissements.filter(
        e => e.id.toString() === args.etab.toString(),
      );
    }
    if (args.search) {
      const keyword = args.search.toLowerCase();
      etablissements = etablissements.filter(
        e =>
          e.libelle?.toLowerCase().includes(keyword) ||
          e.code?.toLowerCase().includes(keyword),
      );
    }

    return etablissements;
  }

  if (dataType === 'SALLES') {
    const url = await buildUrl('SALLES', args);
    const res = await fetchData(url);
    if (res?.code !== 200) {
      throw new Error('Impossible de récupérer les salles.');
    }
    let salles = res.data || res;

    if (args.salle || args.search) {
      const keyword = (args.salle || args.search).toLowerCase();
      salles = (salles || []).filter(
        s =>
          s.libelle?.toLowerCase().includes(keyword) ||
          s.code?.toLowerCase().includes(keyword) ||
          s.id?.toString() === keyword,
      );
    }

    return salles;
  }

  return data.data || data;
}

async function main() {
  const args = parseArgs();
  const type = args._ || Object.keys(args)[0];

  try {
    const result = await get_data_by_type(type, args);
    outputJSON(result, args);
  } catch (err) {
    console.error('💥 Erreur :', err.message);
    process.exitCode = 2;
  }
}

if (require.main === module) {
  main();
}

module.exports = { get_data_by_type };
