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
import { db, usersTable, studentAccountsTable, filesTable, programTemplatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  clearSession,
  getOidcConfig,
  getSessionId,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  STUDENT_SESSION_COOKIE,
  SESSION_TTL,
  ISSUER_URL,
  type SessionData,
} from "../lib/auth";
import { getSafeReturnTo } from "../lib/safety";

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

function setStudentSessionCookie(res: Response, sid: string) {
  res.cookie(STUDENT_SESSION_COOKIE, sid, {
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

// Default program seeded into the admin Programs menu and given to new
// students on first login. Created on teacher login if it doesn't exist yet.
const DEFAULT_PROGRAM_FILENAME = "hello_world.py";
const DEFAULT_PROGRAM_CONTENT = 'print("Welcome")\n';

// Ensure the default `hello_world.py` program template exists. Called when a
// teacher/admin logs in: if the program is already available, do nothing;
// otherwise create it so every new student has a default program to receive.
async function ensureDefaultProgram(adminId: string) {
  const [existing] = await db
    .select()
    .from(programTemplatesTable)
    .where(eq(programTemplatesTable.filename, DEFAULT_PROGRAM_FILENAME));
  if (existing) return;

  await db.insert(programTemplatesTable).values({
    filename: DEFAULT_PROGRAM_FILENAME,
    content: DEFAULT_PROGRAM_CONTENT,
    createdByAdminId: adminId,
  });
  console.log(
    `[auth] Default program "${DEFAULT_PROGRAM_FILENAME}" was missing — created it.`,
  );
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

  let [user] = await db
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
      user = promoted;
    }
  }

  // A teacher/admin just logged in — make sure the default student program is
  // available in the Programs menu.
  if (user.role === "admin") {
    await ensureDefaultProgram(user.id);
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

router.get("/auth/mode", (_req: Request, res: Response) => {
  res.json({ isLocal: IS_LOCAL_AUTH });
});

// --- Local auth mode: single-click login for local dev, no credentials required ---
if (IS_LOCAL_AUTH) {
  router.get("/login", async (_req: Request, res: Response) => {
    try {
      const dbUser = await upsertUser({
        sub: "local-teacher",
        email: "teacher@localhost.dev",
        given_name: "Local",
        family_name: "Teacher",
        picture: null,
      });

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
    } catch (err) {
      console.error("Local login error:", err);
      res.status(500).send("Login failed — database error");
    }
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
    scope: "openid email profile",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
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
  const sid = req.cookies?.[STUDENT_SESSION_COOKIE];
  if (sid) {
    await deleteSession(sid);
  }
  res.clearCookie(STUDENT_SESSION_COOKIE, { path: "/" });
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
  // Opportunistically prune stale entries so the map can't grow unbounded.
  if (loginAttempts.size > 500) {
    for (const [k, v] of loginAttempts) {
      if (now - v.lastAttempt > LOGIN_WINDOW_MS) loginAttempts.delete(k);
    }
  }
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
  setStudentSessionCookie(res, sid);

  const existingFiles = await db
    .select()
    .from(filesTable)
    .where(eq(filesTable.userId, user.id));

  if (existingFiles.length === 0) {
    // Seed the new student from the default program. The teacher login flow
    // guarantees it exists, but fall back to the built-in content just in case.
    const [defaultProgram] = await db
      .select()
      .from(programTemplatesTable)
      .where(eq(programTemplatesTable.filename, DEFAULT_PROGRAM_FILENAME));

    await db.insert(filesTable).values({
      userId: user.id,
      filename: DEFAULT_PROGRAM_FILENAME,
      content: defaultProgram?.content ?? DEFAULT_PROGRAM_CONTENT,
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
