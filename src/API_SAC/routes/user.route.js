// ./API_SAC/routes/user.route.js
const express = require("express");
const { prisma } = require("../commons/prisma.common");
const { format_session_user } = require("../commons/session_user.common");
const require_access = require("../middlewares/require_access.middleware");
const { ROLES } = require("../commons/constants.common");
const { TECHNICAL_LEVELS, log_technical } = require("../commons/logger.common");

const router = express.Router();

router.get("/me", require_access({ minRole: ROLES.STUDENT }), async (req, res) => {
  try {
    if (!req.session?.user?.id) {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Utilisateur non authentifie." });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.session.user.id },
      include: { class: true },
    });

    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "Utilisateur introuvable." });
    }

    req.session.user = format_session_user(user, req.session.user);
    return res.json(req.session.user);
  } catch (err) {
    log_technical(TECHNICAL_LEVELS.ERROR, "User profile fetch failed", { error: err, userId: req.session?.user?.id });
    return res.status(500).json({
      error: "USER_FETCH_FAILED",
      message: "Erreur lors du chargement du profil.",
    });
  }
});

module.exports = router;
