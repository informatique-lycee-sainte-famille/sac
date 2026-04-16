const PDFDocument = require("pdfkit");
const path = require("path");

function generateAttendancePdf(res, data) {
  const doc = new PDFDocument({ margin: 40 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "inline; filename=attendance.pdf");
  doc.pipe(res);

  // =========================
  // HEADER
  // =========================
  try {
    doc.image(path.join(__dirname, "../front/public/ressources/logo1.png"), 40, 20, { width: 80 });
    doc.image(path.join(__dirname, "../front/public/ressources/logo2.png"), doc.page.width - 120, 20, { width: 80 });
  } catch (e) {}

  doc.moveDown(2);

  doc.fontSize(16).text("FEUILLE D'ÉMARGEMENT", { align: "center" });

  doc.moveDown();

  doc.fontSize(10)
    .text(`Classe: ${data.className}`, { align: "center" })
    .text(`Année: ${data.year}`, { align: "center" })
    .text(`Date: ${data.date}`, { align: "center" });

  doc.moveDown(2);

  // =========================
  // STUDENT SECTION TITLE
  // =========================
  doc.fontSize(12).font("Helvetica-Bold").text("ÉLÈVES");
  doc.moveDown(0.5);

  const startX = 40;
  let startY = doc.y;

  const usableWidth = doc.page.width - 80;
  const colWidths = [
    usableWidth * 0.5,
    usableWidth * 0.25,
    usableWidth * 0.25,
  ];

  const rowHeight = 49;
  const PAGE_BOTTOM = doc.page.height - 60;

  const headers = ["NOM Prénom", "MATIN", "APRES-MIDI"];

  drawRow(doc, startX, startY, colWidths, rowHeight, headers, true);
  startY += rowHeight;

  // =========================
  // STUDENTS
  // =========================
  data.students.forEach((student) => {

    if (startY + rowHeight > PAGE_BOTTOM) {
      doc.addPage();
      startY = 40;

      // Section title again
      doc.fontSize(12).font("Helvetica-Bold").text("ÉLÈVES");
      doc.moveDown(0.5);

      startY = doc.y;

      drawRow(doc, startX, startY, colWidths, rowHeight, headers, true);
      startY += rowHeight;
    }

    const row = [
      `${student.lastName} ${student.firstName}`,
      student.morning_signature || "",
      student.afternoon_signature || "",
    ];

    drawStudentRow(doc, startX, startY, colWidths, rowHeight, student);
    startY += rowHeight;
  });

  // =========================
  // SPACE BEFORE TEACHERS
  // =========================
  if (startY + 140 > PAGE_BOTTOM) {
    doc.addPage();
    startY = 40;
  }

  startY += 20; // spacing after last student row

    doc
    .fontSize(12)
    .font("Helvetica-Bold")
    .text("FORMATEURS - SIGNATURES", startX, startY);

    startY += 20;

  const teacherWidths = new Array(data.teachers.length).fill(
    usableWidth / data.teachers.length
  );

  // =========================
  // PERIOD ROW
  // =========================
  drawRow(
    doc,
    startX,
    startY,
    teacherWidths,
    20,
    data.teachers.map(t => t.period),
    true
  );

  startY += 20;

  // =========================
  // NAME ROW
  // =========================
  drawRow(
    doc,
    startX,
    startY,
    teacherWidths,
    20,
    data.teachers.map(t => `${t.lastName.toUpperCase()} ${t.firstName}`)
  );

  startY += 20;

  // =========================
  // SIGNATURE BOXES
  // =========================
  let currentX = startX;

  data.teachers.forEach((t, i) => {
    const width = teacherWidths[i];

    doc.rect(currentX, startY, width, 60).stroke();

    if (t.signature) {
      try {
        const base64Data = t.signature.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");

        doc.image(buffer, currentX + 5, startY + 5, {
          fit: [width - 10, 50],
          align: "center",
        });
      } catch (e) {}
    }

    currentX += width;
  });

  doc.end();
}

// =========================
// DRAW ROW
// =========================
function drawRow(doc, x, y, colWidths, height, row, isHeader = false) {
  let currentX = x;

  row.forEach((cell, i) => {
    const width = colWidths[i];

    doc.rect(currentX, y, width, height).stroke();

    doc
      .font(isHeader ? "Helvetica-Bold" : "Helvetica")
      .fontSize(9)
      .text(cell, currentX + 5, y + height / 2 - 5, {
        width: width - 10,
        align: "center",
      });

    currentX += width;
  });
}

function drawStudentRow(doc, x, y, colWidths, height, student) {
  let currentX = x;

  // =========================
  // NAME CELL
  // =========================
  doc.rect(currentX, y, colWidths[0], height).stroke();

  doc
    .font("Helvetica")
    .fontSize(9)
    .text(
      `${student.lastName.toUpperCase()} ${student.firstName}`,
      currentX + 5,
      y + height / 2 - 5,
      {
        width: colWidths[0] - 10,
        align: "center",
      }
    );

  currentX += colWidths[0];

  // =========================
  // SIGNATURE CELLS
  // =========================
  ["morning_signature", "afternoon_signature"].forEach((key, i) => {
    const width = colWidths[i + 1];

    doc.rect(currentX, y, width, height).stroke();

    const signature = student[key];

    if (signature) {
      try {
        const base64Data = signature.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");

        doc.image(buffer, currentX + 5, y + 5, {
          fit: [width - 10, height - 10],
          align: "center",
          valign: "center",
        });
      } catch (e) {
        console.warn("Invalid student signature");
      }
    }

    currentX += width;
  });
}

module.exports = generateAttendancePdf;