import { Database } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";

import schema from "./schema";
import migrations from "./migrations";
import Farmer from "./models/Farmer";
import SyncQueue from "./models/SyncQueue";
import PyrolysisSession from "./models/PyrolysisSession";
import PyrolysisBatch from "./models/PyrolysisBatch";
import MixingEntry from "./models/MixingEntry";
import MixingPyrolysisLink from "./models/MixingPyrolysisLink";
import ApplicationEntry from "./models/ApplicationEntry";
import ApplicationPyrolysisLink from "./models/ApplicationPyrolysisLink";
import EncryptedBatch from "./models/EncryptedBatch";

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  jsi: false,
  onSetUpError: (error) => {
    console.error("WatermelonDB setup error:", error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [
    Farmer,
    SyncQueue,
    PyrolysisSession,
    PyrolysisBatch,
    MixingEntry,
    MixingPyrolysisLink,
    ApplicationEntry,
    ApplicationPyrolysisLink,
    EncryptedBatch,
  ],
});

export {
  Farmer,
  SyncQueue,
  PyrolysisSession,
  PyrolysisBatch,
  MixingEntry,
  MixingPyrolysisLink,
  ApplicationEntry,
  ApplicationPyrolysisLink,
  EncryptedBatch,
};
