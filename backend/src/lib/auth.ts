import { betterAuth } from "better-auth";
import { env } from "../env";
import { sqlite } from "./db";

// ponytail: sqlite file db — swap `database` to a pg Pool when this outgrows one box
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [env.BETTER_AUTH_URL, "http://localhost:5173", "http://127.0.0.1:5173"], // ponytail: dev origins — prod is same-origin so BETTER_AUTH_URL suffices
  database: sqlite,
  emailAndPassword: {
    enabled: true,
  },
});
