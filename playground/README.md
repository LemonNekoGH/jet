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
