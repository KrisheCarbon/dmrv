import { Database } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";

import schema from "./schema";
import migrations from "./migrations";
import Farmer from "./models/Farmer";
import SyncQueue from "./models/SyncQueue";

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  jsi: false,
  onSetUpError: (error) => {
    console.error("WatermelonDB setup error:", error);
  }
});

export const database = new Database({
  adapter,
  modelClasses: [Farmer, SyncQueue]
});

export { Farmer, SyncQueue };
