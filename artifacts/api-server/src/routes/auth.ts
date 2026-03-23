import * as oidc from "openid-client";
import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import {
  GetCurrentAuthUserResponse,
  ExchangeMobileAuthorizationCodeBody,
  ExchangeMobileAuthorizationCodeResponse,
  LogoutMobileSessionResponse,
  StudentLoginBody,
} from "@workspace/api-zod";
import { db, usersTable, studentAccountsTable, filesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  clearSession,
  getOidcConfig,
  getSessionId,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  SESSION_TTL,
  ISSUER_URL,
  type SessionData,
} from "../lib/auth";

const OIDC_COOKIE_TTL = 10 * 60 * 1000;
const IS_LOCAL_AUTH = process.env.LOCAL_AUTH === "true";
const IS_SECURE = process.env.NODE_ENV === "production" && !IS_LOCAL_AUTH;

const router: IRouter = Router();

function getOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host =
    req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}`;
}

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: IS_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function setOidcCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: IS_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: OIDC_COOKIE_TTL,
  });
}

function getSafeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

async function upsertUser(claims: Record<string, unknown>) {
  const userData = {
    id: claims.sub as string,
    email: (claims.email as string) || null,
    firstName: (claims.given_name as string) || (claims.first_name as string) || null,
    lastName: (claims.family_name as string) || (claims.last_name as string) || null,
    profileImageUrl: (claims.picture || claims.profile_image_url) as
      | string
      | null,
  };

  const [user] = await db
    .insert(usersTable)
    .values(userData)
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        ...userData,
        updatedAt: new Date(),
      },
    })
    .returning();

  // If this Google OAuth user has no admin role yet, check whether any admin
  // exists in the system. If not, promote them — the first person to sign in
  // via Google is the teacher/admin.
  if (user.role !== "admin") {
    const admins = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"));
    if (admins.length === 0) {
      const [promoted] = await db
        .update(usersTable)
        .set({ role: "admin", updatedAt: new Date() })
        .where(eq(usersTable.id, user.id))
        .returning();
      return promoted;
    }
  }

  return user;
}

router.get("/auth/user", (req: Request, res: Response) => {
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: req.isAuthenticated() ? req.user : null,
    }),
  );
});

// --- Local auth mode: simple username/password for testing without Google OAuth ---
if (IS_LOCAL_AUTH) {
  const LOCAL_USERNAME = process.env.LOCAL_AUTH_USER || "teacher";
  const LOCAL_PASSWORD = process.env.LOCAL_AUTH_PASS || "admin";

  router.get("/login", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html");
    res.send(`<!DOCTYPE html>
<html><head><title>PyLearn Local Login</title>
<style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5}
form{background:#fff;padding:2rem;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.1);min-width:300px}
h2{margin-top:0}input{display:block;width:100%;padding:.5rem;margin:.5rem 0 1rem;box-sizing:border-box;border:1px solid #ccc;border-radius:4px}
button{background:#4285f4;color:#fff;border:none;padding:.75rem 1.5rem;border-radius:4px;cursor:pointer;width:100%;font-size:1rem}
button:hover{background:#3367d6}.err{color:red;font-size:.9rem}</style></head>
<body><form method="POST" action="/api/login">
<h2>PyLearn Local Login</h2>
<label>Username<input name="username" required autofocus></label>
<label>Password<input name="password" type="password" required></label>
<button type="submit">Sign In</button>
</form></body></html>`);
  });

  router.post("/login", async (req: Request, res: Response) => {
    const { username, password } = req.body || {};
    if (username !== LOCAL_USERNAME || password !== LOCAL_PASSWORD) {
      res.status(401).setHeader("Content-Type", "text/html");
      res.send(`<!DOCTYPE html>
<html><head><title>Login Failed</title>
<style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5}
.box{background:#fff;padding:2rem;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.1);text-align:center}
a{color:#4285f4}</style></head>
<body><div class="box"><h2>Login Failed</h2><p>Invalid username or password.</p><a href="/api/login">Try again</a></div></body></html>`);
      return;
    }

    // Upsert a local teacher user
    let dbUser;
    try {
      dbUser = await upsertUser({
        sub: "local-teacher",
        email: `${username}@localhost.dev`,
        given_name: "Local",
        family_name: "Teacher",
        picture: null,
      });
    } catch (err) {
      console.error("Local login upsert error:", err);
      res.status(500).send("Login failed — database error");
      return;
    }

    const sessionData: SessionData = {
      user: {
        id: dbUser.id,
        email: dbUser.email,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
        profileImageUrl: dbUser.profileImageUrl,
      },
      access_token: "local-session",
    };

    const sid = await createSession(sessionData);
    setSessionCookie(res, sid);
    res.redirect("/");
  });
} else {
// --- Google OAuth login ---
router.get("/login", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const returnTo = getSafeReturnTo(req.query.returnTo);

  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  const redirectTo = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: "openid email profile offline_access",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "login consent",
    state,
    nonce,
  });

  setOidcCookie(res, "code_verifier", codeVerifier);
  setOidcCookie(res, "nonce", nonce);
  setOidcCookie(res, "state", state);
  setOidcCookie(res, "return_to", returnTo);

  res.redirect(redirectTo.href);
});

// Query params are not validated because the OIDC provider may include
// parameters not expressed in the schema.
router.get("/callback", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const codeVerifier = req.cookies?.code_verifier;
  const nonce = req.cookies?.nonce;
  const expectedState = req.cookies?.state;

  if (!codeVerifier || !expectedState) {
    res.redirect("/api/login");
    return;
  }

  const currentUrl = new URL(
    `${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`,
  );

  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState,
      idTokenExpected: true,
    });
  } catch {
    res.redirect("/api/login");
    return;
  }

  const returnTo = getSafeReturnTo(req.cookies?.return_to);

  res.clearCookie("code_verifier", { path: "/" });
  res.clearCookie("nonce", { path: "/" });
  res.clearCookie("state", { path: "/" });
  res.clearCookie("return_to", { path: "/" });

  const claims = tokens.claims();
  if (!claims) {
    res.redirect("/api/login");
    return;
  }

  const dbUser = await upsertUser(
    claims as unknown as Record<string, unknown>,
  );

  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: dbUser.profileImageUrl,
    },
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.redirect(returnTo);
});
} // end else (Google OAuth)

router.post("/auth/student-logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.json({ success: true });
});

router.get("/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  await clearSession(res, sid);

  // Google doesn't support RP-initiated logout — just redirect home
  res.redirect("/");
});

const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.lastAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, lastAttempt: now });
    return true;
  }
  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    return false;
  }
  entry.count++;
  entry.lastAttempt = now;
  return true;
}

const STARTER_FILE_CONTENT = `# My Python Adventure
# Welcome to PyLearn! Try running this code.
from adventure import scene, say, ask

scene("The Enchanted Forest")
say("You stand at a crossroads in a dark forest.")
say("To the left, you hear strange sounds.")
say("To the right, you see a faint light.")

name = ask("What is your name, brave adventurer?")
say(f"Hello, {name}! Your journey begins now.")

choice = ask("Do you go left or right?")

if choice.lower() == "left":
    scene("The Music Clearing")
    say(f"{name} bravely walks toward the sounds...")
    say("You discover a friendly dragon playing music!")
    say("The dragon teaches you a song. You win!")
elif choice.lower() == "right":
    scene("The Hidden Cave")
    say(f"{name} follows the light...")
    say("You find a treasure chest full of golden coins!")
    say("You're rich! You win!")
else:
    scene("The Owl's Path")
    say(f"{name} stands still, unsure what to do...")
    say("A friendly owl lands on your shoulder.")
    say("It guides you to a hidden village. You win!")

scene("THE END")
print("Try editing this code to make your own adventure!")
`;

router.post("/auth/student-login", async (req: Request, res: Response) => {
  const parsed = StudentLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const { displayName, pin } = parsed.data;

  const clientIp = req.ip || req.socket.remoteAddress || "unknown";
  const rateLimitKey = `${clientIp}:${displayName.toLowerCase()}`;
  if (!checkRateLimit(rateLimitKey)) {
    res.status(429).json({ error: "Too many login attempts. Please try again in a few minutes." });
    return;
  }

  const allAccounts = await db.select().from(studentAccountsTable);
  const matchingAccounts = allAccounts.filter(
    (a) => a.displayName.toLowerCase() === displayName.toLowerCase()
  );

  if (matchingAccounts.length === 0) {
    res.status(401).json({ error: "Incorrect name or PIN" });
    return;
  }

  let matchedAccount = null;
  let isPausedMatch = false;
  for (const account of matchingAccounts) {
    const pinValid = await bcrypt.compare(pin, account.pinHash);
    if (pinValid) {
      if (account.isPaused) {
        isPausedMatch = true;
      } else {
        matchedAccount = account;
      }
      break;
    }
  }

  if (!matchedAccount && isPausedMatch) {
    res.status(403).json({ error: "Your access is currently paused — speak to your teacher" });
    return;
  }

  if (!matchedAccount) {
    res.status(401).json({ error: "Incorrect name or PIN" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, matchedAccount.id));

  if (!user) {
    res.status(401).json({ error: "Incorrect name or PIN" });
    return;
  }

  const sessionData: SessionData = {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
    },
    access_token: "student-session",
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);

  const existingFiles = await db
    .select()
    .from(filesTable)
    .where(eq(filesTable.userId, user.id));

  if (existingFiles.length === 0) {
    await db.insert(filesTable).values({
      userId: user.id,
      filename: "my_adventure.py",
      content: STARTER_FILE_CONTENT,
    });
  }

  res.json({ success: true });
});

router.post(
  "/mobile-auth/token-exchange",
  async (req: Request, res: Response) => {
    const parsed = ExchangeMobileAuthorizationCodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid required parameters" });
      return;
    }

    const { code, code_verifier, redirect_uri, state, nonce } = parsed.data;

    try {
      const config = await getOidcConfig();

      const callbackUrl = new URL(redirect_uri);
      callbackUrl.searchParams.set("code", code);
      callbackUrl.searchParams.set("state", state);
      callbackUrl.searchParams.set("iss", ISSUER_URL);

      const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: code_verifier,
        expectedNonce: nonce ?? undefined,
        expectedState: state,
        idTokenExpected: true,
      });

      const claims = tokens.claims();
      if (!claims) {
        res.status(401).json({ error: "No claims in ID token" });
        return;
      }

      const dbUser = await upsertUser(
        claims as unknown as Record<string, unknown>,
      );

      const now = Math.floor(Date.now() / 1000);
      const sessionData: SessionData = {
        user: {
          id: dbUser.id,
          email: dbUser.email,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          profileImageUrl: dbUser.profileImageUrl,
        },
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
      };

      const sid = await createSession(sessionData);
      res.json(ExchangeMobileAuthorizationCodeResponse.parse({ token: sid }));
    } catch (err) {
      console.error("Mobile token exchange error:", err);
      res.status(500).json({ error: "Token exchange failed" });
    }
  },
);

router.post("/mobile-auth/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) {
    await deleteSession(sid);
  }
  res.json(LogoutMobileSessionResponse.parse({ success: true }));
});

export default router;
