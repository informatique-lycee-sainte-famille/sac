const express = require("express");
const { prisma } = require("../commons/prisma");
const router = express.Router();

router.get("/me", async (req, res) => {
  const userId = req.session.userId;
//   console.log(process.env.DATABASE_URL);

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