// ./API_SAC/routes/classes.route.js
const express = require("express");
const { prisma } = require("../commons/prisma.common");
const require_access = require("../middlewares/require_access.middleware");
const { ROLES } = require("../commons/constants.common");
const { TECHNICAL_LEVELS, log_technical } = require("../commons/logger.common");

const router = express.Router();

function getSessionUser(req) {
  return req.session?.user || null;
}

router.get("/me", require_access({ minRole: ROLES.STUDENT }), async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser?.id) {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Utilisateur non authentifie." });
    }

    const user = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: {
        id: true,
        role: true,
        classId: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "Utilisateur introuvable." });
    }

    if (user.role !== "student") {
      return res.status(403).json({ error: "STUDENT_REQUIRED", message: "Cette route concerne la classe de l'eleve." });
    }

    if (!user.classId) {
      return res.status(404).json({ error: "CLASS_NOT_FOUND", message: "Aucune classe rattachee a cet eleve." });
    }

    const myClass = await prisma.class.findUnique({
      where: { id: user.classId },
      include: {
        users: {
          where: { role: "student" },
          orderBy: [
            { lastName: "asc" },
            { firstName: "asc" },
          ],
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return res.json(myClass);
  } catch (err) {
    log_technical(TECHNICAL_LEVELS.ERROR, "Class fetch failed", { error: err, userId: req.session?.user?.id });
    return res.status(500).json({
      error: "CLASS_FETCH_FAILED",
      message: "Erreur lors du chargement de la classe.",
    });
  }
});

module.exports = router;
