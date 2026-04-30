# Security CI

La CI `Quality and Security` ajoute une base de contrôle sécurité et qualité sur chaque push et pull request vers `main`.

## Tests

- `npx --package=. sac-test-unit` lance les tests unitaires ciblés.
- `npx --package=. sac-test-integration` lance les tests d'intégration Express.
- `npx --package=. sac-test-performance` lance un smoke test de charge HTTP configurable.

Variables du test de charge:

- `LOAD_TEST_URL`: URL cible, par défaut `http://127.0.0.1:3000/`.
- `LOAD_TEST_REQUESTS`: nombre total de requêtes.
- `LOAD_TEST_CONCURRENCY`: concurrence.
- `LOAD_TEST_MAX_P95_MS`: seuil maximal du p95.
- `LOAD_TEST_MAX_ERROR_RATE`: taux d'erreur maximal.

## Sécurité

- `npm audit` bloque les vulnérabilités npm à partir de `moderate`, sauf allowlist explicite dans `tests/runners/security_audit.cli.js`.
- Gitleaks détecte les secrets committés.
- Snyk scanne les dépendances si le secret GitHub `SNYK_TOKEN` est configuré.
- Trivy scanne le dépôt et l'image Docker. Chaque scan produit d'abord un tableau lisible dans les logs, puis un SARIF uploadé dans GitHub Security.
- OWASP ZAP baseline scanne l'application démarrée localement par la CI.

L'allowlist npm actuelle couvre des advisories transitoires connues:

- `GHSA-92pp-h63x-v22m` via `prisma`/`@prisma/dev`/`@hono/node-server`.
- `GHSA-458j-xx4x-4375` via `hono`.
- `GHSA-w5hq-g745-h8pq` via `@azure/msal-node`/`uuid`.

Elles restent visibles dans l'audit brut, mais ne bloquent pas la CI tant que le correctif recommandé impose une rupture majeure non validée. Toute nouvelle advisory non allowlistée bloque le pipeline.

Le script autorise aussi les paquets parents concernés (`prisma`, `@prisma/dev`, `@hono/node-server`, `hono`, `@azure/msal-node`, `uuid`) lorsque `npm audit` les remonte par propagation sans répéter l'identifiant GHSA.

## Couverture OWASP Top 10

- A01 Broken Access Control: tests `require_access`, ZAP baseline, revue des routes protégées.
- A02 Cryptographic Failures: audit dépendances, contrôle des secrets, cookies `httpOnly`/`secure` en production.
- A03 Injection: ZAP baseline, CSP, tests d'intégration API.
- A04 Insecure Design: documentation des contrôles, tests d'intégration sur comportements attendus.
- A05 Security Misconfiguration: headers sécurité, ZAP, Trivy filesystem/image.
- A06 Vulnerable and Outdated Components: `npm audit`, Snyk, Trivy.
- A07 Identification and Authentication Failures: tests d'accès non authentifié et rôles.
- A08 Software and Data Integrity Failures: CI obligatoire, scans secrets, scan image.
- A09 Security Logging and Monitoring Failures: les logs techniques/métier restent côté application, la CI remonte SARIF pour les scans.
- A10 Server-Side Request Forgery: ZAP baseline et revue des points d'appel sortants sensibles.
