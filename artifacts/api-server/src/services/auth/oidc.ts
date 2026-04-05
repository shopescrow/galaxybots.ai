import crypto from "crypto";
import { validateExternalUrl } from "../../utils/url-validation";

interface JwkKey {
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
  alg?: string;
  use?: string;
}

export async function fetchOidcJwks(issuerUrl: string): Promise<JwkKey[]> {
  if (!validateExternalUrl(issuerUrl)) return [];

  try {
    const discoveryUrl = issuerUrl.replace(/\/$/, "") + "/.well-known/openid-configuration";
    const controller1 = new AbortController();
    const t1 = setTimeout(() => controller1.abort(), 10000);
    const discoveryRes = await fetch(discoveryUrl, { signal: controller1.signal, redirect: "error" });
    clearTimeout(t1);
    const discovery = (await discoveryRes.json()) as { jwks_uri?: string };
    if (!discovery.jwks_uri || !validateExternalUrl(discovery.jwks_uri)) return [];
    const controller2 = new AbortController();
    const t2 = setTimeout(() => controller2.abort(), 10000);
    const jwksRes = await fetch(discovery.jwks_uri, { signal: controller2.signal, redirect: "error" });
    clearTimeout(t2);
    const jwks = (await jwksRes.json()) as { keys: JwkKey[] };
    return jwks.keys || [];
  } catch {
    return [];
  }
}

export function verifyJwtSignatureWithJwks(idToken: string, keys: JwkKey[]): boolean {
  if (keys.length === 0) return false;

  try {
    const [headerB64] = idToken.split(".");
    const header = JSON.parse(Buffer.from(headerB64, "base64url").toString()) as { kid?: string; alg?: string };
    const kid = header.kid;
    const alg = header.alg;

    if (alg !== "RS256") return false;

    let key = keys.find((k) => k.kid === kid);
    if (!key) key = keys[0];

    if (!key.n || !key.e) return false;

    const pubKey = crypto.createPublicKey({
      key: {
        kty: key.kty || "RSA",
        n: key.n,
        e: key.e,
      },
      format: "jwk",
    });

    const [headerPart, payloadPart, signaturePart] = idToken.split(".");
    const data = `${headerPart}.${payloadPart}`;
    const signature = Buffer.from(signaturePart, "base64url");

    return crypto.createVerify("RSA-SHA256").update(data).verify(pubKey, signature);
  } catch {
    return false;
  }
}

export function generatePkceChallenge() {
  const state = crypto.randomBytes(32).toString("hex");
  const nonce = crypto.randomBytes(16).toString("hex");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  return { state, nonce, codeVerifier, codeChallenge };
}

export async function discoverOidcEndpoints(issuerUrl: string) {
  let authorizationEndpoint: string;
  let tokenEndpoint: string;
  let userinfoEndpoint: string;

  try {
    const discoveryUrl = issuerUrl.replace(/\/$/, "") + "/.well-known/openid-configuration";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const discoveryRes = await fetch(discoveryUrl, { signal: controller.signal, redirect: "error" });
    clearTimeout(timeout);
    const discovery = (await discoveryRes.json()) as {
      authorization_endpoint: string;
      token_endpoint: string;
      userinfo_endpoint: string;
    };
    authorizationEndpoint = discovery.authorization_endpoint;
    tokenEndpoint = discovery.token_endpoint;
    userinfoEndpoint = discovery.userinfo_endpoint;
  } catch {
    authorizationEndpoint = `${issuerUrl}/authorize`;
    tokenEndpoint = `${issuerUrl}/token`;
    userinfoEndpoint = `${issuerUrl}/userinfo`;
  }

  return { authorizationEndpoint, tokenEndpoint, userinfoEndpoint };
}
