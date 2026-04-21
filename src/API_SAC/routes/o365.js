// src/API_SAC/routes/o365Auth.js

const express = require("express");
const router = express.Router();

const { msalClient } = require("../commons/msalClient");
const authConfig = require("../commons/authConfig");
const { prisma } = require("../commons/prisma");
const { returnEDAccount } = require("../commons/match_office_to_ed.js");

const { getHighestRoleFromGroups, mapToPrismaRole } = require("../commons/constants");

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
    // OPTIONAL ED PROFILE
    // =========================
    let edProfile = null;

    if (userInfo.jobTitle) {
      edProfile = await returnEDAccount(
        userInfo,
        userInfo.jobTitle.toLowerCase()
      );
    }

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
        avatarBase64 = `data:image/jpeg;base64,${buffer.toString("base64")}`;
      } else {
      }
    } catch (err) {
      console.warn("Error fetching profile picture:", err.message);
    }

    // =========================
    // UPSERT USER IN DB
    // =========================
    const dbUser = await prisma.user.upsert({
      where: {
        externalId: userInfo.id,
      },
      update: {
        email: userInfo.mail || userInfo.userPrincipalName,
        firstName: userInfo.givenName,
        lastName: userInfo.surname,
        role: role,
        avatar: avatarBase64,
      },
      create: {
        externalId: userInfo.id,
        email: userInfo.mail || userInfo.userPrincipalName,
        firstName: userInfo.givenName,
        lastName: userInfo.surname,
        role: role,
        avatar: avatarBase64,
      },
    });

    // =========================
    // LINK USER <-> STUDENT / TEACHER / STAFF (based on jobTitle)
    // =========================
    if (edProfile?.ED?.id && userInfo.jobTitle) {
      const edId = String(edProfile.ED.id);
      const job = userInfo.jobTitle.toUpperCase();

      try {
        // 🔥 CLEAN ALL PREVIOUS LINKS (important for idempotency)
        await prisma.student.updateMany({
          where: { userId: dbUser.id },
          data: { userId: null },
        });

        await prisma.teacher.updateMany({
          where: { userId: dbUser.id },
          data: { userId: null },
        });

        await prisma.staff.updateMany({
          where: { userId: dbUser.id },
          data: { userId: null },
        });

        // =========================
        // STUDENT
        // =========================
        if (job === "ELEVE") {
          await prisma.student.upsert({
            where: { externalId: edId },
            update: {
              userId: dbUser.id,
            },
            create: {
              externalId: edId,
              userId: dbUser.id,
            },
          });
        }

        // =========================
        // TEACHER
        // =========================
        else if (job === "PROFESSEUR" || job === "FORMATEUR") {
          await prisma.teacher.upsert({
            where: { externalId: edId },
            update: {
              userId: dbUser.id,
            },
            create: {
              externalId: edId,
              userId: dbUser.id,
            },
          });
        }

        // =========================
        // STAFF (PERSONNEL)
        // =========================
        else if (job === "PERSONNEL") {
          await prisma.staff.upsert({
            where: { externalId: edId },
            update: {
              userId: dbUser.id,
            },
            create: {
              externalId: edId,
              userId: dbUser.id,
            },
          });
        }

        // =========================
        // UNKNOWN ROLE
        // =========================
        else {
          console.warn("⚠️ Unsupported jobTitle for linking:", job);
        }

      } catch (err) {
        console.error("❌ Linking user failed:", err.message);
      }
    }

    // =========================
    // STORE SESSION
    // =========================
    req.session.user = {
      id: dbUser.id,
      externalId: dbUser.externalId,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      role: dbUser.role,
      roleConst: roleConst,
      groups: groups,
      edProfile: edProfile,
      avatar: dbUser.avatar
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
router.get("/me", (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ error: "Not logged in" });
  }

  res.json(req.session.user);
});

module.exports = router;