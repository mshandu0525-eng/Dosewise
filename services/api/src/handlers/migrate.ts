/** Applies the schema and production guards. Run on each deploy (CDK custom resource). */
import guards from "../db/guards.sql";
import schema from "../db/schema.sql";
import { getDeps } from "./runtime";

export const handler = async () => {
  const { db } = await getDeps();
  await db.query(schema);
  await db.query(guards);
  return { PhysicalResourceId: "dosewise-schema-v1" };
};
