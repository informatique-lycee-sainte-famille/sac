const PDFDocument = require("pdfkit");
const path = require("path");

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
    doc.fontSize(8).fillColor("#777").text("Signature illisible", x + 5, y + 8, {
      width: width - 10,
      align: "center",
    });
    doc.fillColor("#000");
  }
}

function formatStatus(status) {
  return status === "present" ? "Present" : "Absent";
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
    .font(options.bold ? "Helvetica-Bold" : "Helvetica")
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

function drawHeader(doc, data) {
  try {
    doc.image(path.join(__dirname, "../front/public/ressources/logo1.png"), 40, 20, { width: 70 });
    doc.image(path.join(__dirname, "../front/public/ressources/logo2.png"), doc.page.width - 110, 20, { width: 70 });
  } catch {}

  doc.moveDown(2);
  doc.fontSize(16).font("Helvetica-Bold").text("FEUILLE D'EMARGEMENT", { align: "center" });
  doc.moveDown(0.6);
  doc.fontSize(10).font("Helvetica").text(`Classe: ${data.className}`, { align: "center" });
  doc.text(`Cours: ${data.courseLabel || "N/A"}`, { align: "center" });
  doc.text(`Salle: ${data.roomName || data.roomCode || "N/A"}`, { align: "center" });
  doc.text(`Date: ${formatDate(data.startTime)} - ${formatTime(data.startTime)} / ${formatTime(data.endTime)}`, { align: "center" });
  doc.text(`Generé par: ${data.author || "SAC"} le ${new Date().toLocaleString("fr-FR")}`, { align: "center" });
  if (data.finalization?.sentToEdAt) {
    doc
      .font("Helvetica-Bold")
      .fillColor("#166534")
      .text(`Appel envoye a EcoleDirecte le ${formatDateTime(data.finalization.sentToEdAt)}`, { align: "center" });
  } else {
    doc
      .font("Helvetica-Bold")
      .fillColor("#991b1b")
      .text("Appel non envoye a EcoleDirecte - feuille non finalisee", { align: "center" });
  }
  doc.font("Helvetica").fillColor("#000");
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

  doc.fontSize(12).font("Helvetica-Bold").text("ELEVES");
  y = doc.y + 8;

  drawCell(doc, startX, y, widths[0], 24, "Nom prenom", { bold: true, align: "center" });
  drawCell(doc, startX + widths[0], y, widths[1], 24, "Statut", { bold: true, align: "center" });
  drawCell(doc, startX + widths[0] + widths[1], y, widths[2], 24, "Scan NFC", { bold: true, align: "center" });
  drawCell(doc, startX + widths[0] + widths[1] + widths[2], y, widths[3], 24, "Signature du cours", { bold: true, align: "center" });
  y += 24;

  for (const student of data.students) {
    if (y + rowHeight > bottom) {
      doc.addPage();
      y = 40;
      drawCell(doc, startX, y, widths[0], 24, "Nom prenom", { bold: true, align: "center" });
      drawCell(doc, startX + widths[0], y, widths[1], 24, "Statut", { bold: true, align: "center" });
      drawCell(doc, startX + widths[0] + widths[1], y, widths[2], 24, "Scan NFC", { bold: true, align: "center" });
      drawCell(doc, startX + widths[0] + widths[1] + widths[2], y, widths[3], 24, "Signature du cours", { bold: true, align: "center" });
      y += 24;
    }

    drawCell(doc, startX, y, widths[0], rowHeight, `${student.lastName || ""} ${student.firstName || ""}`.trim());
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

  doc.fontSize(12).font("Helvetica-Bold").text("FORMATEUR / PROFESSEUR", startX, y);
  y += 20;

  const teacherName = `${data.teacher?.lastName || ""} ${data.teacher?.firstName || ""}`.trim();
  drawCell(doc, startX, y, widths[0], 60, teacherName);
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
        Title: "Feuille d'emargement",
        Author: "SAC",
        Subject: "Presences",
      },
    });

    const chunks = [];
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    render(doc);
    doc.end();
  });
}

function generateAttendancePdf(data) {
  return createPdfBuffer(doc => drawSessionPage(doc, data));
}

function generateDailyAttendancePdf(sessions) {
  return createPdfBuffer(doc => {
    sessions.forEach((session, index) => {
      drawSessionPage(doc, session, { addPage: index > 0 });
    });
  });
}

module.exports = generateAttendancePdf;
module.exports.generateAttendancePdf = generateAttendancePdf;
module.exports.generateDailyAttendancePdf = generateDailyAttendancePdf;
