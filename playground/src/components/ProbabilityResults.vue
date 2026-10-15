<script setup vapor lang="ts">
import type { ResultGroup } from '../playground';

defineProps<{ groups: ResultGroup[] }>();

function percent(probability: number): string {
  return `${(probability * 100).toFixed(1)}%`;
}
</script>

<template>
  <div class="result-list">
    <article v-for="(group, groupIndex) in groups" :key="group.id" class="result-group">
      <h3><span>{{ groupIndex + 1 }}.</span> {{ group.question }}</h3>
      <div class="probability-list">
        <div v-for="option in group.options" :key="option.id" class="probability-row">
          <div class="probability-label">
            <span>{{ option.label }}</span>
            <strong>{{ percent(option.probability) }}</strong>
          </div>
          <div
            class="probability-track"
            role="meter"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="Math.round(option.probability * 100)"
            :aria-label="`${option.label}: ${percent(option.probability)}`"
          >
            <span
              class="probability-fill"
              :class="{ winner: option.winner }"
              :style="{ width: `${Math.max(option.probability * 100, 0.8)}%` }"
            />
          </div>
        </div>
      </div>
    </article>
  </div>
</template>
