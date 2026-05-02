// ./scripts/auto/generate_attendance_pdf.script.js
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const FONT_REGULAR = "SAC-Regular";
const FONT_BOLD = "SAC-Bold";

function findFirstExistingPath(paths) {
  return paths.find(filePath => {
    try {
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }) || null;
}

function registerUnicodeFonts(doc) {
  const regularFont = findFirstExistingPath([
    process.env.PDF_FONT_REGULAR_PATH,
    path.join(__dirname, "../../front/public/resources/fonts/DejaVuSans.ttf"),
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    "C:/Windows/Fonts/arial.ttf",
  ].filter(Boolean));
  const boldFont = findFirstExistingPath([
    process.env.PDF_FONT_BOLD_PATH,
    path.join(__dirname, "../../front/public/resources/fonts/DejaVuSans-Bold.ttf"),
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
  ].filter(Boolean));

  if (!regularFont) {
    return { regular: "Helvetica", bold: "Helvetica-Bold" };
  }

  doc.registerFont(FONT_REGULAR, regularFont);
  doc.registerFont(FONT_BOLD, boldFont || regularFont);
  return { regular: FONT_REGULAR, bold: FONT_BOLD };
}

function formatDate(value) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return "";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date(value));
}

function stripImagePrefix(signature) {
  return signature.replace(/^data:image\/\w+;base64,/, "");
}

function drawSignature(doc, signature, x, y, width, height) {
  if (!signature) return;

  try {
    const buffer = Buffer.from(stripImagePrefix(signature), "base64");
    doc.image(buffer, x + 5, y + 5, {
      fit: [width - 10, height - 10],
      align: "center",
      valign: "center",
    });
  } catch {
    doc.font(doc.sacFonts.regular).fontSize(8).fillColor("#777").text("Signature illisible", x + 5, y + 8, {
      width: width - 10,
      align: "center",
    });
    doc.fillColor("#000");
  }
}

function formatStatus(status) {
  return status === "present" ? "Présent" : "Absent";
}

function formatScanTime(value) {
  if (!value) return "";

  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date(value));
}

function drawCell(doc, x, y, width, height, text, options = {}) {
  doc.rect(x, y, width, height).stroke();
  doc
    .font(options.bold ? doc.sacFonts.bold : doc.sacFonts.regular)
    .fontSize(options.fontSize || 9)
    .fillColor(options.color || "#000")
    .text(text || "", x + 5, y + 6, {
      width: width - 10,
      height: height - 8,
      align: options.align || "left",
      valign: options.valign || "center",
    });
  doc.fillColor("#000");
}

function formatNameWithComment(person) {
  const name = `${person.lastName || ""} ${person.firstName || ""}`.trim();
  return person.comment ? `${name}\nNote: ${person.comment}` : name;
}

function drawHeader(doc, data) {
  try {
    doc.image(path.join(__dirname, "../../front/public/resources/logo1.png"), 40, 20, { width: 70 });
    doc.image(path.join(__dirname, "../../front/public/resources/logo2.png"), doc.page.width - 110, 20, { width: 70 });
  } catch {}

  doc.moveDown(2);
  doc.fontSize(16).font(doc.sacFonts.bold).text("FEUILLE D'ÉMARGEMENT", { align: "center" });
  doc.moveDown(0.6);
  doc.fontSize(10).font(doc.sacFonts.regular).text(`Classe : ${data.className}`, { align: "center" });
  doc.text(`Cours: ${data.courseLabel || "N/A"}`, { align: "center" });
  doc.text(`Salle : ${data.roomName || data.roomCode || "N/A"}`, { align: "center" });
  doc.text(`Date : ${formatDate(data.startTime)} - ${formatTime(data.startTime)} / ${formatTime(data.endTime)}`, { align: "center" });
  doc.text(`Généré par : ${data.author || "SAC"} le ${new Date().toLocaleString("fr-FR")}`, { align: "center" });
  if (data.finalization?.sentToEdAt) {
    doc
      .font(doc.sacFonts.bold)
      .fillColor("#166534")
      .text(`Appel envoyé à EcoleDirecte le ${formatDateTime(data.finalization.sentToEdAt)}`, { align: "center" });
  } else {
    doc
      .font(doc.sacFonts.bold)
      .fillColor("#991b1b")
      .text("Appel non envoyé à EcoleDirecte - feuille non finalisée", { align: "center" });
  }
  doc.font(doc.sacFonts.regular).fillColor("#000");
  doc.moveDown(1.5);
}

function drawSessionPage(doc, data, options = {}) {
  if (options.addPage) doc.addPage();

  drawHeader(doc, data);

  const startX = 40;
  let y = doc.y;
  const usableWidth = doc.page.width - 80;
  const rowHeight = 52;
  const bottom = doc.page.height - 60;
  const widths = [usableWidth * 0.34, usableWidth * 0.15, usableWidth * 0.18, usableWidth * 0.33];

  doc.fontSize(12).font(doc.sacFonts.bold).text("ÉLÈVES");
  y = doc.y + 8;

  drawCell(doc, startX, y, widths[0], 24, "Nom prénom", { bold: true, align: "center" });
  drawCell(doc, startX + widths[0], y, widths[1], 24, "Statut", { bold: true, align: "center" });
  drawCell(doc, startX + widths[0] + widths[1], y, widths[2], 24, "Scan NFC", { bold: true, align: "center" });
  drawCell(doc, startX + widths[0] + widths[1] + widths[2], y, widths[3], 24, "Signature du cours", { bold: true, align: "center" });
  y += 24;

  for (const student of data.students) {
    if (y + rowHeight > bottom) {
      doc.addPage();
      y = 40;
      drawCell(doc, startX, y, widths[0], 24, "Nom prénom", { bold: true, align: "center" });
      drawCell(doc, startX + widths[0], y, widths[1], 24, "Statut", { bold: true, align: "center" });
      drawCell(doc, startX + widths[0] + widths[1], y, widths[2], 24, "Scan NFC", { bold: true, align: "center" });
      drawCell(doc, startX + widths[0] + widths[1] + widths[2], y, widths[3], 24, "Signature du cours", { bold: true, align: "center" });
      y += 24;
    }

    drawCell(doc, startX, y, widths[0], rowHeight, formatNameWithComment(student), { fontSize: student.comment ? 8 : 9 });
    drawCell(doc, startX + widths[0], y, widths[1], rowHeight, formatStatus(student.status), {
      align: "center",
    });
    drawCell(doc, startX + widths[0] + widths[1], y, widths[2], rowHeight, formatScanTime(student.scannedAt), {
      align: "center",
    });
    doc.rect(startX + widths[0] + widths[1] + widths[2], y, widths[3], rowHeight).stroke();
    drawSignature(doc, student.signature, startX + widths[0] + widths[1] + widths[2], y, widths[3], rowHeight);
    y += rowHeight;
  }

  if (y + 95 > bottom) {
    doc.addPage();
    y = 40;
  } else {
    y += 22;
  }

  doc.fontSize(12).font(doc.sacFonts.bold).text("FORMATEUR / PROFESSEUR", startX, y);
  y += 20;

  drawCell(doc, startX, y, widths[0], 60, formatNameWithComment(data.teacher || {}), { fontSize: data.teacher?.comment ? 8 : 9 });
  drawCell(doc, startX + widths[0], y, widths[1], 60, formatStatus(data.teacher?.status), { align: "center" });
  drawCell(doc, startX + widths[0] + widths[1], y, widths[2], 60, formatScanTime(data.teacher?.scannedAt), { align: "center" });
  doc.rect(startX + widths[0] + widths[1] + widths[2], y, widths[3], 60).stroke();
  drawSignature(doc, data.teacher?.signature, startX + widths[0] + widths[1] + widths[2], y, widths[3], 60);
}

function createPdfBuffer(render) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      info: {
        Title: "Feuille d'émargement",
        Author: "SAC",
        Subject: "Présences",
      },
    });
    doc.sacFonts = registerUnicodeFonts(doc);

    const chunks = [];
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    render(doc);
    doc.end();
  });
}

function generate_attendance_pdf(data) {
  return createPdfBuffer(doc => drawSessionPage(doc, data));
}

function generate_daily_attendance_pdf(sessions) {
  return createPdfBuffer(doc => {
    sessions.forEach((session, index) => {
      drawSessionPage(doc, session, { addPage: index > 0 });
    });
  });
}

module.exports = generate_attendance_pdf;
module.exports.generate_attendance_pdf = generate_attendance_pdf;
module.exports.generate_daily_attendance_pdf = generate_daily_attendance_pdf;
