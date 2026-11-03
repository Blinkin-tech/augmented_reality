import { loadConfig } from "./config";

const config = loadConfig(process.env);
console.log(`live server configured for port ${config.port}`);
