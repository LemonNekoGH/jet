<script setup vapor lang="ts">
import type { QuestionDraft } from '../playground';

defineProps<{
  question: QuestionDraft;
  index: number;
  disabled: boolean;
  canRemove: boolean;
}>();

defineEmits<{
  removeQuestion: [];
  addOption: [];
  removeOption: [index: number];
}>();

function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}
</script>

<template>
  <article class="question-editor">
    <div class="question-row">
      <span class="question-number">{{ index + 1 }}</span>
      <label class="visually-hidden" :for="`question-${question.id}`">Question {{ index + 1 }}</label>
      <input
        :id="`question-${question.id}`"
        v-model="question.text"
        class="question-input"
        type="text"
        :disabled="disabled"
        placeholder="What should Jet decide?"
      />
      <button
        v-if="canRemove"
        class="icon-button remove-question"
        type="button"
        :disabled="disabled"
        :aria-label="`Remove question ${index + 1}`"
        @click="$emit('removeQuestion')"
      >
        ×
      </button>
    </div>

    <div class="option-list">
      <div v-for="(option, optionIndex) in question.options" :key="option.id" class="option-row">
        <span class="option-letter" aria-hidden="true">{{ optionLetter(optionIndex) }}</span>
        <label class="visually-hidden" :for="`option-${option.id}`">
          Option {{ optionIndex + 1 }} for question {{ index + 1 }}
        </label>
        <input
          :id="`option-${option.id}`"
          v-model="option.text"
          type="text"
          :disabled="disabled"
          :placeholder="`Option ${optionIndex + 1}`"
        />
        <button
          class="icon-button"
          type="button"
          :disabled="disabled || question.options.length <= 2"
          :aria-label="`Remove option ${optionIndex + 1}`"
          @click="$emit('removeOption', optionIndex)"
        >
          ×
        </button>
      </div>
    </div>

    <button class="text-button" type="button" :disabled="disabled" @click="$emit('addOption')">
      <span aria-hidden="true">＋</span> Add option
    </button>
  </article>
</template>
