//app.js

require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const session = require("express-session");
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');
const { sessionOptions } = require("./commons/sessionConfig");

const testRoutes = require("./routes/test");
const o365AuthRoutes = require("./routes/o365Auth");
const o365ProfileRoutes = require("./routes/o365Profile");
const nfcRoutes = require("./routes/nfc");

const app = express();
const port = process.env.PORT || 3000;
const env = process.env.ENV || 'dev';

// Set the correct host based on the environment
try {
    if (env === 'dev') {
        swaggerDocument.host = `localhost:${port}`;
        swaggerDocument.schemes = ['http'];
    } else if (env === 'prod') {
        swaggerDocument.host = process.env.EXTERNAL_DOMAIN.split('://')[1];
        swaggerDocument.schemes = [process.env.EXTERNAL_DOMAIN.split('://')[0]];
    }
} catch (error) {
    console.error("Erreur lors de la configuration de Swagger:", error.message);
}

//// DOCS ROUTE ////
try {
    app.use('/api/documentation', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} catch (error) {
    console.error("Erreur lors de la configuration de Swagger UI:", error.message);
}
//// DOCS ROUTE ////

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
