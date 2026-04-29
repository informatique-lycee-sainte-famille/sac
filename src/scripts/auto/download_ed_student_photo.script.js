// ./scripts/auto/download_ed_student_photo.script.js
require("../../API_SAC/commons/env.common");
const sharp = require("sharp");
const { prisma } = require("../../API_SAC/commons/prisma.common");
const { LOG_DESTINATIONS, TECHNICAL_LEVELS, log_business, log_technical } = require("../../API_SAC/commons/logger.common");

const DEFAULT_DELAY_MS = 1000;
const DEFAULT_LIMIT = 500;
const DEFAULT_TIMEOUT_MS = 15000;

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, "").split("=");
    args[key] = value || true;
  }
  return args;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeUrl(url) {
  if (!url) return null;
  if (url.startsWith("//")) return `https:${url}`;
  return url;
}

async function compressImageToBase64(buffer) {
  const compressedBuffer = await sharp(buffer)
    .resize(50, 50, { fit: "cover" })
    .jpeg({ quality: 85 })
    .toBuffer();

  return `data:image/jpeg;base64,${compressedBuffer.toString("base64")}`;
}

async function fetchEdPhoto(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const response = await fetch(url, {
    signal: controller.signal,
    headers: {
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "accept-language": "fr-FR,fr;q=0.8",
      referer: "https://www.ecoledirecte.com/",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    },
  }).finally(() => clearTimeout(timeout));

  if (response.status === 404) {
    return { status: "not_found" };
  }

  if (!response.ok) {
    return { status: "failed", httpStatus: response.status };
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    return { status: "failed", httpStatus: response.status, reason: `Unexpected content-type ${contentType}` };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    status: "ok",
    b64: await compressImageToBase64(buffer),
  };
}

async function process_ed_photo_student(student, options = {}) {
  const photoUrl = normalizeUrl(student?.edPhotoUrl);
  if (!student || student.role !== "student" || !photoUrl) {
    return { status: "skipped", studentId: student?.id || null };
  }

  try {
    const result = await fetchEdPhoto(photoUrl, options.timeoutMs || DEFAULT_TIMEOUT_MS);

    if (result.status === "ok") {
      await prisma.user.update({
        where: { id: student.id },
        data: {
          edPhotoUrl: null,
          edPhotoB64: result.b64,
        },
      });

      await log_business("ed_student_photo_cached", "Photo ED eleve mise en cache en base.", {
        destination: LOG_DESTINATIONS.DATABASE,
        userId: student.id,
        entityType: "User",
        entityId: student.id,
      });

      return { status: "cached", studentId: student.id };
    }

    if (result.status === "not_found") {
      await prisma.user.update({
        where: { id: student.id },
        data: {
          edPhotoUrl: null,
          edPhotoB64: null,
        },
      });

      await log_business("ed_student_photo_not_found", "Photo ED eleve introuvable, URL invalidee.", {
        destination: LOG_DESTINATIONS.DATABASE,
        userId: student.id,
        entityType: "User",
        entityId: student.id,
        metadata: { previousUrl: photoUrl },
      });

      return { status: "not_found", studentId: student.id };
    }

    log_technical(TECHNICAL_LEVELS.WARNING, "ED student photo download failed", {
      studentId: student.id,
      httpStatus: result.httpStatus,
      reason: result.reason,
    });
    return { status: "failed", studentId: student.id, httpStatus: result.httpStatus };
  } catch (error) {
    log_technical(TECHNICAL_LEVELS.WARNING, "ED student photo download errored", {
      studentId: student.id,
      error,
    });
    return { status: "failed", studentId: student.id };
  }
}

async function findStudent(args) {
  const id = args.studentId ? Number.parseInt(args.studentId, 10) : null;
  if (Number.isInteger(id)) {
    return prisma.user.findFirst({
      where: { id, role: "student" },
    });
  }

  if (args.edId) {
    return prisma.user.findFirst({
      where: { edId: String(args.edId), role: "student" },
    });
  }

  return null;
}

async function process_ed_photo_queue(options = {}) {
  const limit = Number.parseInt(options.limit || DEFAULT_LIMIT, 10);
  const delayMs = Number.parseInt(options.delayMs || DEFAULT_DELAY_MS, 10);
  const timeoutMs = Number.parseInt(options.timeoutMs || DEFAULT_TIMEOUT_MS, 10);
  const students = await prisma.user.findMany({
    where: {
      role: "student",
      edPhotoUrl: { not: null },
    },
    orderBy: { id: "asc" },
    take: Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIMIT,
  });
  const summary = {
    total: students.length,
    cached: 0,
    notFound: 0,
    failed: 0,
    skipped: 0,
  };

  for (const student of students) {
    const result = await process_ed_photo_student(student, { timeoutMs });
    if (result.status === "cached") summary.cached += 1;
    else if (result.status === "not_found") summary.notFound += 1;
    else if (result.status === "failed") summary.failed += 1;
    else summary.skipped += 1;

    await sleep(delayMs);
  }

  await log_business("ed_student_photo_cache_completed", "Cache des photos ED eleves termine.", {
    destination: LOG_DESTINATIONS.BOTH,
    entityType: "User",
    metadata: summary,
  });

  return summary;
}

async function main() {
  const args = parseArgs();
  if (args.studentId || args.edId) {
    const student = await findStudent(args);
    const result = await process_ed_photo_student(student);
    log_technical(TECHNICAL_LEVELS.INFO, "ED student photo processed", result);
    return;
  }

  const summary = await process_ed_photo_queue({
    limit: args.limit,
    delayMs: args.delayMs,
    timeoutMs: args.timeoutMs,
  });
  log_technical(TECHNICAL_LEVELS.INFO, "ED student photo queue processed", summary);
}

if (require.main === module) {
  main()
    .catch(error => {
      log_technical(TECHNICAL_LEVELS.ERROR, "ED student photo cache script failed", { error });
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = {
  process_ed_photo_queue,
  process_ed_photo_student,
};
