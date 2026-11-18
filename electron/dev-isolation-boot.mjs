import { app } from "electron";

import { applyDevIsolation } from "./dev-isolation.mjs";

// Imported first by main.mjs so it runs before every other module's top level.
applyDevIsolation(app);
