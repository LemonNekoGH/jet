import { LoggerWithoutDebug, Wllama } from '../generated/wllama/index.js';
import type { ScoreKnownTextBatchParams } from '../generated/wllama/wllama.js';
import initJetWeb, { decide } from '../generated/jet-web/jet_web.js';

const wllamaWasmUrl = new URL(
  '../generated/wllama/wasm/wllama.wasm',
  import.meta.url,
).href;

let jetWebReady: Promise<unknown> | undefined;
let model: Wllama | undefined;
let loadedModelUrl: string | undefined;

export type Progress = {
  loaded: number;
  total: number;
};

function initializeJetWeb(): Promise<unknown> {
  jetWebReady ??= initJetWeb();
  return jetWebReady;
}

export function supportsWebGpu(): boolean {
  return 'gpu' in navigator;
}

export async function loadModel(
  modelUrl: string,
  onProgress: (progress: Progress) => void,
): Promise<void> {
  if (!supportsWebGpu()) {
    throw new Error('This browser does not expose WebGPU.');
  }
  if (model && loadedModelUrl === modelUrl) {
    return;
  }
  if (model) {
    await model.exit();
    model = undefined;
    loadedModelUrl = undefined;
  }

  const nextModel = new Wllama(
    { default: wllamaWasmUrl },
    { logger: LoggerWithoutDebug },
  );
  await nextModel.loadModelFromUrl(modelUrl, {
    n_ctx: 4096,
    n_parallel: 8,
    n_gpu_layers: 99999,
    progressCallback: onProgress,
  });
  await initializeJetWeb();
  model = nextModel;
  loadedModelUrl = modelUrl;
}

export function isModelLoaded(modelUrl: string): boolean {
  return model?.isModelLoaded() === true && loadedModelUrl === modelUrl;
}

export async function runDecision(
  modelUrl: string,
  request: unknown,
): Promise<unknown> {
  if (!model || !isModelLoaded(modelUrl)) {
    throw new Error('Load this model before running Jet.');
  }
  await initializeJetWeb();

  const modelId = decodeURIComponent(modelUrl.split('/').pop() || modelUrl);
  return decide(modelId, request, (scoreRequest: ScoreKnownTextBatchParams) =>
    model!.scoreKnownTextBatch(scoreRequest),
  );
}
