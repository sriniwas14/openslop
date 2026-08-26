import { betterAuth } from "better-auth";
import { env } from "../env";
import { sqlite } from "./db";

// ponytail: sqlite file db — swap `database` to a pg Pool when this outgrows one box
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [env.BETTER_AUTH_URL],
  database: sqlite,
  emailAndPassword: {
    enabled: true,
  },
});
