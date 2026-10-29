#!/usr/bin/env node
/**
 * Mint an Auth.js session cookie for smoke-testing a local or preview deployment without a browser
 * round-trip through Google. Needs that deployment's AUTH_SECRET (from the environment, or from
 * .env.local when run at the repo root). Prints `cookie-name=value`, ready for a Cookie header:
 *
 *   node scripts/mint-session.mjs rick@honeycomb.io "Rick Abruzzo" [--secure] [--max-age 900]
 *
 * --secure uses the https cookie name (__Secure-authjs.session-token) that preview and production
 * read; without it the cookie is the http one local dev reads. The output is a live session for
 * that deployment: keep it out of logs, chats and commits.
 */
import { existsSync, readFileSync } from "node:fs";
import { encode } from "@auth/core/jwt";

const args = process.argv.slice(2);
function takeFlag(name, withValue = false) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  const value = withValue ? args[i + 1] : true;
  args.splice(i, withValue ? 2 : 1);
  return value;
}
const secure = takeFlag("--secure") !== null;
const maxAge = Number(takeFlag("--max-age", true) ?? 3600);
const [email, name = ""] = args;
if (!email || !email.includes("@") || !Number.isFinite(maxAge) || maxAge <= 0) {
  console.error('usage: node scripts/mint-session.mjs <email> ["Full Name"] [--secure] [--max-age <seconds>]');
  process.exit(2);
}

let secret = process.env.AUTH_SECRET;
if (!secret && existsSync(".env.local")) {
  const line = readFileSync(".env.local", "utf8")
    .split("\n")
    .find((l) => /^\s*AUTH_SECRET\s*=/.test(l));
  secret = line
    ?.slice(line.indexOf("=") + 1)
    .trim()
    .replace(/^(["'])(.*)\1$/, "$2");
}
if (!secret) {
  console.error("AUTH_SECRET is not set and was not found in .env.local");
  process.exit(2);
}

const cookieName = secure ? "__Secure-authjs.session-token" : "authjs.session-token";
const [givenName, ...rest] = name.split(/\s+/).filter(Boolean);
const token = await encode({
  salt: cookieName, // Auth.js derives the encryption key from the cookie name
  secret,
  maxAge,
  token: {
    sub: `smoke:${email}`,
    email,
    name: name || email,
    givenName,
    familyName: rest.length ? rest.join(" ") : undefined,
    email_verified: true,
  },
});
process.stdout.write(`${cookieName}=${token}\n`);
