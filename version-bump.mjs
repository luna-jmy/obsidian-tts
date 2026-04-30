import { readFileSync, writeFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const versions = JSON.parse(readFileSync("versions.json", "utf8"));

manifest.version = pkg.version;
versions[pkg.version] = manifest.minAppVersion;

writeFileSync("manifest.json", `${JSON.stringify(manifest, null, "\t")}\n`);
writeFileSync("versions.json", `${JSON.stringify(versions, null, "\t")}\n`);
