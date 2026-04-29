// ./API_SAC/routes/business_logs.route.js
const express = require("express");
const { prisma } = require("../commons/prisma.common");
const require_access = require("../middlewares/require_access.middleware");
const { ROLES } = require("../commons/constants.common");
const { TECHNICAL_LEVELS, log_technical } = require("../commons/logger.common");

const router = express.Router();

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function stringOrNull(value, maxLength = 160) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

router.use(require_access({ minRole: ROLES.STAFF }));

router.get("/", async (req, res) => {
  try {
    const take = Math.min(parsePositiveInt(req.query.take) || 100, 500);
    const userId = parsePositiveInt(req.query.userId);
    const event = stringOrNull(req.query.event, 160);
    const level = stringOrNull(req.query.level, 20);
    const entityType = stringOrNull(req.query.entityType, 80);

    const where = {};
    if (userId) where.userId = userId;
    if (event) where.event = event;
    if (level) where.level = level.toUpperCase();
    if (entityType) where.entityType = entityType;

    const [logs, events, entityTypes] = await Promise.all([
      prisma.businessLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true,
              o365Email: true,
              edEmail: true,
            },
          },
        },
      }),
      prisma.businessLog.findMany({
        distinct: ["event"],
        orderBy: { event: "asc" },
        select: { event: true },
        take: 250,
      }),
      prisma.businessLog.findMany({
        distinct: ["entityType"],
        where: { entityType: { not: null } },
        orderBy: { entityType: "asc" },
        select: { entityType: true },
        take: 250,
      }),
    ]);

    return res.json({
      filters: { take, userId, event, level, entityType },
      options: {
        events: events.map(row => row.event).filter(Boolean),
        entityTypes: entityTypes.map(row => row.entityType).filter(Boolean),
        levels: ["ERROR", "WARNING", "INFO", "VERBOSE"],
      },
      logs,
    });
  } catch (err) {
    log_technical(TECHNICAL_LEVELS.ERROR, "Business logs fetch failed", {
      error: err,
      userId: req.session?.user?.id,
      filters: req.query,
    });

    return res.status(500).json({
      error: "BUSINESS_LOGS_FETCH_FAILED",
      message: "Erreur lors du chargement des logs metier.",
    });
  }
});

module.exports = router;
