//app.js

require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const session = require("express-session");
const { sessionOptions } = require("./commons/sessionConfig");

const testRoutes = require("./routes/test");
const o365AuthRoutes = require("./routes/o365Auth");
const o365ProfileRoutes = require("./routes/o365Profile");
const nfcRoutes = require("./routes/nfc");

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(session(sessionOptions));

// mount routes

app.use("/api", testRoutes);
app.use("/api/auth", o365AuthRoutes);
app.use("/api/profile", o365ProfileRoutes);
app.use("/api/nfc", nfcRoutes);

// Serve static files from the React frontend app
app.use(express.static(path.join(__dirname, "../front/public"),
  { extensions: ['html', 'json', 'png', 'svg', 'js', 'css'], dotfiles: 'allow' }));

const server = app.listen(port, () => {
  console.log(`SAC server is running on http://localhost:${port}`);
});
