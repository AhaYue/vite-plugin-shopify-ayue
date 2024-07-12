import fs from "fs";
import path from "path";
import { promisify } from "util";
import pc from "picocolors";
import createDebugger from "debug";
import glob from "fast-glob";
import syncDirectory from 'sync-directory'

const copyFile = promisify(fs.copyFile);
const mkdir = promisify(fs.mkdir);
const readdir = promisify(fs.readdir);
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

async function copyFilesToOnline(file, relativePath, ) {
  let outputDir = null;
  let color = null;
    if (file.endsWith(".liquid")) {
      const baseName = path.basename(file);
      outputDir = path.join(sectionsPath, baseName);
      await copyFile(file, outputDir);
      color = pc.blue;
      console.log(
        pc.bgGreen(` handleHotUpdate  `) +
          `:` +
          color(`${path.relative(process.cwd(), outputDir)}`)
      );
    }
}

function getDirPath(entryDir, filePath) {
  const relativePath = path.relative(entryDir, filePath);
  const dirPath = path.dirname(relativePath);
  return { relativePath, dirPath };
}
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
  const { entryDir, outputDir } = options;

  const syncResult = []
  syncDirectory.sync('ayue', 'frontend/entrypoints', {
    watch: true,
    type: 'copy',
    exclude(filePath) {
      return (filePath.endsWith('.liquid') || filePath.includes('.DS_Store'));
    },
    afterEachSync({ targetPath}) {
      syncResult.push(targetPath)
    },
  });


  syncResult.sort ( (a, b) => a.localeCompare(b) );
  syncResult.forEach ( (targetPath) => {
    if (targetPath.endsWith('.js') || targetPath.endsWith('.scss')) {
      
      console.log( pc.bgGreen(` syncDir-file  : frontend/entrypoints/${path.relative(entrypointsPath, targetPath)}`)  );
       
      }else{
        console.log( pc.bgBlue(` syncDir-dir  : `)  + pc.blue(`frontend/entrypoints/${path.relative(entrypointsPath, targetPath)}`));
       
      }
  })



  const input = glob.sync(
    [`${entryDir}/*.{liquid,js,scss}`, `${entryDir}/*/*.{liquid,js,scss}`],
    { onlyFiles: true }
  );

  input.forEach(async (file) => {
    const { relativePath } = getDirPath(entryDir, file);
    copyFilesToOnline(file, relativePath );
  });



  
  return {
    name: "vite-plugin-shopify-ayue",
    // apply: "build",
    enforce: "post",
    handleHotUpdate({ file, server, read }) {
      const HotUpdatePath = path.resolve(process.cwd(), `${entryDir}`);
      if (file.includes(HotUpdatePath)) {
        const { relativePath } = getDirPath(entryDir, file);
        copyFilesToOnline(file, relativePath);
      }
    },
    async closeBundle() {
      let entries = input.filter((fileName) => {
        return fileName.endsWith(".liquid");
      });
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

    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {

      
        next();
      });
    },
  };
}



export default shopifyAyue;
