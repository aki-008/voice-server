import path from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root, resolved from this file so it works from both `server/` and `dist-server/`. */
export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

export const MODELS_DIR = path.join(REPO_ROOT, "models");
export const MODEL_REPO = "nvidia/nemotron-3.5-asr-streaming-0.6b";
export const MODEL_FILE_NAME = "nemotron-3.5-asr-streaming-0.6b.q8_0.gguf";
export const MODEL_FILE = path.join(MODELS_DIR, MODEL_FILE_NAME);

export const NEMO_DIR = path.join(REPO_ROOT, "vendor", "NeMoSpeech");
export const NEMO_BIN_DIR = path.join(NEMO_DIR, "bin");

export const CLIENT_DIST = path.join(REPO_ROOT, "dist");
