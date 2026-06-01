// ./API_SAC/commons/prisma.common.js
// Importe le client Prisma généré (ORM pour interagir avec la base de données)
const { PrismaClient } = require("../../generated/prisma");
// Importe l'adaptateur PostgreSQL pour Prisma (utilise le driver pg natif)
const { PrismaPg } = require("@prisma/adapter-pg");

// Crée un adaptateur PostgreSQL en utilisant l'URL de connexion depuis les variables d'environnement
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL, // URL de connexion à la base PostgreSQL
});

// Crée une instance unique du client Prisma avec l'adaptateur PostgreSQL
const prisma = new PrismaClient({ adapter });

// Exporte l'instance Prisma pour pouvoir l'utiliser dans tout le projet
module.exports = { prisma };