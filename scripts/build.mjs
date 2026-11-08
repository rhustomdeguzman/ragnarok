import { build } from "esbuild";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";

await mkdir("dist/assets", { recursive: true });
await build({
  entryPoints: ["src/app.js"],
  outfile: "dist/assets/app.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
});
const html = (await readFile("index.html", "utf8"))
  .replace("./src/styles.css", "./assets/styles.css")
  .replace("./src/app.js", "./assets/app.js");
await writeFile("dist/index.html", html);
await copyFile("src/styles.css", "dist/assets/styles.css");
await writeFile("dist/.nojekyll", "");
console.log("Built static app in dist/");
