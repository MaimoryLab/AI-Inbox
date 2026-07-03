import { homedir } from "node:os";
import { join } from "node:path";

export interface AppPaths {
  configDir: string;
  envPath: string;
  configPath: string;
  secretsPath: string;
  dataDir: string;
  dbPath: string;
}

export function getAppPaths(baseDir = process.env.AI_INBOX_HOME ?? join(homedir(), ".ai-inbox")): AppPaths {
  const dataDir = join(baseDir, "data");
  return {
    configDir: baseDir,
    envPath: join(baseDir, ".env"),
    configPath: join(baseDir, "config.json"),
    secretsPath: join(baseDir, "secrets.json"),
    dataDir,
    dbPath: join(dataDir, "ai-inbox.sqlite")
  };
}
