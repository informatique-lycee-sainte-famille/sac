// src/API_SAC/routes/o365.js

const sharp = require("sharp");
const express = require("express");
const router = express.Router();

const { msalClient } = require("../commons/msalClient");
const authConfig = require("../commons/authConfig");
const { prisma } = require("../commons/prisma");
const { returnEDAccount } = require("../commons/match_office_to_ed.js");

const { getHighestRoleFromGroups, mapToPrismaRole, ROLES } = require("../commons/constants");
const require_access = require("../middlewares/require_access");

// =========================
// LOGIN
// =========================
router.get("/login", async (req, res) => {
  const authUrl = await msalClient.getAuthCodeUrl({
    redirectUri: authConfig.redirectUri,
    scopes: authConfig.scopes,
    prompt: "login",
  });

  res.redirect(authUrl);
});

// =========================
// REDIRECT (LOGIN CALLBACK)
// =========================
router.get("/redirect", async (req, res) => {
  try {
    const tokenResponse = await msalClient.acquireTokenByCode({
      code: req.query.code,
      redirectUri: authConfig.redirectUri,
      scopes: authConfig.scopes,
    });

    // Get user info
    const userInfoResponse = await msalClient.acquireTokenSilent({
      account: tokenResponse.account,
      scopes: ["User.Read"],
    });

    const userInfo = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${userInfoResponse.accessToken}`,
      },
    }).then(res => res.json());

    // console.log("User info:", userInfo);

    // =========================
    // FETCH GROUPS
    // =========================
    const groupsResponse = await fetch(
      "https://graph.microsoft.com/v1.0/me/memberOf",
      {
        headers: {
          Authorization: `Bearer ${userInfoResponse.accessToken}`,
        },
      }
    );

    const groupsData = await groupsResponse.json();

    const groups = (groupsData.value || [])
      .filter(group =>
        group["@odata.type"] === "#microsoft.graph.group" &&
        group.displayName &&
        group.displayName.startsWith("SAC_")
      )
      .map(group => ({
        id: group.id,
        name: group.displayName,
      }));

    // =========================
    // ROLE FROM GROUPS
    // =========================
    const roleConst = getHighestRoleFromGroups(groups);
    const role = mapToPrismaRole(roleConst);

    // =========================
    // OPTIONAL ED PROFILE
    // =========================
    let edProfile = null;

    if (roleConst) {
      edProfile = await returnEDAccount(
        userInfo,
        roleConst,
      );
    }

    let avatarBase64 = null;

    try {
      const photoResponse = await fetch(
        "https://graph.microsoft.com/v1.0/me/photo/$value",
        {
          headers: {
            Authorization: `Bearer ${userInfoResponse.accessToken}`,
          },
        }
      );

      if (photoResponse.ok) {
        const buffer = Buffer.from(await photoResponse.arrayBuffer());
        const compressedBuffer = await sharp(buffer)
          .resize(50, 50, { fit: "cover" })
          .jpeg({ quality: 85 })
          .toBuffer();

        avatarBase64 = `data:image/jpeg;base64,${compressedBuffer.toString("base64")}`;
      }
    } catch (err) {
      console.warn("Error fetching profile picture:", err.message);
    }

    // =========================
    // UPSERT USER IN DB
    // =========================
    let dbUser = null;

    const edId = edProfile?.ED?.id ? String(edProfile.ED.id) : null;

    // =========================
    // CASE 1: ED MATCH FOUND
    // =========================
    if (edId) {
      const existingUser = await prisma.user.findUnique({
        where: { edId },
      });

      if (existingUser) {
        // 🔥 UPDATE existing ED user
        dbUser = await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            o365Id: userInfo.id,
            o365Email: userInfo.mail || userInfo.userPrincipalName,
            firstName: userInfo.givenName,
            lastName: userInfo.surname,
            role,
            o365AvatarB64: avatarBase64,
            edEmail: edProfile?.ED?.email || null,
          },
        });
      } else {
        // ⚠️ ED user not in DB (unexpected but possible)
        dbUser = await prisma.user.create({
          data: {
            edId,
            o365Id: userInfo.id,
            o365Email: userInfo.mail || userInfo.userPrincipalName,
            firstName: userInfo.givenName,
            lastName: userInfo.surname,
            role,
            o365AvatarB64: avatarBase64,
            edEmail: edProfile?.ED?.email || null,
          },
        });
      }
    }

    // =========================
    // CASE 2: NO ED MATCH
    // =========================
    else {
      dbUser = await prisma.user.upsert({
        where: { o365Id: userInfo.id },
        update: {
          o365Email: userInfo.mail || userInfo.userPrincipalName,
          firstName: userInfo.givenName,
          lastName: userInfo.surname,
          role,
          o365AvatarB64: avatarBase64,
        },
        create: {
          o365Id: userInfo.id,
          o365Email: userInfo.mail || userInfo.userPrincipalName,
          firstName: userInfo.givenName,
          lastName: userInfo.surname,
          role,
          o365AvatarB64: avatarBase64,
        },
      });
    }


    // =========================
    // STORE SESSION
    // =========================
    req.session.user = {
      id: dbUser.id,
      o365Id: dbUser.o365Id,
      edId: dbUser.edId,
      email: dbUser.o365Email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      role: dbUser.role,
      roleConst: roleConst,
      groups: userInfo.groups,
      edProfile: edProfile,
      avatar: dbUser.o365AvatarB64,
    };

    req.session.account = tokenResponse.account;

    req.session.save(() => {
      res.redirect("/");
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Login failed");
  }
});

// =========================
// LOGOUT
// =========================
router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// =========================
// CURRENT USER
// =========================
router.get("/me", require_access({ minRole: ROLES.STUDENT }), async (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ error: "Not logged in" });
  }

  res.json(req.session.user);
});

module.exports = router;