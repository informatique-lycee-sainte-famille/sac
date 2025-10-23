// src/routes/test.js
const express = require("express");
const router = express.Router();

router.get("/test", async (req, res) => {
  res.json({
    message: `Yo test route works!`,
  });
});

module.exports = router;
