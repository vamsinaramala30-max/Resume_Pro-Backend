import { z } from "zod";

export function validateEnv() {
  const schema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(5000),

    // Must be present and non-empty
    MONGO_URI: z.string().min(1),
    JWT_SECRET: z.string().min(1),

    FRONTEND_URL: z.string().optional(),
    JSON_LIMIT: z.string().optional(),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().optional(),

    PAYMENT_DEMO: z.string().optional(),
  });

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment variables: ${issues}`);
  }

  return parsed.data;
}

