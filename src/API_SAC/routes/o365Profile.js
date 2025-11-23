const express = require("express");
const router = express.Router();

router.get("/me", async (req, res) => {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: "Not logged in" });
  }

  try {
    const response = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${req.session.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error("Graph API error:", await response.text());
      return res.status(response.status).json({ error: "Cannot fetch profile" });
    }

    const data = await response.json();
    data.edProfile = req.session.edProfile || null;
    res.json(data);
  } catch (err) {
    console.error("Fetch error:", err);
    res.status(500).json({ error: "Cannot fetch profile" });
  }
});

module.exports = router;
