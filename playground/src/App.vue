<script setup vapor lang="ts">
import { computed, ref, watch } from 'vue';

import {
  isModelLoaded,
  loadModel,
  runDecision,
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
const requestText = ref(JSON.stringify(defaultRequest, null, 2));
const status = ref(supportsWebGpu() ? 'Model is not loaded.' : 'WebGPU is unavailable.');
const responseText = ref('');
const errorText = ref('');
const loading = ref(false);
const running = ref(false);
const loaded = ref(false);
const busy = computed(() => loading.value || running.value);

watch(modelUrl, () => {
  loaded.value = false;
});

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
  status.value = 'Preparing model download…';

  try {
    await loadModel(modelUrl.value, ({ loaded: bytes, total }) => {
      const percent = total > 0 ? Math.round((bytes / total) * 100) : 0;
      status.value = `Downloading model: ${percent}% (${bytes} / ${total} bytes)`;
    });
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

  try {
    const request = JSON.parse(requestText.value) as unknown;
    if (!isModelLoaded(modelUrl.value)) {
      throw new Error('Load this model before running Jet.');
    }
    status.value = 'Scoring candidates…';
    const response = await runDecision(modelUrl.value, request);
    responseText.value = JSON.stringify(response, null, 2);
    status.value = 'Decision complete.';
  } catch (error) {
    errorText.value = errorMessage(error);
    status.value = 'Decision failed.';
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
      </p>
    </section>

    <section v-if="responseText">
      <h2>DecisionResponse</h2>
      <pre>{{ responseText }}</pre>
    </section>

    <section v-if="errorText">
      <h2>Error</h2>
      <pre>{{ errorText }}</pre>
    </section>
  </main>
</template>
