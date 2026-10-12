<script setup vapor lang="ts">
import { computed, ref, watch } from 'vue';

import {
  engineTimings,
  isModelLoaded,
  loadModel,
  runDecision,
  runDecisionBatch,
  runDecisionTrace,
  supportsWebGpu,
} from './runtime';

const defaultModelUrl =
  'https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/23749fefcc72300e3a2ad315e1317431b06b590a/Qwen3-0.6B-Q8_0.gguf';

const defaultRequest = {
  state: {
    ticket: 'Login fails for all users',
  },
  questions: {
    urgent: {
      type: 'noul',
      instructions: 'Is this urgent?',
    },
    owner: {
      type: 'choice',
      instructions: 'Choose the owner',
      criteria: {
        app: 'Application team',
        infra: 'Infrastructure team',
      },
    },
    severity: {
      type: 'score',
      instructions: 'Rate severity',
      criteria: ['low', 'medium', 'high'],
    },
  },
};

const modelUrl = ref(defaultModelUrl);
const contextTokens = ref(1024);
const executionMode = ref<'reference' | 'batched'>('batched');
const preparationPipeline = ref(true);
const thinkingMode = ref<'disabled' | 'auto' | 'required'>('disabled');
const thinkingTokens = ref(256);
const requestText = ref(JSON.stringify(defaultRequest, null, 2));
const status = ref(supportsWebGpu() ? 'Model is not loaded.' : 'WebGPU is unavailable.');
const responseText = ref('');
const timingsText = ref('');
const traceText = ref('');
const errorText = ref('');
const loading = ref(false);
const running = ref(false);
const loaded = ref(false);
const busy = computed(() => loading.value || running.value);

watch(
  [modelUrl, contextTokens, executionMode, preparationPipeline, thinkingMode, thinkingTokens],
  () => {
    loaded.value = false;
  },
);

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null) {
    return JSON.stringify(error, null, 2);
  }
  return String(error);
}

async function load(): Promise<void> {
  loading.value = true;
  loaded.value = false;
  errorText.value = '';
  responseText.value = '';
  timingsText.value = '';
  traceText.value = '';
  status.value = 'Preparing model download…';

  try {
    await loadModel(
      modelUrl.value,
      ({ loaded: bytes, total }) => {
        const percent = total > 0 ? Math.round((bytes / total) * 100) : 0;
        status.value = `Downloading model: ${percent}% (${bytes} / ${total} bytes)`;
      },
      {
        contextTokensPerSequence: contextTokens.value,
        executionMode: executionMode.value,
        preparationPipeline: preparationPipeline.value,
        thinkingMode: thinkingMode.value,
        thinkingTokens: thinkingTokens.value,
      },
    );
    loaded.value = true;
    status.value = 'Model loaded. Jet is ready.';
  } catch (error) {
    errorText.value = errorMessage(error);
    status.value = 'Model loading failed.';
  } finally {
    loading.value = false;
  }
}

async function run(): Promise<void> {
  running.value = true;
  errorText.value = '';
  responseText.value = '';
  timingsText.value = '';
  traceText.value = '';

  try {
    const request = JSON.parse(requestText.value) as unknown;
    if (!isModelLoaded(modelUrl.value)) {
      throw new Error('Load this model before running Jet.');
    }
    status.value = 'Scoring candidates…';
    const response = await runDecision(modelUrl.value, request);
    responseText.value = JSON.stringify(response, null, 2);
    timingsText.value = JSON.stringify(await engineTimings(modelUrl.value), null, 2);
    status.value = 'Decision complete.';
  } catch (error) {
    errorText.value = errorMessage(error);
    status.value = 'Decision failed.';
  } finally {
    running.value = false;
  }
}

async function runBatch(): Promise<void> {
  running.value = true;
  errorText.value = '';
  responseText.value = '';
  timingsText.value = '';
  traceText.value = '';

  try {
    const request = JSON.parse(requestText.value) as unknown;
    if (!isModelLoaded(modelUrl.value)) {
      throw new Error('Load this model before running Jet.');
    }
    status.value = 'Scoring a two-request batch...';
    const response = await runDecisionBatch(modelUrl.value, [request, request]);
    responseText.value = JSON.stringify(response, null, 2);
    timingsText.value = JSON.stringify(await engineTimings(modelUrl.value), null, 2);
    status.value = 'Batch decision complete.';
  } catch (error) {
    errorText.value = errorMessage(error);
    status.value = 'Batch decision failed.';
  } finally {
    running.value = false;
  }
}

async function runTrace(): Promise<void> {
  running.value = true;
  errorText.value = '';
  responseText.value = '';
  timingsText.value = '';
  traceText.value = '';

  try {
    const request = JSON.parse(requestText.value) as unknown;
    if (!isModelLoaded(modelUrl.value)) {
      throw new Error('Load this model before running Jet.');
    }
    status.value = 'Scoring and recording the engine trace...';
    const result = (await runDecisionTrace(modelUrl.value, request)) as {
      response: unknown;
      trace: unknown;
    };
    responseText.value = JSON.stringify(result.response, null, 2);
    traceText.value = JSON.stringify(result.trace, null, 2);
    timingsText.value = JSON.stringify(await engineTimings(modelUrl.value), null, 2);
    status.value = 'Trace decision complete.';
  } catch (error) {
    errorText.value = errorMessage(error);
    status.value = 'Trace decision failed.';
  } finally {
    running.value = false;
  }
}
</script>

<template>
  <main>
    <h1>JET WebGPU Playground</h1>
    <p>{{ status }}</p>

    <section>
      <h2>Model</h2>
      <p>
        <label for="model-url">GGUF model URL</label>
      </p>
      <p>
        <input id="model-url" v-model="modelUrl" type="url" size="100" :disabled="busy" />
      </p>
      <button type="button" :disabled="busy" @click="load">
        {{ loading ? 'Loading…' : loaded ? 'Reload model' : 'Load model' }}
      </button>
      <fieldset :disabled="busy">
        <legend>EngineConfig</legend>
        <p>
          <label for="context-tokens">
            Context tokens per sequence
            <input id="context-tokens" v-model.number="contextTokens" type="number" min="128" step="128" />
          </label>
        </p>
        <p>
          <label for="execution-mode">
            Execution
            <select id="execution-mode" v-model="executionMode">
              <option value="batched">batched</option>
              <option value="reference">reference</option>
            </select>
          </label>
        </p>
        <p>
          <label>
            <input id="preparation-pipeline" v-model="preparationPipeline" type="checkbox" />
            Preparation pipeline
          </label>
        </p>
        <p>
          <label for="thinking-mode">
            Thinking
            <select id="thinking-mode" v-model="thinkingMode">
              <option value="disabled">disabled</option>
              <option value="auto">auto</option>
              <option value="required">required</option>
            </select>
          </label>
        </p>
        <p>
          <label for="thinking-tokens">
            Thinking token budget
            <input id="thinking-tokens" v-model.number="thinkingTokens" type="number" min="1" />
          </label>
        </p>
      </fieldset>
    </section>

    <section>
      <h2>DecisionRequest</h2>
      <p>
        <label for="request">JSON request</label>
      </p>
      <textarea
        id="request"
        v-model="requestText"
        rows="34"
        cols="100"
        spellcheck="false"
        :disabled="busy"
      />
      <p>
        <button type="button" :disabled="busy || !loaded" @click="run">
          {{ running ? 'Running…' : 'Run Jet' }}
        </button>
        <button type="button" :disabled="busy || !loaded" @click="runBatch">
          Run Jet batch x2
        </button>
        <button type="button" :disabled="busy || !loaded" @click="runTrace">
          Run Jet with trace
        </button>
      </p>
    </section>

    <section v-if="responseText">
      <h2>DecisionResponse</h2>
      <pre>{{ responseText }}</pre>
    </section>

    <section v-if="timingsText">
      <h2>EngineTimings</h2>
      <pre>{{ timingsText }}</pre>
    </section>

    <section v-if="traceText">
      <h2>EngineTrace</h2>
      <pre>{{ traceText }}</pre>
    </section>

    <section v-if="errorText">
      <h2>Error</h2>
      <pre>{{ errorText }}</pre>
    </section>
  </main>
</template>
