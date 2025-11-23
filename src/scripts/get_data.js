// scripts/get_data.js
const {
  fetchData,
  USER_ID,
  parseArgs,
  buildUrl,
  outputJSON,
} = require('../API_SAC/commons/helpers');

/**
 * ---------------------------------------------------------------------------
 * Helper: compute date range for EDT
 * ---------------------------------------------------------------------------
 */
function computeEdtDateRange(rawDateOpt) {
  const opt = (rawDateOpt || '').toString().trim().toLowerCase();
  const fmt = d => d.toISOString().slice(0, 10);
  const today = new Date();

  const startOfWeek = d => {
    const n = new Date(d);
    const day = n.getDay(); // 0 = Sunday
    const diff = (day === 0 ? -6 : 1) - day; // Monday as first day
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

  // Manual "start=YYYY-MM-DD,end=YYYY-MM-DD"
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

  // "YYYY-MM-DD:YYYY-MM-DD"
  if (opt.includes(':')) {
    const [start, end] = opt.split(':').map(x => x.trim());
    if (!start || !end) throw new Error(`Format date invalide: ${rawDateOpt}`);
    return { dateDebut: start, dateFin: end };
  }

  // "YYYY-MM-DD" -> single day
  if (/^\d{4}-\d{2}-\d{2}$/.test(opt)) {
    return { dateDebut: opt, dateFin: opt };
  }

  throw new Error(`Option de date EDT invalide: ${rawDateOpt}`);
}

/**
 * ============================================================================
 *  Core function: getDataByType(type, args)
 * ============================================================================
 */
async function getDataByType(type, args = {}) {
  const dataType = type?.toUpperCase();
  if (!dataType) {
    throw new Error(
      'Aucun type de donnée spécifié (ex: ETABLISSEMENTS, ELEVES, ...).',
    );
  }

  // data is used by the types that rely on a generic fetch at the end
  let data;

  // -------------------------------------------------------------------------
  // ELEVES (custom fetching, as in old code)
  // -------------------------------------------------------------------------
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
          // ignore per-class errors
        }
      }
    } else {
      // Single class
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

  // -------------------------------------------------------------------------
  // ELEVES_ALL (custom fetching)
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // PROFESSEURS (custom fetching)
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // EDT (custom fetching, with date range helper)
  // -------------------------------------------------------------------------
  if (dataType === 'EDT') {
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
        const url = await buildUrl('EDT', { classe: c.id });
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
          // ignore per-class errors
        }
      }
    } else {
      const url = await buildUrl('EDT', { classe: args.classe });
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

  // -------------------------------------------------------------------------
  // For the remaining types, first do a generic fetch like in old script
  // -------------------------------------------------------------------------
  const baseUrl = await buildUrl(dataType, args);
  data = await fetchData(baseUrl);

  // -------------------------------------------------------------------------
  // MESSAGES (logic from old file but using fetched `data`)
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // CLASSES (same logic as old script, with data from generic fetch)
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // NIVEAUX
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // NIVEAUX_ALL
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // ETABLISSEMENTS
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // SALLES (explicit fetch & filtering)
  // -------------------------------------------------------------------------
  if (dataType === 'SALLES') {
    // override: SALLES is a flat list, not under data.data.etablissements
    const url = await buildUrl('SALLES', args);
    const res = await fetchData(url);
    if (res?.code !== 200) {
      throw new Error('Impossible de récupérer les salles.');
    }
    let salles = res.data || res; // depends on your API; adjust if needed

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

  // -------------------------------------------------------------------------
  // Fallback: return raw data
  // -------------------------------------------------------------------------
  return data.data || data;
}

/**
 * CLI entrypoint (kept for original behavior)
 */
async function main() {
  const args = parseArgs();
  const type = args._ || Object.keys(args)[0];

  try {
    const result = await getDataByType(type, args);
    outputJSON(result, args);
  } catch (err) {
    console.error('💥 Erreur :', err.message);
    process.exitCode = 2;
  }
}

if (require.main === module) {
  main();
}

module.exports = { getDataByType };