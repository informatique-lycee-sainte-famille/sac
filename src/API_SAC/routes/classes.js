const express = require("express");
const { prisma } = require("../commons/prisma");
const router = express.Router();

router.get("/me", async (req, res) => {
  const userId = req.session.userId;

  const classes = await prisma.class.findMany({
    where: {
      OR: [
        {
          students: {
            some: { userId }
          }
        },
        {
          teachers: {
            some: { userId }
          }
        }
      ]
    }
  });

  res.json(classes);
});

module.exports = router;