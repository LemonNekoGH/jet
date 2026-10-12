# JET WebGPU Playground

This playground runs the complete JET decision contract in a browser. It accepts a `DecisionRequest` and returns the same `DecisionResponse` shape as the native engine.

The browser pipeline is one Emscripten module:

```text
DecisionRequest
      │
      ▼
jet-engine + jet-decision + jet-core (Rust)
  validate + render + tokenize + schedule
      │
      ▼
Jet's vendored llama.cpp (C/C++)
  WebGPU inference + teacher-forced token log probabilities
      │
      ▼
jet-decision (the same Rust code as native Jet)
  length normalization + softmax + answer mapping + usage
      │
      ▼
DecisionResponse
```

The module calls the original `Engine::decide` and `Engine::decide_batch` paths. Prompt rendering, combined prompt-plus-target tokenization, prefix validation, scheduling, cache reuse, thinking, probability checks, response construction, and timings stay in `jet-engine`. wllama supplies browser workers, model download/cache, HeapFS, and the TypeScript facade. It does not implement a second scorer.

The plain HTML controls expose the batched/reference execution mode, preparation pipeline, and disabled/auto/required thinking modes. **Run Jet with trace** records the actual rendered prompts, prompt token IDs, target suffix token IDs, and raw log probabilities from the same scoring call.

## Build and run

Install the root mise toolchain first. Docker must be running because wllama builds llama.cpp with Emscripten in a pinned container.

```sh
mise install
mise run playground:dev
```

The first run clones the pinned wllama commit, applies `patches/wllama-jet-engine.patch`, compiles `jet-web` and Jet's vendored llama.cpp into one WebGPU Wasm module, and installs the frontend dependencies. Open the local URL printed by Vite, load the default Qwen3 GGUF, then select **Run Jet**.

Create a production bundle with:

```sh
mise run playground:build
```

The generated wllama package and single Wasm file are under `playground/generated/`. The production output is under `playground/dist/`. Git ignores both directories.

`jet-llama-sys` selects checked bindings generated for Emscripten's memory32 ABI when `webgpu` and `external-link` are enabled. The normal native build keeps its 64-bit bindings. Regenerate the browser bindings after changing the wrapper or vendored llama.cpp headers with:

```sh
mise run playground:bindings
```

The generator uses the Emscripten 4.0.20 sysroot from the pinned wllama build. Rust layout assertions cover the generated memory32 types. Emscripten `static_assert`s validate the boundary structs during the final C++ link. The `webgpu` feature requires `external-link`. The wllama CMake build sets `GGML_WEBGPU=ON` and links Jet and llama.cpp into the single module.

## Browser requirements

- A browser with WebGPU enabled.
- Enough device and system memory for the GGUF model and Jet inference context.
- A model URL that allows cross-origin browser downloads.
- Cross-origin opener and embedder headers. The included Vite development and preview servers set them. A production host must also send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.

The adapter uses up to nine sequences per scoring wave. Large requests are split into additional waves when their prompts and candidate continuations exceed the sequence or context capacity.

## Native/WebGPU parity record

[`validation/qwen3-0.6b-q8_0-metal-webgpu.json`](validation/qwen3-0.6b-q8_0-metal-webgpu.json) contains paired Metal and WebGPU runs with one Qwen3 GGUF. Each decision request creates three jobs and seven candidates.

The parity limits for disabled-thinking runs are:

- Rendered prompts, prompt token IDs, target text, and target suffix IDs must match exactly.
- The absolute difference for each raw log probability must be `0.05` or less.
- The model, choices, usage, and workload counters must match exactly.
- The absolute difference for each response number must be `0.005` or less.
- The browser console must have no errors.

The record satisfies these limits. Its largest raw log-probability difference is `0.026615154114097095`. Its largest response-number difference is `0.0012078129770675128`. The complete responses are numerically close, but they are not exactly equal.

Reference execution uses the same limits. The paired Reference run also satisfies them. Its largest raw log-probability difference is `0.030903160743910973`. Its largest response-number difference is `0.001253383935402863`.

Thinking runs use these limits:

- Target text, target suffix IDs, model, choices, usage, and workload counters must match exactly.
- The absolute difference for each raw log probability must be `0.10` or less.
- The absolute difference for each response number must be `0.02` or less.
- The browser console must have no errors.

Thinking uses sampling. Metal and WebGPU can select different thinking tokens. Thus, the generated thinking text and its token IDs do not require exact equality.

The Auto and Required runs satisfy their limits. Both have a largest raw log-probability difference of `0.02467398199945592`. Both have a largest response-number difference of `0.001347560393406444`. Their generated thinking text and token IDs match in this record.

The mixed-batch run requires the same result order. Error codes and messages must match exactly. Successful items use the disabled-thinking response limits.

The mixed-batch run returns one success and one `invalid_request` error on both backends. The error messages match exactly.

Metal and WebGPU use different compute paths. This difference can explain the numerical drift, but this record does not isolate its cause.

`decideMs` is wall time in the browser test. It includes the UI event, JavaScript bridge, engine call, timing request, rendering, and status wait. `timings.batch_ms` is internal Jet engine time for the scoring batch. These values have different boundaries.

The record also contains a same-process hot profile after one warm-up decision. For the three-job, seven-candidate request, 11 WebGPU samples have a mean wall time of `215.705 ms` and a mean engine batch time of `215.460 ms`. The native Metal engine sample is `83.638 ms`, so WebGPU is about `2.58x` slower for this measured request. The Metal value is one sample, so this is a directional comparison rather than a cross-backend statistical benchmark.

The record contains paired runs for Reference, Auto thinking, Required thinking, and a mixed success/error batch. The Qwen3 model is not hybrid. Thus, its zero `prepare_wait_ms` does not exercise the hybrid preparation pipeline.
