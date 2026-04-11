// src/API_SAC/routes/o365Auth.js
const express = require("express");
const router = express.Router();
const { msalClient } = require("../commons/msalClient");
const authConfig = require("../commons/authConfig");
const { returnEDAccount } = require("../commons/match_office_to_ed.js");

router.get("/login", async (req, res) => {
  const authUrl = await msalClient.getAuthCodeUrl({
    redirectUri: authConfig.redirectUri,
    scopes: authConfig.scopes,
  });
  res.redirect(authUrl);
});

router.get("/redirect", async (req, res) => {
  try {
    const tokenResponse = await msalClient.acquireTokenByCode({
      code: req.query.code,
      redirectUri: authConfig.redirectUri,
      scopes: authConfig.scopes,
    });
    // get user info (https://graph.microsoft.com/v1.0/me) in order to get jobtitle
    const userInfoResponse = await msalClient.acquireTokenSilent({
      account: tokenResponse.account,
      scopes: ["User.Read"],
    });
    const userInfo = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${userInfoResponse.accessToken}`,
      },
    }).then(res => res.json());

    if(userInfo.jobTitle) {
        console.log(`User is a ${userInfo.jobTitle}`);
        console.log("User info:", userInfo);
        const edProfile = await returnEDAccount(userInfo, userInfo.jobTitle.toLowerCase());
        req.session.edProfile = edProfile;
    }
    req.session.account = tokenResponse.account;
    req.session.userInfo = userInfo;
    req.session.accessToken = tokenResponse.accessToken;

    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).send("Login failed");
  }
});

router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

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
