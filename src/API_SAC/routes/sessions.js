const express = require("express");
const { prisma } = require("../commons/prisma");
const router = express.Router();

// Sessions du jour
router.get("/today", async (req, res) => {
  try {
    const userId = req.session.userId;
    const now = new Date();

    const sessions = await prisma.courseSession.findMany({
      where: {
        OR: [
          { teacherId: userId },
          {
            class: {
              students: {
                some: {
                  userId: userId
                }
              }
            }
          }
        ],
        startTime: {
          lte: new Date(now.setHours(23,59,59))
        },
        endTime: {
          gte: new Date(now.setHours(0,0,0))
        }
      },
      include: {
        class: true,
        room: true
      }
    });

    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: "Erreur récupération sessions", message: err.message });
  }
});

// Détail session
router.get("/:sessionId", async (req, res) => {
  const { sessionId } = req.params;

  const session = await prisma.courseSession.findUnique({
    where: { id: parseInt(sessionId) },
    include: {
      class: true,
      room: true,
      attendance: true
    }
  });

  res.json(session);
});

module.exports = router;