const express = require("express");
const { prisma } = require("../commons/prisma");
const router = express.Router();

router.get("/me", async (req, res) => {
  try {
    const userId = req.session.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;