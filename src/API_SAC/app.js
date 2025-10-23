//app.js

require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");

const testRoutes = require("./routes/test");

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

// mount routes

app.use("/api", testRoutes);
// app.use('/web', express.static('src/web'));

const server = app.listen(port, () => {
  console.log(`SAC server is running on http://localhost:${port}`);
});
