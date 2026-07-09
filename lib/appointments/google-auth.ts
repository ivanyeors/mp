import { OAuth2Client } from "google-auth-library";

/** Shared OAuth2 client for Calendar + People (admin@mpillow.com refresh token). */
export function getGoogleOAuthClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REFRESH_TOKEN",
    );
  }
  const client = new OAuth2Client(clientId, clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

export async function getGoogleAccessToken(): Promise<string> {
  const client = getGoogleOAuthClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Failed to refresh Google access token");
  return token.token;
}
