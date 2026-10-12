import { LoggerWithoutDebug, Wllama } from '../generated/wllama/index.js';

const wllamaWasmUrl = new URL(
  '../generated/wllama/wasm/wllama.wasm',
  import.meta.url,
).href;

let model: Wllama | undefined;
let loadedModelUrl: string | undefined;
let loadedOptions: string | undefined;

export type Progress = {
  loaded: number;
  total: number;
};

export type EngineOptions = {
  contextTokensPerSequence?: number;
  executionMode?: 'reference' | 'batched';
  preparationPipeline?: boolean;
  thinkingMode?: 'disabled' | 'auto' | 'required';
  thinkingTokens?: number;
};

const defaultEngineOptions: Required<EngineOptions> = {
  contextTokensPerSequence: 1024,
  executionMode: 'batched',
  preparationPipeline: true,
  thinkingMode: 'disabled',
  thinkingTokens: 256,
};

export function supportsWebGpu(): boolean {
  return 'gpu' in navigator;
}

export async function loadModel(
  modelUrl: string,
  onProgress: (progress: Progress) => void,
  options: EngineOptions = {},
): Promise<void> {
  if (!supportsWebGpu()) {
    throw new Error('This browser does not expose WebGPU.');
  }
  const engineOptions = { ...defaultEngineOptions, ...options };
  const optionsKey = JSON.stringify(engineOptions);
  if (model && loadedModelUrl === modelUrl && loadedOptions === optionsKey) {
    return;
  }
  if (model) {
    await model.exit();
    model = undefined;
    loadedModelUrl = undefined;
    loadedOptions = undefined;
  }

  const nextModel = new Wllama(
    { default: wllamaWasmUrl },
    { logger: LoggerWithoutDebug, suppressNativeLog: true },
  );
  const modelId = decodeURIComponent(modelUrl.split('/').pop() || modelUrl);
  try {
    await nextModel.loadModelFromUrl(modelUrl, {
      jet: {
        model_id: modelId,
        context_tokens_per_sequence: engineOptions.contextTokensPerSequence,
        max_sequences: 9,
        max_output_rows: 256,
        preparation_pipeline: engineOptions.preparationPipeline,
        execution_mode: engineOptions.executionMode,
        thinking: {
          mode: engineOptions.thinkingMode,
          max_tokens: engineOptions.thinkingTokens,
        },
        collect_timings: true,
      },
      progressCallback: onProgress,
    });
  } catch (error) {
    await nextModel.exit();
    throw error;
  }
  model = nextModel;
  loadedModelUrl = modelUrl;
  loadedOptions = optionsKey;
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
  return model.jetDecide(request);
}

export async function runDecisionTrace(
  modelUrl: string,
  request: unknown,
): Promise<unknown> {
  if (!model || !isModelLoaded(modelUrl)) {
    throw new Error('Load this model before running Jet.');
  }
  return model.jetDecideTrace(request);
}

export async function runDecisionBatch(
  modelUrl: string,
  requests: unknown[],
): Promise<unknown[]> {
  if (!model || !isModelLoaded(modelUrl)) {
    throw new Error('Load this model before running Jet.');
  }
  return model.jetDecideBatch(requests);
}

export async function engineTimings(modelUrl: string): Promise<unknown> {
  if (!model || !isModelLoaded(modelUrl)) {
    throw new Error('Load this model before reading Jet timings.');
  }
  return model.jetTimings();
}
