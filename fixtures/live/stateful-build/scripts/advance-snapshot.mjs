import fs from "node:fs";

fs.writeFileSync("state/snapshot.json", `${JSON.stringify({ revision: 2, mode: "current" }, null, 2)}\n`);
