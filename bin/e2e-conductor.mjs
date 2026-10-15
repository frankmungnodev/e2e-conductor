#!/usr/bin/env node
// Register tsx so the CLI and the project's e2e.config.ts load as TypeScript.
import { register } from "tsx/esm/api"

register()
await import("../src/cli.ts")
