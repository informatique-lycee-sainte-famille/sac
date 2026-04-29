const express = require("express");
const { prisma } = require("../commons/prisma");
const { formatSessionUser } = require("../commons/sessionUser");
const require_access = require("../middlewares/require_access");
const { ROLES } = require("../commons/constants");

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

    req.session.user = formatSessionUser(user, req.session.user);
    return res.json(req.session.user);
  } catch (err) {
    console.error("User fetch failed:", err.message);
    return res.status(500).json({
      error: "USER_FETCH_FAILED",
      message: "Erreur lors du chargement du profil.",
    });
  }
});

module.exports = router;
