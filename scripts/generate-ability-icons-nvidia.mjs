import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const promptManifestPath = path.join(__dirname, "hero-ability-icon-prompts.json");
const nvidiaApiUrl = "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev";
const nvidiaSize = 1024;

const cli = parseArgs(process.argv.slice(2));

if (cli.help) {
  printHelp();
  process.exit(0);
}

const promptManifest = JSON.parse(await readFile(promptManifestPath, "utf8"));
const allEntries = await loadEntries(promptManifest);
const requested = filterEntries(allEntries, cli);

if (cli.list) {
  for (const entry of requested) {
    console.log(`${entry.heroSlug}:${entry.abilityId} -> ${entry.output}`);
  }
  process.exit(0);
}

if (requested.length === 0) {
  console.error("No ability icons matched the current filters.");
  process.exit(1);
}

console.log("Using provider: nvidia");
console.log("Using model: flux.1-dev");
console.log(`Generation size: ${nvidiaSize}x${nvidiaSize}`);

for (let index = 0; index < requested.length; index += 1) {
  const entry = requested[index];
  const outputPath = path.join(rootDir, entry.output);
  const seed = cli.seedBase + index;
  const prompt = buildPrompt(promptManifest.image, entry);

  console.log(`\n[${index + 1}/${requested.length}] ${entry.heroSlug}:${entry.abilityId}`);
  console.log(`Output: ${entry.output}`);
  console.log(`Seed: ${seed}`);
  console.log(`URL: ${nvidiaApiUrl}`);

  if (cli.dryRun) {
    continue;
  }

  await mkdir(path.dirname(outputPath), { recursive: true });

  if (!cli.overwrite) {
    try {
      await readFile(outputPath);
      console.log("Skipped: output already exists. Use --overwrite to replace it.");
      continue;
    } catch {
      // Missing file is expected.
    }
  }

  const tempBase = path.join(os.tmpdir(), `nvidia-${entry.heroSlug}-${entry.abilityId}-${Date.now()}`);
  const tempInput = `${tempBase}.bin`;
  const tempOutput = `${tempBase}.webp`;

  try {
    const bytes = await fetchNvidiaWithRetry(prompt, seed, cli.retries);
    await writeFile(tempInput, bytes);
    await convertToWebp(tempInput, tempOutput);
    await writeFile(outputPath, await readFile(tempOutput));
    console.log("Saved.");
  } catch (error) {
    console.error(`Failed: ${error.message}`);
  } finally {
    await rm(tempInput, { force: true });
    await rm(tempOutput, { force: true });
  }

  if (index < requested.length - 1) {
    await sleep(cli.delayMs);
  }
}

function parseArgs(argv) {
  const args = {
    hero: null,
    ability: null,
    retries: 4,
    delayMs: 2000,
    seedBase: 1000,
    dryRun: false,
    overwrite: false,
    list: false,
    help: false
  };

  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--overwrite") args.overwrite = true;
    else if (arg === "--list") args.list = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg.startsWith("--hero=")) args.hero = arg.slice("--hero=".length);
    else if (arg.startsWith("--ability=")) args.ability = arg.slice("--ability=".length);
    else if (arg.startsWith("--retries=")) args.retries = Number.parseInt(arg.slice("--retries=".length), 10);
    else if (arg.startsWith("--delay-ms=")) args.delayMs = Number.parseInt(arg.slice("--delay-ms=".length), 10);
    else if (arg.startsWith("--seed-base=")) args.seedBase = Number.parseInt(arg.slice("--seed-base=".length), 10);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  NVIDIA_NIM_API_KEY=... node scripts/generate-ability-icons-nvidia.mjs [options]

Options:
  --hero=<slug>        Filter to one hero
  --ability=<id>       Filter to one ability id
  --seed-base=<n>      Starting seed for generations
  --delay-ms=<n>       Delay between generations in ms
  --retries=<n>        Retries per image on server errors
  --overwrite          Replace existing files
  --dry-run            Print request metadata without fetching
  --list               Print the filtered manifest entries
  --help               Show this help
`);
}

function filterEntries(entries, cliArgs) {
  return entries.filter((entry) => {
    if (cliArgs.hero && entry.heroSlug !== cliArgs.hero) return false;
    if (cliArgs.ability && entry.abilityId !== cliArgs.ability) return false;
    return true;
  });
}

function buildPrompt(imageConfig, entry) {
  return `${entry.name}, ${entry.prompt}, ${imageConfig.stylePrompt}. Negative prompt: ${imageConfig.negativePrompt}.`;
}

async function loadEntries(promptManifest) {
  const explicitPromptMap = new Map(
    promptManifest.entries.map((entry) => [`${entry.heroSlug}:${entry.abilityId}`, entry])
  );
  const heroDir = path.join(rootDir, "data", "hero");
  const heroSlugs = (await readdir(heroDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const merged = [];

  for (const heroSlug of heroSlugs) {
    const heroManifestPath = path.join(heroDir, heroSlug, "img", "abilities", "manifest.json");
    let heroManifest;
    try {
      heroManifest = JSON.parse(await readFile(heroManifestPath, "utf8"));
    } catch {
      continue;
    }

    for (const ability of heroManifest.abilities) {
      const key = `${heroManifest.hero_slug}:${ability.id}`;
      const explicit = explicitPromptMap.get(key);
      merged.push({
        heroSlug: heroManifest.hero_slug,
        abilityId: ability.id,
        name: ability.name,
        output: `data/hero/${heroManifest.hero_slug}/img/abilities/${ability.icon}`,
        prompt: explicit?.prompt ?? buildFallbackPrompt(heroManifest.hero_name, ability)
      });
    }
  }

  return merged;
}

function buildFallbackPrompt(heroName, ability) {
  const typeFlavor = {
    skill: "offensive combat emblem",
    passive: "persistent aura or trait emblem",
    reaction: "triggered counter or response emblem",
    ultimate: "mythic finishing move emblem"
  };
  return `${heroName} ${ability.name}, ${typeFlavor[ability.type] ?? "ability emblem"}, fantasy power symbol, readable centered icon`;
}

async function fetchNvidiaWithRetry(prompt, seed, retries) {
  const apiKey = process.env.NVIDIA_NIM_API_KEY;
  if (!apiKey) {
    throw new Error("NVIDIA_NIM_API_KEY is not set.");
  }

  let attempt = 0;
  let backoffMs = 4000;

  while (attempt <= retries) {
    const response = await fetch(nvidiaApiUrl, {
      method: "POST",
      signal: AbortSignal.timeout(180000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt,
        width: nvidiaSize,
        height: nvidiaSize,
        seed
      })
    });

    if (response.ok) {
      const data = await response.json();
      const artifact = data?.artifacts?.[0]?.base64;
      if (!artifact) {
        throw new Error("NVIDIA response did not include artifacts[0].base64.");
      }
      return Buffer.from(artifact, "base64");
    }

    const text = await response.text().catch(() => "");
    if (response.status >= 500 && attempt < retries) {
      console.log(`Retrying after HTTP ${response.status}...`);
      await sleep(backoffMs);
      backoffMs *= 2;
      attempt += 1;
      continue;
    }

    throw new Error(`HTTP ${response.status}${text ? `: ${text}` : ""}`);
  }

  throw new Error("Exhausted retries.");
}

async function convertToWebp(inputPath, outputPath) {
  await runCommand("cwebp", ["-quiet", "-q", "92", inputPath, "-o", outputPath]);
}

async function runCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
