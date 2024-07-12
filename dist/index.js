import fs from "fs";
import path from "path";
import { promisify } from "util";
import pc from "picocolors";
import createDebugger from "debug";
import glob from "fast-glob";
import syncDirectory from "sync-directory";
import chokidar from "chokidar";

const copyFile = promisify(fs.copyFile);

const mkdir = promisify(fs.mkdir);

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const rm = promisify(fs.rm);

const sectionsPath = path.resolve(process.cwd(), "sections");
const entrypointsPath = path.resolve(process.cwd(), "frontend/entrypoints");

const regex = /\{\%\s*liquid\s+[^%]*assign\s+isAyueImport\s*=\s*true[^%]*\%\}/g;

async function cleanAndCreateDir(outputDir) {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
}

async function extractSchema(filePath, entryDir, docDir) {
  //a extractSchema ayueTem/ay-tem/ay-tem.liquid
  const debug = createDebugger("vite-plugin-shopify-ayue:doc");
  // ayue tem/
  const fileDirName = path.dirname(path.relative(entryDir, filePath));

  // /Users/aha/Desktop/工作/绿联/Aha_Yue_Dev/ayue_doc

  let res = await mkdir(path.join(docDir, fileDirName), { recursive: true });
  res == undefined && (res = docDir);

  const content = await readFile(filePath, "utf-8");

  const schemaMatch = content.match(/{% schema %}([\s\S]*?){% endschema %}/);
  if (schemaMatch && schemaMatch[1]) {
    const schemaContent = schemaMatch[1].trim();
    const jsonFileName = path.basename(filePath, ".liquid") + ".json";
    const jsonFilePath = path.join(res, jsonFileName);
    await writeFile(jsonFilePath, schemaContent, "utf-8");
    debug(path.relative(process.cwd(), jsonFilePath));
    // console.log(`${pc.bgYellow("Doc")} ==> ${pc.yellow(jsonFilePath)}`);
  }
}

async function copyFilesToOnline(file, toPath) {
  const baseName = path.basename(file);
  let outputDir = path.join(toPath, baseName);
  let color = pc.blue;
  await copyFile(file, outputDir);
  console.log(
    pc.green(` HotUpdate `) +
    `: ` +
    color(`${path.relative(process.cwd(), outputDir)}`)
  );
}

// function getDirPath(entryDir, filePath) {
//   const relativePath = path.relative(entryDir, filePath);
//   const dirPath = path.dirname(relativePath);
//   return { relativePath, dirPath };
// }
async function buildLiquid(filePath, entryDir, outputDir) {
  const manifestFile = await readFile("assets/.vite/manifest.json", "utf-8");
  const manifest = JSON.parse(manifestFile);
  const baseName = path.basename(filePath, ".liquid");

  const outputFilePath = path.join(outputDir, `${baseName}.liquid`);

  let liquidContent = await readFile(filePath, "utf-8");

  for (const [key, value] of Object.entries(manifest)) {
    if (key.includes(baseName)) {
      const matches = liquidContent.match(regex);
      //清空内容 引入vite-tag
      if (matches) {
        matches.forEach((match) => {
          liquidContent = liquidContent.replace(match, "");
        });
      }
      const assetsPath = path.join(process.cwd(), "assets");
      const filePath = path.join(assetsPath, value.file);

      let styleBlock = "";
      let scriptBlock = "";

      if (value.file.endsWith(".css")) {
        const cssContent = await readFile(filePath, "utf-8");
        styleBlock = `{%- style -%}\n${cssContent}\n{%- endstyle -%}\n`;
      }

      if (value.file.endsWith(".js")) {
        const jsContent = await readFile(filePath, "utf-8");

        scriptBlock = `<script>\n${jsContent}</script>`;
      }

      liquidContent = styleBlock + liquidContent;
      liquidContent = liquidContent.replace(
        /{%\s*schema\s*%}/g,
        `${scriptBlock}\n{% schema %}`
      );
    }
  }
  writeFile(outputFilePath, liquidContent, "utf-8");

  return outputFilePath;
}

function shopifyAyue(options) {
  const { entryDir, outputDir, autoChangeDev } = options;

  



  SyncFileToEntrypoint(entryDir, entrypointsPath);
 const watchLiquid = SyncFileToSections  (entryDir, sectionsPath);


  return {
    name: "vite-plugin-shopify-ayue",
    enforce: "post",
    async closeBundle() {
      // let entries = input.filter((fileName) => {
      //   return fileName.endsWith(".liquid");
      // });


      const entries = glob.sync(
        [`${entryDir}/**/*.liquid`],
        { onlyFiles: true }
      );



      const docDir = path.resolve(process.cwd(), "ayue_doc");
      const buildLiquidDir = path.resolve(process.cwd(), "ayue_build");
      try {
        await cleanAndCreateDir(docDir);
        await cleanAndCreateDir(buildLiquidDir);
      } catch (error) {
        console.log(error);
      }
      const outList = [];
      for (const entry of entries) {
        try {
          // 提取doc
          await extractSchema(entry, entryDir, docDir);
          // 提取js, scss, 到build
          const res = await buildLiquid(entry, entryDir, buildLiquidDir);
          outList.push(res);
        } catch (error) {
          console.log(error);
        }
      }
      outList.sort((a, b) => a.localeCompare(b));
      outList.forEach((file) => {
        console.log(
          pc.bgGreen(` Build-Liquid  `) +
          `:` +
          `${path.relative(process.cwd(), buildLiquidDir)}/${pc.bgMagenta(
            path.basename(file)
          )}`
        );
      });
    },
    buildStart() {
      console.log(pc.bgGreen(` BuildStart  `));
    },

    buildEnd() {

      watchLiquid.close().then(() => console.log(pc.bgCyan('watchLiquid Stopped watching')));

    },

    configureServer(server) {
    
      server.middlewares.use(async (req, res, next) => {
        next();
      });
    },
  };
}

function SyncFileToEntrypoint(from, to) {
  const syncResult = [];
  syncDirectory.sync(from, to, {
    watch: true,
    type: "copy",
    //排除所有
    exclude(file) {
  
      return  (file.endsWith(".liquid") || file.endsWith(".DS_Store"));
    },

    //     //排除所有 只选择js 和 scss
    // forceSync: /\.(js|scss)$/,

    deleteOrphaned: true,

    afterEachSync({ targetPath }) {
      syncResult.push(targetPath);

      consoleFile(targetPath)
    },
  });
  syncResult.sort((a, b) => a.localeCompare(b));
  syncResult.forEach((targetPath) => {
    consoleFile(targetPath)

  });
}
function SyncFileToSections(from, to,) {
  const watcher = chokidar.watch(`${from}/**/*.liquid`, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
  });

  watcher
    .on("add", (filePath) => {
      copyFilesToOnline(filePath, to);
    })
    .on("change", (filePath) => copyFile(filePath, path.join(to, baseName)))
    .on("unlink", (filePath) => {
      const baseName = path.basename(filePath);
      const targetPath = path.join(to, baseName);
      rm(targetPath, { force: true });

      console.log(pc.bgRed(` Unlink  `) + `:` + pc.red(`/${path.relative(to, targetPath)}`));
    })
    .on("error", (error) => console.error(`Watcher error: ${error}`));

  return watcher
}


function consoleFile(filePath) {

  let color = null;
  filePath.endsWith(".js") && (color = pc.yellow);
  filePath.endsWith(".scss") && (color = pc.bgMagenta);
  filePath.endsWith(".liquid") && (color = pc.blue);
  const baseName = path.basename(filePath);
  const realativePath = path.relative(process.cwd(), filePath)

  console.log(


    pc.bgGreen(` sync file `) +
    `:` + realativePath.replace(baseName, pc.bold(color ? color(`${baseName}`) : pc.green(`/${baseName}`)))
  )

  // console.log(
  //   pc.bgGreen(` sync file `) +
  //     `:` +
  //     path.relative(process.cwd(), filePath) +  )
  //     // pc.bold(color? color(`/${path.relative(to, targetPath)}`): pc.green(`/${path.relative(to, targetPath)}`))


  //   );


}

export default shopifyAyue;
