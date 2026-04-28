const express = require("express");
const { prisma } = require("../commons/prisma");
const require_access = require("../middlewares/require_access");
const { ROLES } = require("../commons/constants");
const router = express.Router();

router.get("/me", require_access({ minRole: ROLES.STUDENT }), async (req, res) => {
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