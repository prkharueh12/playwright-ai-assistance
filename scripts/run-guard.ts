import { pathToFileURL } from "node:url";

/** True when the current module was invoked directly (`tsx scripts/x.ts`)
 * rather than imported by another module. */
export function isMainModule(moduleUrl: string): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && moduleUrl === pathToFileURL(entry).href;
}
