# JET WebGPU Playground

This playground runs the complete JET decision contract in a browser. It accepts a `DecisionRequest` and returns the same `DecisionResponse` shape as the native engine.

The browser pipeline has four parts:

```text
DecisionRequest
      │
      ▼
jet-decision (Rust compiled to Wasm)
  validate + render prompts + enumerate candidates
      │
      ▼
patched wllama scoreKnownTextBatch()
  chat template + WebGPU inference + token log probabilities
      │
      ▼
jet-decision
  length normalization + softmax + answer mapping + usage
      │
      ▼
DecisionResponse
```

`scoreKnownTextBatch()` does not sample text. It applies the model's chat template with thinking disabled, batches the prompts for all questions, copies each shared prompt state to its candidate sequences, and evaluates those continuations in a shared WebGPU decode batch. It sums the log probability of each candidate's tokens. JET then compares the candidates with the same shared Rust code used by `jet-engine`.

## Build and run

Install the root mise toolchain first. Docker must be running because wllama builds llama.cpp with Emscripten in a pinned container.

```sh
mise install
mise run playground:dev
```

The first run clones the pinned wllama commit, applies `patches/wllama-score-known-text.patch`, builds its WebGPU runtime, builds `jet-web.wasm`, and installs the frontend dependencies. Open the local URL printed by Vite, load the default Qwen3 GGUF, then select **Run Jet**.

Create a production bundle with:

```sh
mise run playground:build
```

The generated wllama and Jet wasm files are build artifacts under `playground/generated/`; the production output is under `playground/dist/`. Both are ignored by Git.

## Browser requirements

- A browser with WebGPU enabled.
- Enough device and system memory for the GGUF model and two inference contexts.
- A model URL that allows cross-origin browser downloads.
- Cross-origin opener and embedder headers. The included Vite development and preview servers set them. A production host must also send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.

The adapter uses up to nine sequences per scoring wave. Large requests are split into additional waves when their prompts and candidate continuations exceed the sequence or context capacity.
