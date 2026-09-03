const required = [
  "DATABASE_URL",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "APP_AUTH_USERNAME",
  "APP_AUTH_PASSWORD",
  "SESSION_SIGNING_KEY",
  "VAULT_MASTER_KEY",
  "VAULT_REVEAL_PASSWORD",
  "PERSONAL_API_TOKEN",
];

const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing required production environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const minimumLengths = { SESSION_SIGNING_KEY: 32, PERSONAL_API_TOKEN: 32 };
for (const [name, length] of Object.entries(minimumLengths)) {
  if (process.env[name].length < length) {
    console.error(`${name} must contain at least ${length} characters`);
    process.exit(1);
  }
}
