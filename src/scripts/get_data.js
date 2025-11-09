// scripts/get_data.js
const { fetchData, USER_ID, parseArgs, buildUrl, outputJSON } = require('../API_SAC/commons/helpers');
/**
 * ============================================================================
 *  Script: get_data.js
 *  Description: Retrieve and filter data from EcoleDirecte APIs (APIP / API).
 *
 *  Usage:
 *    node scripts/get_data.js <type> [--option=value] [...]
 *
 *  Supported types:
 *    • ETABLISSEMENTS
 *    • NIVEAUX
 *    • CLASSES
 *    • ELEVES
 *    • MESSAGES
 *    • SALLES
 *
 *  Common options:
 *    --id=<id>                Generic ID (fallback when placeholder ":id" exists)
 *    --etab=<id>              Filter by établissement ID
 *    --niveau=<id>            Filter by niveau ID
 *    --classe=<id>            Filter by classe ID
 *    --eleve=<id>             Filter by élève ID (within a class)
 *    --salle=<id|code|name>   Filter by salle (room) ID, code, or partial name
 *    --message=<id>           Filter by message ID (for MESSAGES type)
 *    --from="name"            Filter messages by sender name (partial match)
 *    --search="keyword"       Search by name, label, subject, or content depending on type
 *    --unread=true|false      Show only unread messages (MESSAGES only)
 *    --limit=<n>              Limit displayed results (MESSAGES only)
 *
 *  Examples:
 *  ----------------------------------------------------------------------------
 *  📘 ETABLISSEMENTS
 *    node scripts/get_data.js ETABLISSEMENTS
 *    node scripts/get_data.js ETABLISSEMENTS --etab=7
 *    node scripts/get_data.js ETABLISSEMENTS --search="college"
 *
 *  🎓 NIVEAUX
 *    node scripts/get_data.js NIVEAUX
 *    node scripts/get_data.js NIVEAUX --etab=7
 *    node scripts/get_data.js NIVEAUX --niveau=12
 *    node scripts/get_data.js NIVEAUX --search="lycée"
 * 
 *  🎓 NIVEAUX_ALL
 *    node scripts/get_data.js NIVEAUX_ALL
 *    node scripts/get_data.js NIVEAUX_ALL --etab=4
 *    node scripts/get_data.js NIVEAUX_ALL --search="BTS"
 *    node scripts/get_data.js NIVEAUX_ALL --classe=17
 *
 *  🏫 CLASSES
 *    node scripts/get_data.js CLASSES
 *    node scripts/get_data.js CLASSES --etab=7
 *    node scripts/get_data.js CLASSES --etab=7 --niveau=12
 *    node scripts/get_data.js CLASSES --classe=142
 *    node scripts/get_data.js CLASSES --search="BTS"
 *
 *  👩‍🎓 ELEVES
 *    node scripts/get_data.js ELEVES --classe=142
 *    node scripts/get_data.js ELEVES --classe=142 --eleve=3153
 *    node scripts/get_data.js ELEVES --classe=142 --search="Dupont"
 *
 *  ✉️  MESSAGES
 *    node scripts/get_data.js MESSAGES
 *    node scripts/get_data.js MESSAGES --unread=true
 *    node scripts/get_data.js MESSAGES --from="Caroline"
 *    node scripts/get_data.js MESSAGES --search="maintenance"
 *    node scripts/get_data.js MESSAGES --message=8672
 *    node scripts/get_data.js MESSAGES --limit=10
 *
 *  🏢 SALLES
 *    node scripts/get_data.js SALLES
 *    node scripts/get_data.js SALLES --salle=101
 *    node scripts/get_data.js SALLES --search="atelier"
 *
 *  Notes:
 *    - All filters are optional unless required by the API (e.g. --classe for ELEVES).
 *    - The script automatically chooses between APIP and API URLs based on the data type.
 *    - Output is raw JSON (same structure as the API), printed via outputJSON().
 * ============================================================================
 */

// --- main entrypoint ---
async function main() {
  const args = parseArgs();
  const type = args._ || Object.keys(args)[0];
  const dataType = type?.toUpperCase();
  if (!dataType) {
    console.error('❌ Aucun type de donnée spécifié (ex: ETABLISSEMENTS, ELEVES, ...).');
    process.exitCode = 1;
    return;
  }

  try {
    let data;

    // --- Specific logic per data type ---
    if (dataType === 'ELEVES') {
      let eleves = [];

      // If no class specified, fetch all classes via NIVEAUX_ALL
      if (!args.classe) {
        console.log('📡 Aucun --classe spécifié → récupération de toutes les classes depuis NIVEAUX_ALL…');

        const niveauxAllUrl = await buildUrl('NIVEAUX_ALL', {});
        const niveauxAllData = await fetchData(niveauxAllUrl);

        if (niveauxAllData?.code !== 200) {
          console.error('❌ Impossible de récupérer la structure NIVEAUX_ALL.');
          process.exit(2);
          return;
        }

        const etablissements = niveauxAllData.data?.etablissements || [];

        const allClasses = etablissements.flatMap(e =>
          (e.niveaux || []).flatMap(n => n.classes || [])
        );

        console.log(`🔍 ${allClasses.length} classes détectées, récupération en cours…`);

        // Sequential fetching (safer for rate limits)
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
                }))
              );
            }
          } catch (err) {
            console.warn(`⚠️  Erreur pour classe ${classeId}: ${err.message}`);
          }
        }

        console.log(`✅ ${eleves.length} élèves récupérés au total.`);
      }

      // Normal behavior: single class
      else {
        const url = await buildUrl('ELEVES', args);
        const res = await fetchData(url);
        if (res?.code === 200 && Array.isArray(res.data?.eleves)) {
          eleves = res.data.eleves;
        } else {
          console.error('❌ Aucun élève trouvé pour la classe demandée.');
          process.exit(2);
          return;
        }
      }

      // Optional filters (still apply globally)
      if (args.eleve) {
        eleves = eleves.filter(e => e.id.toString() === args.eleve.toString());
      } else if (args.search) {
        const keyword = args.search.toLowerCase();
        eleves = eleves.filter(e =>
          e.nom?.toLowerCase().includes(keyword) ||
          e.prenom?.toLowerCase().includes(keyword) ||
          (e.email && e.email.toLowerCase().includes(keyword))
        );
      }

      outputJSON(eleves, args);
    }

    else if (dataType === 'EDT') {
      let cours = [];

      // If no class specified, fetch all classes via NIVEAUX_ALL
      if (!args.classe) {
        console.log('📡 Aucun --classe spécifié → récupération de toutes les classes depuis NIVEAUX_ALL…');

        const niveauxAllUrl = await buildUrl('NIVEAUX_ALL', {});
        const niveauxAllData = await fetchData(niveauxAllUrl);

        if (niveauxAllData?.code !== 200) {
          console.error('❌ Impossible de récupérer la structure NIVEAUX_ALL.');
          process.exit(2);
          return;
        }

        const etablissements = niveauxAllData.data?.etablissements || [];
        const allClasses = etablissements.flatMap(e =>
          (e.niveaux || []).flatMap(n => n.classes || [])
        );

        console.log(`🔍 ${allClasses.length} classes détectées, récupération en cours…`);

        // Sequential fetching
        for (const c of allClasses) {
          const url = await buildUrl('EDT', { classe: c.id });
          try {
            const res = await fetchData(url, {
                dateDebut: "2025-11-03",
                dateFin: "2025-11-09",
                avecTrous: false
            });
            if (res?.code === 200 && Array.isArray(res.data)) {
              cours.push(
                ...res.data.map(ev => ({
                  ...ev,
                  classeCode: c.code,
                  classeLibelle: c.libelle,
                  classeId: c.id,
                }))
              );
            }
          } catch (err) {
            console.warn(`⚠️  Erreur pour classe ${c.id}: ${err.message}`);
          }
        }

        console.log(`✅ ${cours.length} cours récupérés au total.`);
      }

      // Normal behavior: single class
      else {
        const url = await buildUrl('EDT', { classe: args.classe });
        const res = await fetchData(url, {
                dateDebut: "2025-11-03",
                dateFin: "2025-11-09",
                avecTrous: false
            });
        console.log(res);
        if (res?.code === 200 && Array.isArray(res.data)) {
          cours = res.data;
        } else {
          console.error('❌ Aucun cours trouvé pour la classe demandée.');
          process.exit(2);
          return;
        }
      }

      // Optional filters
      if (args.search) {
        const keyword = args.search.toLowerCase();
        cours = cours.filter(ev =>
          ev.matiere?.toLowerCase().includes(keyword) ||
          ev.prof?.toLowerCase().includes(keyword) ||
          ev.salle?.toLowerCase().includes(keyword) ||
          ev.classe?.toLowerCase().includes(keyword)
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

      outputJSON(cours, args);
    }

    else if (dataType === 'MESSAGES') {
      let messages = data.data?.messages?.received || [];

      if (!Array.isArray(messages) || messages.length === 0) {
        console.error(`❌ Aucun message reçu.`);
        process.exitCode = 2;
        return;
      }

      // --- Filter: unread ---
      if (args.unread === true) {
        messages = messages.filter(m => m.read === false);
      }

      // --- Filter: message ID (local, not URL) ---
      if (args.message) {
        messages = messages.filter(m => m.id.toString() === args.message.toString());
      }

      // --- Filter: sender ---
      if (args.from) {
        const searchFrom = args.from.toLowerCase();
        messages = messages.filter(m =>
          `${m.from?.prenom || ''} ${m.from?.nom || ''}`.toLowerCase().includes(searchFrom)
        );
      }

      // --- Search: subject / sender / content ---
      if (args.search) {
        const keyword = args.search.toLowerCase();
        messages = messages.filter(m =>
          (m.subject?.toLowerCase().includes(keyword)) ||
          (`${m.from?.prenom || ''} ${m.from?.nom || ''}`.toLowerCase().includes(keyword)) ||
          (m.content?.toLowerCase?.().includes(keyword))
        );
      }

      // --- Limit displayed messages ---
      if (args.limit && !isNaN(args.limit)) {
        messages = messages.slice(0, parseInt(args.limit, 10));
      }

      outputJSON(messages, args);
    }

    else if (dataType === 'CLASSES') {
      let etablissements = data.data?.etablissements || [];

      // Optional --etab filter
      if (args.etab) {
        etablissements = etablissements.filter(
          e => e.id.toString() === args.etab.toString()
        );
      }

      if(args.classe) {
        etablissements = etablissements.map(e => {
          const filteredNiveaux = (e.niveaux || []).map(n => {
            const filteredClasses = (n.classes || []).filter(c =>
              c.id.toString() === args.classe.toString()
            );
            return { ...n, classes: filteredClasses };
          });
          return { ...e, niveaux: filteredNiveaux };
        }).filter(e => (e.niveaux || []).length > 0);
      }

      // Optional --search filter (partial match on class name)
      if (args.search) {
        const keyword = args.search.toLowerCase();
        etablissements = etablissements.map(e => {
          const filteredNiveaux = (e.niveaux || []).map(n => {
            const filteredClasses = (n.classes || []).filter(c =>
              c.libelle?.toLowerCase().includes(keyword) ||
              c.code?.toLowerCase().includes(keyword)
            );
            return { ...n, classes: filteredClasses };
          });
          return { ...e, niveaux: filteredNiveaux };
        }).filter(e => (e.niveaux || []).length > 0);
      }

      for (const e of etablissements) {
        let niveaux = e.niveaux || [];
        if (args.niveau) {
          niveaux = niveaux.filter(
            n => n.id.toString() === args.niveau.toString()
          );
          if (niveaux.length === 0) {
            continue;
          }
        }

        for (const n of niveaux) {
          const classes = n.classes || [];
          outputJSON(classes, args);
        }
      }
    }

    else if (dataType === 'NIVEAUX') {
      let etablissements = data.data?.etablissements || [];

      // Local filter by --etab
      if (args.etab) {
        etablissements = etablissements.filter(
          e => e.id.toString() === args.etab.toString()
        );
      }

      if (args.niveau || args.search) {
        const keyword = args.search?.toLowerCase();
        etablissements = etablissements.map(e => ({
          ...e,
          niveaux: (e.niveaux || []).filter(n =>
            (args.niveau && n.id.toString() === args.niveau.toString()) ||
            (args.search && n.libelle?.toLowerCase().includes(keyword))
          )
        })).filter(e => e.niveaux.length > 0);
      }
      outputJSON(etablissements, args);
    }

    else if (dataType === 'NIVEAUX_ALL') {
      let etablissements = data.data?.etablissements || [];
      let groupes = data.data?.groupes || [];

      // Filters
      if (args.etab) {
        etablissements = etablissements.filter(e => e.id.toString() === args.etab.toString());
        groupes = groupes.filter(g => g.etabId?.toString() === args.etab.toString());
      }

      if (args.niveau) {
        etablissements = etablissements.map(e => ({
          ...e,
          niveaux: (e.niveaux || []).filter(n => n.id.toString() === args.niveau.toString())
        })).filter(e => e.niveaux.length > 0);
      }

      if (args.classe) {
        etablissements = etablissements.map(e => ({
          ...e,
          niveaux: (e.niveaux || []).map(n => ({
            ...n,
            classes: (n.classes || []).filter(c => c.id.toString() === args.classe.toString())
          })).filter(n => n.classes?.length)
        })).filter(e => e.niveaux?.length);
      }

      if (args.search) {
        const kw = args.search.toLowerCase();
        etablissements = etablissements.map(e => ({
          ...e,
          niveaux: (e.niveaux || []).map(n => ({
            ...n,
            classes: (n.classes || []).filter(c =>
              c.libelle?.toLowerCase().includes(kw) || c.code?.toLowerCase().includes(kw)
            )
          })).filter(n =>
            n.libelle?.toLowerCase().includes(kw) || n.classes?.length
          )
        })).filter(e =>
          e.libelle?.toLowerCase().includes(kw) || e.niveaux?.length
        );
      }

      outputJSON({ etablissements, groupes }, args);
    }

    else if (dataType === 'ETABLISSEMENTS') {
      let etablissements = data.data?.etablissements || [];
      if (args.etab)
        etablissements = etablissements.filter(e => e.id.toString() === args.etab.toString());
      if (args.search) {
        const keyword = args.search.toLowerCase();
        etablissements = etablissements.filter(e =>
          e.libelle?.toLowerCase().includes(keyword) ||
          e.code?.toLowerCase().includes(keyword)
        );
      }
      outputJSON(etablissements, args);
    }

    else if (dataType === 'SALLES') {
      let salles = data.data || [];
      if (args.salle || args.search) {
        const keyword = (args.salle || args.search).toLowerCase();
        salles = salles.filter(s =>
          s.libelle?.toLowerCase().includes(keyword) ||
          s.code?.toLowerCase().includes(keyword) ||
          s.id.toString() === keyword
        );
      }
      outputJSON(salles, args);
    }

    else {
      outputJSON(data.data || data, args);
    }

  } catch (err) {
    console.error('💥 Erreur :', err.message);
    process.exitCode = 2;
  }
}

main();