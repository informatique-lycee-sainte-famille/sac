// scripts/get_data.js
const { DATA_URLS, BASE_URLS, API_VERSION_PARAM } = require('../API_SAC/commons/constants');
const { fetchData, USER_ID, printJSON } = require('../API_SAC/commons/helpers');

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
 *    - Output is raw JSON (same structure as the API), printed via printJSON().
 * ============================================================================
 */

// --- argument parsing ---
function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach(arg => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    if (!value) {
      // Bare argument (e.g., "MESSAGES")
      args._ = key.toUpperCase();
    } else {
      // Convert common truthy/falsey strings to booleans
      const lowerVal = value.toLowerCase();
      if (lowerVal === 'true') args[key.toLowerCase()] = true;
      else if (lowerVal === 'false') args[key.toLowerCase()] = false;
      else args[key.toLowerCase()] = value;
    }
  });
  return args;
}

// --- dynamic URL builder ---
async function buildUrl(type, params) {
  const upper = type.toUpperCase();
  let path = DATA_URLS.APIP[upper] || DATA_URLS.API[upper];
  if (!path) throw new Error(`Type de donnée inconnu : ${type}`);

  // replace placeholders
  if (path.includes(':id')) {
    const id =
      params.id ||
      params.classe ||
      params.salle ||
      params.niveau ||
      params.etab ||
      USER_ID;
    if (!id) throw new Error(`Aucun ID fourni pour ${type}.`);
    path = path.replace(':id', id);
  }

  const base = DATA_URLS.API[upper] ? BASE_URLS.API : BASE_URLS.APIP;

  // build full URL with proper query separator
  const separator = path.includes('?') ? '&' : '?';
  return `${base}${path}${separator}verbe=get&v=${API_VERSION_PARAM}`;
}

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
    const url = await buildUrl(dataType, args);

    const data = await fetchData(url);

    if (data?.code !== 200) {
      console.error(`❌ Erreur ${data.code}: ${data.message || 'Aucune donnée trouvée (ID invalide ?)'}`);
      process.exitCode = 2;
      return;
    }

    // --- Specific logic per data type ---
    if (dataType === 'ELEVES') {
      let eleves = data.data?.eleves || [];

      if (!args.id && !args.classe) {
        console.error('⚠️  Utilisation: node scripts/get_data.js ELEVES --classe=<idClasse> [--eleve=<idEleve>]');
        process.exitCode = 1;
        return;
      }

      // Optional élève filter
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
      printJSON(eleves);
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

      printJSON(messages);
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
          printJSON(classes);
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
      printJSON(etablissements);
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
      printJSON(etablissements);
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
      printJSON(salles);
    }

    else {
      printJSON(data.data || data);
    }

  } catch (err) {
    console.error('💥 Erreur :', err.message);
    process.exitCode = 2;
  }
}

main();