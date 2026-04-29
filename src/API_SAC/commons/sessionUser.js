function formatSessionUser(dbUser, sessionUser = {}, roleConst = sessionUser.roleConst, groups = sessionUser.groups, edProfile = sessionUser.edProfile) {
  const safeEdProfile = edProfile?.ED
    ? {
        ED: {
          id: edProfile.ED.id ? String(edProfile.ED.id) : undefined,
          classeId: edProfile.ED.classeId,
        },
      }
    : null;

  return {
    id: dbUser.id,
    edId: dbUser.edId,
    email: dbUser.o365Email,
    o365Email: dbUser.o365Email,
    edEmail: dbUser.edEmail,
    firstName: dbUser.firstName,
    lastName: dbUser.lastName,
    role: dbUser.role,
    roleConst,
    groups: Array.isArray(groups) ? groups.map(group => ({ name: group.name })) : [],
    edProfile: safeEdProfile,
    avatar: dbUser.o365AvatarB64,
    edPhotoUrl: dbUser.edPhotoUrl,
    class: dbUser.class
      ? {
          id: dbUser.class.id,
          code: dbUser.class.code,
          name: dbUser.class.name,
          edId: dbUser.class.edId,
        }
      : null,
  };
}

module.exports = {
  formatSessionUser,
};
