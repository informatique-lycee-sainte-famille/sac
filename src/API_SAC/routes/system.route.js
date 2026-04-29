// ./API_SAC/routes/system.route.js
const express = require("express");
const router = express.Router();

router.get("/test", (req, res) => {
  res.json({ message: "API is running" });
});

module.exports = router;