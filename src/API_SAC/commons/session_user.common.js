// ./API_SAC/commons/session_user.common.js
// Formate les données utilisateur pour la session Express (ce qui est stocké dans req.session.user).
// Combine les données de la base de données (dbUser) avec les informations de la session OAuth (groupes, rôle, profil ED).
function format_session_user(dbUser, sessionUser = {}, roleConst = sessionUser.roleConst, groups = sessionUser.groups, edProfile = sessionUser.edProfile) {
  // Extrait le profil EcoleDirecte de manière sécurisée (seulement l'ID et la classeId)
  const safeEdProfile = edProfile?.ED
    ? {
        ED: {
          id: edProfile.ED.id ? String(edProfile.ED.id) : undefined, // ID EcoleDirecte de l'utilisateur
          classeId: edProfile.ED.classeId, // ID de la classe dans EcoleDirecte
        },
      }
    : null;

  // Retourne un objet "propre" contenant toutes les informations utilisateur nécessaires pour la session
  return {
    id: dbUser.id, // ID interne (Prisma) de l'utilisateur
    edId: dbUser.edId, // ID EcoleDirecte de l'utilisateur
    email: dbUser.o365Email, // Email Office 365
    o365Email: dbUser.o365Email, // Email Office 365 (doublon pour compatibilité)
    edEmail: dbUser.edEmail, // Email EcoleDirecte
    firstName: dbUser.firstName, // Prénom
    lastName: dbUser.lastName, // Nom de famille
    role: dbUser.role, // Rôle au format Prisma (minuscule : "student", "teacher", etc.)
    roleConst, // Rôle au format constante (majuscule : "STUDENT", "TEACHER", etc.)
    // Liste simplifiée des groupes Azure AD de l'utilisateur (seulement le nom de chaque groupe)
    groups: Array.isArray(groups) ? groups.map(group => ({ name: group.name })) : [],
    edProfile: safeEdProfile, // Profil EcoleDirecte filtré
    avatar: dbUser.o365AvatarB64, // Avatar Office 365 en base64
    edPhotoB64: dbUser.edPhotoB64, // Photo EcoleDirecte en base64
    // Informations de la classe (si l'utilisateur est rattaché à une classe)
    class: dbUser.class
      ? {
          id: dbUser.class.id, // ID interne de la classe
          code: dbUser.class.code, // Code de la classe (ex: "3A")
          name: dbUser.class.name, // Nom complet de la classe
          edId: dbUser.class.edId, // ID EcoleDirecte de la classe
        }
      : null,
  };
}

// Exporte la fonction de formatage
module.exports = {
  format_session_user,
};
