import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

const out = new URL("../table-format-converter.zip", import.meta.url).pathname;
const dist = new URL("../dist", import.meta.url).pathname;
rmSync(out, { force: true });
execFileSync("zip", ["-r", "-q", out, "."], { cwd: dist, stdio: "inherit" });
