// ./API_SAC/routes/o365.route.js
const sharp = require("sharp");
const crypto = require("crypto");
const express = require("express");
const router = express.Router();

const { msal_client } = require("../commons/msal_client.common");
const auth_config = require("../commons/auth_config.common");
const { prisma } = require("../commons/prisma.common");
const { return_ed_account } = require("../commons/match_office_to_ed.common.js");
const { format_session_user } = require("../commons/session_user.common");
const { LOG_DESTINATIONS, TECHNICAL_LEVELS, log_business, log_technical } = require("../commons/logger.common");

const { get_highest_role_from_groups, map_to_prisma_role, ROLES } = require("../commons/constants.common");

router.get("/login", async (req, res) => {
  const state = crypto.randomBytes(24).toString("base64url");
  req.session.oauthState = state;

  const authUrl = await msal_client.getAuthCodeUrl({
    redirectUri: auth_config.redirectUri,
    scopes: auth_config.scopes,
    prompt: "login",
    state,
  });

  res.redirect(authUrl);
});

router.get("/redirect", async (req, res) => {
  try {
    if (!req.query.state || req.query.state !== req.session?.oauthState) {
      return res.status(403).send("Invalid login state");
    }
    delete req.session.oauthState;

    const tokenResponse = await msal_client.acquireTokenByCode({
      code: req.query.code,
      redirectUri: auth_config.redirectUri,
      scopes: auth_config.scopes,
    });

    const userInfoResponse = await msal_client.acquireTokenSilent({
      account: tokenResponse.account,
      scopes: ["User.Read"],
    });

    const userInfo = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${userInfoResponse.accessToken}`,
      },
    }).then(res => res.json());

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

    const roleConst = get_highest_role_from_groups(groups);
    const role = map_to_prisma_role(roleConst);

    let edProfile = null;

    if (roleConst) {
      edProfile = await return_ed_account(
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
      log_technical(TECHNICAL_LEVELS.WARNING, "Office 365 profile picture fetch failed", { error: err });
    }

    let dbUser = null;

    const edId = edProfile?.ED?.id ? String(edProfile.ED.id) : null;
    const edEmail = edProfile?.ED?.email || null;
    const baseUserUpdate = {
      o365Id: userInfo.id,
      o365Email: userInfo.mail || userInfo.userPrincipalName,
      firstName: userInfo.givenName,
      lastName: userInfo.surname,
      role,
    };

    if (avatarBase64) {
      baseUserUpdate.o365AvatarB64 = avatarBase64;
    }

    if (edEmail !== null) {
      baseUserUpdate.edEmail = edEmail;
    }

    if (edId) {
      const existingUser = await prisma.user.findUnique({
        where: { edId },
      });

      if (existingUser) {
        // Keep the ED-created record as the source of identity, then attach O365 data to it.
        dbUser = await prisma.user.update({
          where: { id: existingUser.id },
          data: baseUserUpdate,
        });
      } else {
        dbUser = await prisma.user.create({
          data: {
            edId,
            o365Id: userInfo.id,
            o365Email: userInfo.mail || userInfo.userPrincipalName,
            firstName: userInfo.givenName,
            lastName: userInfo.surname,
            role,
            o365AvatarB64: avatarBase64,
            edEmail,
          },
        });
      }
    }

    else {
      dbUser = await prisma.user.upsert({
        where: { o365Id: userInfo.id },
        update: baseUserUpdate,
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

    dbUser = await prisma.user.findUnique({
      where: { id: dbUser.id },
      include: { class: true },
    });

    await new Promise((resolve, reject) => {
      req.session.regenerate(err => {
        if (err) reject(err);
        else resolve();
      });
    });

    req.session.user = format_session_user(dbUser, {}, roleConst, userInfo.groups, edProfile);

    req.session.account = tokenResponse.account;

    await log_business("user_o365_login", "Utilisateur connecté via Office 365.", {
      req,
      destination: LOG_DESTINATIONS.DATABASE,
      userId: dbUser.id,
      entityType: "User",
      entityId: dbUser.id,
      metadata: {
        role,
        o365Email: dbUser.o365Email,
        hasEdMatch: Boolean(edId),
      },
    });

    req.session.save(() => {
      res.redirect("/");
    });

  } catch (err) {
    log_technical(TECHNICAL_LEVELS.ERROR, "Office 365 login failed", { error: err });
    res.status(500).send("Login failed");
  }
});

router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

module.exports = router;
