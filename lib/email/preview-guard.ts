export function isEmailPreviewAllowed(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return (
    process.env.VERCEL_ENV === "preview" &&
    process.env.ALLOW_EMAIL_PREVIEW === "1"
  );
}
