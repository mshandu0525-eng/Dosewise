/** Applies the schema and production guards. Run on each deploy (CDK custom resource). */
import guards from "../db/guards.sql";
import schema from "../db/schema.sql";
import { splitSql } from "../lib/dataApiDb";
import { getDeps, usesDataApi } from "./runtime";

export const handler = async () => {
  const { db } = await getDeps();
  for (const file of [schema, guards]) {
    // The Data API runs one statement per call; a pg connection takes the whole file.
    if (usesDataApi()) for (const statement of splitSql(file)) await db.query(statement);
    else await db.query(file);
  }
  return { PhysicalResourceId: "dosewise-schema-v1" };
};
