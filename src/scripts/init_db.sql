CREATE TABLE "Presence_Absence" (
  "following_user_id" integer NOT NULL,
  "followed_user_id" integer NOT NULL,
  "created_at" timestamp
);

CREATE TABLE "Utilisateurs" (
  "id" integer PRIMARY KEY,
  "username" varchar,
  "role" varchar
);

CREATE TABLE "Etablissements" (
  "id" integer PRIMARY KEY,
  "code" varchar,
  "libelle" varchar,
  "rne" varchar,
  "degre" integer,
  "isTypeDevoirObligatoire" boolean,
  "isCoefModifiable" boolean,
  "isBorneModifiable" boolean,
  "borneMin" integer,
  "borneMax" integer,
  "moyenneSur" integer,
  "saisieLettre" boolean,
  "created_at" timestamp
);

CREATE TABLE "Etablissement_Parametres" (
  "id" integer PRIMARY KEY,
  "etab_id" integer NOT NULL,
  "isVisioEnable" boolean,
  "appelAvecEDT" boolean,
  "appelAvecGrilleHoraire" boolean,
  "created_at" timestamp
);

CREATE TABLE "Etablissement_GrilleHoraire" (
  "id" integer PRIMARY KEY,
  "etab_id" integer NOT NULL,
  "ordre" integer,
  "heure_debut" time,
  "heure_fin" time
);

CREATE TABLE "Niveaux" (
  "id" integer PRIMARY KEY,
  "etab_id" integer NOT NULL,
  "code" varchar,
  "libelle" varchar,
  "created_at" timestamp
);

CREATE TABLE "Classes" (
  "id" integer PRIMARY KEY,
  "niveau_id" integer NOT NULL,
  "code" varchar,
  "libelle" varchar,
  "idGroupe" integer,
  "isPP" boolean,
  "estNote" integer,
  "positionnementLSU" integer,
  "degre" integer,
  "idCycleEtab" integer,
  "pcpNbPeriode" integer,
  "pcpMoyAnnuelle" integer,
  "pcpMoyGenAnnee" integer,
  "pcpMoyPeriode" integer,
  "pcpMoyMatiere" integer,
  "created_at" timestamp
);

CREATE TABLE "Classe_PP" (
  "classe_id" integer NOT NULL,
  "utilisateur_id" integer,
  "type" varchar,
  "nom" varchar,
  "prenom" varchar,
  "created_at" timestamp
);

CREATE TABLE "Classe_Periodes" (
  "id" integer PRIMARY KEY,
  "classe_id" integer NOT NULL,
  "libelle" varchar,
  "created_at" timestamp
);

CREATE TABLE "Batiment" (
  "id" integer PRIMARY KEY,
  "username" varchar,
  "role" varchar,
  "created_at" timestamp
);

CREATE TABLE "Salle" (
  "id" integer PRIMARY KEY,
  "code" varchar,
  "libelle" varchar,
  "localisation" varchar,
  "idLocalisation" varchar,
  "isReservable" boolean,
  "batiment_id" integer,
  "role" varchar,
  "created_at" timestamp
);

CREATE TABLE "Groupes" (
  "id" integer PRIMARY KEY,
  "classe_id" integer NOT NULL,
  "code" varchar,
  "libelle" varchar,
  "created_at" timestamp
);

CREATE TABLE "Eleves" (
  "id" integer PRIMARY KEY,
  "nom" varchar,
  "particule" varchar,
  "prenom" varchar,
  "sexe" varchar,
  "classe_id" integer NOT NULL,
  "groupe_id" integer,
  "classeLibelle" varchar,
  "dateEntree" date,
  "dateSortie" date,
  "numeroBadge" varchar,
  "regime" varchar,
  "email" varchar,
  "portable" varchar,
  "photo" text,
  "dateNaissance" date,
  "estEnStage" boolean,
  "estApprenant" boolean,
  "dispense" boolean,
  "finDispense" date,
  "presenceObligatoire" boolean,
  "absentAvant" boolean,
  "created_at" timestamp
);

CREATE UNIQUE INDEX ON "Etablissements" ("code");

CREATE UNIQUE INDEX ON "Etablissements" ("rne");

CREATE UNIQUE INDEX ON "Etablissement_GrilleHoraire" ("etab_id", "ordre");

CREATE UNIQUE INDEX ON "Niveaux" ("etab_id", "code");

CREATE UNIQUE INDEX ON "Niveaux" ("etab_id", "libelle");

CREATE UNIQUE INDEX ON "Classes" ("niveau_id", "code");

CREATE UNIQUE INDEX ON "Classes" ("niveau_id", "libelle");

CREATE UNIQUE INDEX ON "Classe_PP" ("classe_id", "utilisateur_id", "nom", "prenom");

CREATE UNIQUE INDEX ON "Salle" ("code");

CREATE INDEX ON "Salle" ("isReservable");

CREATE UNIQUE INDEX ON "Groupes" ("classe_id", "code");

CREATE UNIQUE INDEX ON "Groupes" ("classe_id", "libelle");

CREATE INDEX ON "Eleves" ("classe_id", "nom", "prenom");

CREATE UNIQUE INDEX ON "Eleves" ("numeroBadge");

CREATE UNIQUE INDEX ON "Eleves" ("email");

ALTER TABLE "Presence_Absence" ADD FOREIGN KEY ("following_user_id") REFERENCES "Utilisateurs" ("id");

ALTER TABLE "Presence_Absence" ADD FOREIGN KEY ("followed_user_id") REFERENCES "Utilisateurs" ("id");

ALTER TABLE "Etablissement_Parametres" ADD FOREIGN KEY ("etab_id") REFERENCES "Etablissements" ("id");

ALTER TABLE "Etablissement_GrilleHoraire" ADD FOREIGN KEY ("etab_id") REFERENCES "Etablissements" ("id");

ALTER TABLE "Niveaux" ADD FOREIGN KEY ("etab_id") REFERENCES "Etablissements" ("id");

ALTER TABLE "Classes" ADD FOREIGN KEY ("niveau_id") REFERENCES "Niveaux" ("id");

ALTER TABLE "Classe_PP" ADD FOREIGN KEY ("classe_id") REFERENCES "Classes" ("id");

ALTER TABLE "Classe_PP" ADD FOREIGN KEY ("utilisateur_id") REFERENCES "Utilisateurs" ("id");

ALTER TABLE "Classe_Periodes" ADD FOREIGN KEY ("classe_id") REFERENCES "Classes" ("id");

ALTER TABLE "Salle" ADD FOREIGN KEY ("batiment_id") REFERENCES "Batiment" ("id");

ALTER TABLE "Groupes" ADD FOREIGN KEY ("classe_id") REFERENCES "Classes" ("id");

ALTER TABLE "Eleves" ADD FOREIGN KEY ("classe_id") REFERENCES "Classes" ("id");

ALTER TABLE "Eleves" ADD FOREIGN KEY ("groupe_id") REFERENCES "Groupes" ("id");
