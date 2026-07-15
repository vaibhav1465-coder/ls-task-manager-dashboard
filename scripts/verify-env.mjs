const required = [
  "GOOGLE_SPREADSHEET_ID",
  "GOOGLE_SHEET_GID",
  "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64",
  "DASHBOARD_USERNAME",
  "DASHBOARD_PASSWORD",
  "DASHBOARD_SESSION_SECRET"
];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(", ")}`);
  process.exit(1);
}
try {
  const json = JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64, "base64").toString("utf8"));
  if (!json.client_email || !json.private_key) throw new Error("client_email/private_key not found");
} catch (error) {
  console.error(`Invalid GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: ${error.message}`);
  process.exit(1);
}
console.log("Environment validation passed.");
