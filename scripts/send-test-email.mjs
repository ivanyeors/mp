// Standalone Gmail delegation smoke test.
//   node --env-file=.env.local scripts/send-test-email.mjs [recipient]
// Verifies the service account can mint a delegated token and send "as"
// GMAIL_SENDER. A 403 here means domain-wide delegation isn't authorized
// (or hasn't propagated) for the client ID + gmail.send scope.
import { JWT } from "google-auth-library";

const clientEmail = process.env.GMAIL_CLIENT_EMAIL;
const privateKey = process.env.GMAIL_PRIVATE_KEY?.replace(/\\n/g, "\n");
const sender = process.env.TEST_SENDER || process.env.GMAIL_SENDER;
const to = process.argv[2] || sender;

if (!clientEmail || !privateKey || !sender) {
  console.error("Missing GMAIL_CLIENT_EMAIL / GMAIL_PRIVATE_KEY / GMAIL_SENDER");
  process.exit(1);
}

const jwt = new JWT({
  email: clientEmail,
  key: privateKey,
  scopes: ["https://www.googleapis.com/auth/gmail.send"],
  subject: sender,
});

function buildRaw() {
  const mime = [
    `From: ${sender}`,
    `To: ${to}`,
    "Subject: mpillow Gmail delegation test",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    `Delegation works. Sent as ${sender} at ${new Date().toISOString()}.`,
  ].join("\r\n");
  return Buffer.from(mime, "utf8").toString("base64url");
}

try {
  const { token } = await jwt.getAccessToken();
  if (!token) throw new Error("No access token returned");
  console.log("Token minted for", sender);

  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: buildRaw() }),
    }
  );

  const body = await res.text();
  if (!res.ok) {
    console.error(`SEND FAILED (${res.status}):`, body);
    process.exit(1);
  }
  console.log("SEND OK ->", to);
  console.log(body);
} catch (err) {
  console.error("ERROR:", err?.message || err);
  process.exit(1);
}
