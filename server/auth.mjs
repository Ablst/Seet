import { Router } from "express";
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scrypt = promisify(scryptCallback),
  cookieName = "jianshu_session";
export function authRouter() {
  const router = Router();
  const file =
    process.env.USER_STORE ||
    fileURLToPath(new URL("../.data/users.json", import.meta.url));
  const sessions = new Map();
  let queue = Promise.resolve();
  async function load() {
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
  }
  const publicUser = (u) => ({ username: u.username });
  const tokenFor = (req) =>
    (req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1);
  function session(req, res, user) {
    const token = randomBytes(32).toString("hex");
    sessions.set(token, {
      user: publicUser(user),
      expires: Date.now() + 7 * 24 * 3600000,
    });
    res.cookie(cookieName, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: req.secure,
      path: "/",
      maxAge: 7 * 24 * 3600000,
    });
  }
  const attempts = new Map();
  router.use((req, res, next) => {
    if (req.method !== "POST" || req.path === "/logout") return next();
    const key = req.ip,
      now = Date.now(),
      entry = attempts.get(key);
    if (!entry || entry.until < now)
      attempts.set(key, { count: 1, until: now + 60000 });
    else if (++entry.count > 20)
      return res.status(429).json({ error: "操作过于频繁，请一分钟后重试。" });
    next();
  });
  function currentUser(req) {
    const token = tokenFor(req),
      value = sessions.get(token);
    if (value?.expires > Date.now()) return value.user;
    if (token) sessions.delete(token);
    return null;
  }
  router.requireAuth = (req, res, next) => {
    req.user = currentUser(req);
    if (!req.user)
      return res.status(401).json({ error: "请先登录，再使用分析工作台。" });
    next();
  };
  router.get("/me", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ user: currentUser(req) });
  });
  router.post("/register", async (req, res) => {
    const { username, password } = req.body || {};
    if (
      typeof username !== "string" ||
      !/^[\p{L}\p{N}_-]{3,24}$/u.test(username) ||
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 128
    )
      return res.status(400).json({
        error:
          "用户名需为 3–24 位文字、数字、下划线或短横线，密码需为 8–128 位。",
      });
    try {
      const salt = randomBytes(16).toString("hex");
      const hash = Buffer.from(await scrypt(password, salt, 64)).toString(
        "hex",
      );
      const user = { username, salt, hash };
      const operation = queue.then(async () => {
        const users = await load();
        if (
          users.some((u) => u.username.toLowerCase() === username.toLowerCase())
        )
          return false;
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file + ".tmp", JSON.stringify([...users, user]), {
          mode: 0o600,
        });
        await rename(file + ".tmp", file);
        return true;
      });
      queue = operation.catch(() => {});
      if (!(await operation))
        return res
          .status(409)
          .json({ error: "该用户名已注册，请直接登录或更换用户名。" });
      session(req, res, user);
      res.status(201).json({ user: publicUser(user) });
    } catch {
      res.status(500).json({ error: "账号暂时无法保存，请稍后重试。" });
    }
  });
  router.post("/login", async (req, res) => {
    const { username, password } = req.body || {};
    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      password.length > 128 ||
      username.length > 24
    )
      return res.status(400).json({ error: "请填写有效的用户名和密码。" });
    try {
      const user = (await load()).find(
        (u) => u.username.toLowerCase() === username.toLowerCase(),
      );
      const candidate = Buffer.from(
        await scrypt(password, user?.salt || "invalid-account-salt", 64),
      );
      if (!user || !timingSafeEqual(candidate, Buffer.from(user.hash, "hex")))
        return res
          .status(401)
          .json({ error: "用户名或密码不正确，请重新输入。" });
      session(req, res, user);
      res.json({ user: publicUser(user) });
    } catch {
      res.status(500).json({ error: "登录服务暂时不可用，请稍后重试。" });
    }
  });
  router.post("/logout", (req, res) => {
    sessions.delete(tokenFor(req));
    res.clearCookie(cookieName, { path: "/" });
    res.json({ ok: true });
  });
  return router;
}
