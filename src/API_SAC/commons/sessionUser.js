function formatSessionUser(dbUser, sessionUser = {}, roleConst = sessionUser.roleConst, groups = sessionUser.groups, edProfile = sessionUser.edProfile) {
  return {
    id: dbUser.id,
    o365Id: dbUser.o365Id,
    edId: dbUser.edId,
    email: dbUser.o365Email,
    firstName: dbUser.firstName,
    lastName: dbUser.lastName,
    role: dbUser.role,
    roleConst,
    groups,
    edProfile,
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
