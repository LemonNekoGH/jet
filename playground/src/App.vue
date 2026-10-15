<script setup vapor lang="ts">
import { computed, ref, watch } from 'vue';

import ProbabilityResults from './components/ProbabilityResults.vue';
import QuestionEditor from './components/QuestionEditor.vue';
import type { DecisionResponse, QuestionDraft, ResultGroup } from './playground';
import { isModelLoaded, loadModel, runDecision, supportsWebGpu } from './runtime';

const defaultModelUrl =
  'https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/23749fefcc72300e3a2ad315e1317431b06b590a/Qwen3-0.6B-Q8_0.gguf';

let nextQuestionId = 3;
let nextOptionId = 6;

const prompt = ref('Login fails for all users');
const questions = ref<QuestionDraft[]>([
  {
    id: 'question-1',
    text: 'Who should own this incident?',
    options: [
      { id: 'option-1', text: 'Application team' },
      { id: 'option-2', text: 'Infrastructure team' },
    ],
  },
  {
    id: 'question-2',
    text: 'How severe is it?',
    options: [
      { id: 'option-3', text: 'Low' },
      { id: 'option-4', text: 'Medium' },
      { id: 'option-5', text: 'High' },
    ],
  },
]);

const modelLoaded = ref(isModelLoaded(defaultModelUrl));
const loading = ref(false);
const running = ref(false);
const downloadPercent = ref(0);
const errorText = ref('');
const results = ref<ResultGroup[]>([]);
const busy = computed(() => loading.value || running.value);

const modelStatus = computed(() => {
  if (!supportsWebGpu()) return 'WebGPU unavailable';
  if (loading.value) return `Loading ${downloadPercent.value}%`;
  if (modelLoaded.value) return 'Ready on WebGPU';
  return 'Qwen3 0.6B · WebGPU';
});

watch(
  [prompt, questions],
  () => {
    results.value = [];
    errorText.value = '';
  },
  { deep: true },
);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function ensureModel(): Promise<boolean> {
  if (isModelLoaded(defaultModelUrl)) {
    modelLoaded.value = true;
    return true;
  }
  if (!supportsWebGpu()) {
    errorText.value = 'This browser does not expose WebGPU.';
    return false;
  }

  loading.value = true;
  downloadPercent.value = 0;
  errorText.value = '';
  try {
    await loadModel(
      defaultModelUrl,
      ({ loaded, total }) => {
        downloadPercent.value = total > 0 ? Math.round((loaded / total) * 100) : 0;
      },
      {
        contextTokensPerSequence: 1024,
        executionMode: 'batched',
        preparationPipeline: true,
        thinkingMode: 'disabled',
        thinkingTokens: 256,
      },
    );
    modelLoaded.value = true;
    downloadPercent.value = 100;
    return true;
  } catch (error) {
    errorText.value = errorMessage(error);
    return false;
  } finally {
    loading.value = false;
  }
}

function validateDraft(): void {
  if (!prompt.value.trim()) throw new Error('Enter a prompt before running Jet.');
  if (questions.value.length === 0) throw new Error('Add at least one question.');
  questions.value.forEach((question, questionIndex) => {
    if (!question.text.trim()) throw new Error(`Question ${questionIndex + 1} is empty.`);
    const options = question.options.map((option) => option.text.trim()).filter(Boolean);
    if (options.length < 2) {
      throw new Error(`Question ${questionIndex + 1} needs at least two options.`);
    }
  });
}

function buildRequest(): unknown {
  return {
    state: { prompt: prompt.value.trim() },
    questions: Object.fromEntries(
      questions.value.map((question, questionIndex) => [
        `question_${questionIndex + 1}`,
        {
          type: 'choice',
          instructions: question.text.trim(),
          criteria: Object.fromEntries(
            question.options
              .filter((option) => option.text.trim())
              .map((option, optionIndex) => [`option_${optionIndex + 1}`, option.text.trim()]),
          ),
        },
      ]),
    ),
  };
}

function responseToResults(response: DecisionResponse): ResultGroup[] {
  return questions.value.map((question, questionIndex) => {
    const answer = response.answers[`question_${questionIndex + 1}`];
    if (!answer || answer.type !== 'choice') {
      throw new Error(`Jet did not return a choice result for question ${questionIndex + 1}.`);
    }
    return {
      id: question.id,
      question: question.text.trim(),
      options: question.options
        .filter((option) => option.text.trim())
        .map((option, optionIndex) => {
          const key = `option_${optionIndex + 1}`;
          return {
            id: option.id,
            label: option.text.trim(),
            probability: answer.probabilities[key] ?? 0,
            winner: answer.choice === key,
          };
        }),
    };
  });
}

async function run(): Promise<void> {
  running.value = true;
  errorText.value = '';
  results.value = [];
  try {
    validateDraft();
    if (!(await ensureModel())) return;
    const response = (await runDecision(defaultModelUrl, buildRequest())) as DecisionResponse;
    results.value = responseToResults(response);
  } catch (error) {
    errorText.value = errorMessage(error);
  } finally {
    running.value = false;
  }
}

function addQuestion(): void {
  questions.value.push({
    id: `question-${nextQuestionId++}`,
    text: '',
    options: [
      { id: `option-${nextOptionId++}`, text: '' },
      { id: `option-${nextOptionId++}`, text: '' },
    ],
  });
}

function removeQuestion(index: number): void {
  questions.value.splice(index, 1);
}

function addOption(questionIndex: number): void {
  questions.value[questionIndex]?.options.push({
    id: `option-${nextOptionId++}`,
    text: '',
  });
}

function removeOption(questionIndex: number, optionIndex: number): void {
  questions.value[questionIndex]?.options.splice(optionIndex, 1);
}
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="https://jet.yetanother.ai/" aria-label="Jet home">Jet</a>
      <div class="model-control">
        <span class="model-label">
          <span
            class="status-dot"
            :class="{ ready: modelLoaded, loading, unavailable: !supportsWebGpu() }"
            aria-hidden="true"
          />
          {{ modelStatus }}
        </span>
        <button class="model-button" type="button" :disabled="busy || modelLoaded" @click="ensureModel">
          {{ loading ? 'Loading model…' : modelLoaded ? 'Model ready' : 'Load model' }}
        </button>
      </div>
    </header>

    <main class="page">
      <div class="intro">
        <h1>Ask Jet</h1>
        <p>Compare fixed answers with a local language model.</p>
      </div>

      <div class="workspace">
        <section class="composer" aria-labelledby="composer-title">
          <h2 id="composer-title" class="visually-hidden">Build a decision</h2>
          <label class="field-label" for="prompt">Prompt</label>
          <div class="prompt-field">
            <textarea
              id="prompt"
              v-model="prompt"
              maxlength="4000"
              rows="4"
              :disabled="busy"
              placeholder="Describe the situation Jet should evaluate"
            />
            <span class="character-count">{{ prompt.length }} / 4000</span>
          </div>

          <div class="section-heading">
            <h2>Questions</h2>
            <span>{{ questions.length }} {{ questions.length === 1 ? 'question' : 'questions' }}</span>
          </div>

          <div class="question-list">
            <QuestionEditor
              v-for="(question, questionIndex) in questions"
              :key="question.id"
              :question="question"
              :index="questionIndex"
              :disabled="busy"
              :can-remove="questions.length > 1"
              @remove-question="removeQuestion(questionIndex)"
              @add-option="addOption(questionIndex)"
              @remove-option="(optionIndex) => removeOption(questionIndex, optionIndex)"
            />
          </div>

          <button class="secondary-button add-question" type="button" :disabled="busy" @click="addQuestion">
            <span aria-hidden="true">＋</span> Add question
          </button>

          <button class="run-button" type="button" :disabled="busy" @click="run">
            <span class="play-icon" aria-hidden="true" />
            {{ loading ? `Loading model ${downloadPercent}%` : running ? 'Jet is thinking…' : 'Run Jet' }}
          </button>
          <p v-if="errorText" class="error-message" role="alert">{{ errorText }}</p>
        </section>

        <section class="results-panel" aria-labelledby="results-title" aria-live="polite">
          <div class="results-heading">
            <h2 id="results-title">Results</h2>
            <p>Relative likelihood across the options in each question.</p>
          </div>

          <ProbabilityResults v-if="results.length" :groups="results" />
          <div v-else class="empty-results">
            <div class="empty-bars" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <h3>Your results will appear here</h3>
            <p>Add your questions and options, then run Jet locally in your browser.</p>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
