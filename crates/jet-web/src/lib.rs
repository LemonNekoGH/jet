use jet_core::{DecisionRequest, ErrorCode, JetError};
use jet_decision::{ScoreResult, build_response, prepare_request};
use js_sys::{Function, Promise, Reflect};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;

#[derive(Serialize)]
struct ScoreMessage<'a> {
    role: &'static str,
    content: &'a str,
}

#[derive(Serialize)]
struct ScoreKnownTextsRequest<'a> {
    messages: [ScoreMessage<'a>; 2],
    targets: Vec<&'a str>,
    template_kwargs: TemplateKwargs,
}

#[derive(Serialize)]
struct ScoreKnownTextBatchRequest<'a> {
    groups: Vec<ScoreKnownTextsRequest<'a>>,
}

#[derive(Serialize)]
struct TemplateKwargs {
    enable_thinking: bool,
}

#[derive(Deserialize)]
struct KnownTextScore {
    total_log_probability: f64,
    target_token_count: usize,
}

#[derive(Deserialize)]
struct ScoreKnownTextsResponse {
    scores: Vec<KnownTextScore>,
    prompt_token_count: usize,
    prefill_count: usize,
}

#[derive(Deserialize)]
struct ScoreKnownTextBatchResponse {
    groups: Vec<ScoreKnownTextsResponse>,
}

#[derive(Serialize)]
struct WebError {
    code: ErrorCode,
    message: String,
}

#[wasm_bindgen]
pub async fn decide(
    model_id: String,
    request: JsValue,
    score_known_texts: Function,
) -> std::result::Result<JsValue, JsValue> {
    let request: DecisionRequest = serde_wasm_bindgen::from_value(request)
        .map_err(|error| web_error(JetError::InvalidRequest(error.to_string())))?;
    let plans = prepare_request(&request).map_err(web_error)?;
    let score_request = ScoreKnownTextBatchRequest {
        groups: plans
            .iter()
            .map(|plan| ScoreKnownTextsRequest {
                messages: [
                    ScoreMessage {
                        role: "system",
                        content: jet_decision::SYSTEM_INSTRUCTION,
                    },
                    ScoreMessage {
                        role: "user",
                        content: &plan.user_content,
                    },
                ],
                targets: plan
                    .candidates
                    .iter()
                    .map(|candidate| candidate.target.as_str())
                    .collect(),
                template_kwargs: TemplateKwargs {
                    enable_thinking: false,
                },
            })
            .collect(),
    };
    let argument = serde_wasm_bindgen::to_value(&score_request)
        .map_err(|error| web_error(JetError::NativeRuntime(error.to_string())))?;
    let returned = score_known_texts
        .call1(&JsValue::UNDEFINED, &argument)
        .map_err(js_runtime_error)?;
    let value = JsFuture::from(Promise::resolve(&returned))
        .await
        .map_err(js_runtime_error)?;
    let scored: ScoreKnownTextBatchResponse = serde_wasm_bindgen::from_value(value)
        .map_err(|error| web_error(JetError::NativeRuntime(error.to_string())))?;
    if scored.groups.len() != plans.len() {
        return Err(web_error(JetError::NativeRuntime(format!(
            "scoreKnownTextBatch returned {} groups for {} questions",
            scored.groups.len(),
            plans.len()
        ))));
    }

    let mut scores = Vec::with_capacity(plans.len());
    for (plan, scored) in plans.iter().zip(scored.groups) {
        if scored.scores.len() != plan.candidates.len() {
            return Err(web_error(JetError::NativeRuntime(format!(
                "scoreKnownTextBatch returned {} scores for {} candidates",
                scored.scores.len(),
                plan.candidates.len()
            ))));
        }
        if scored.prefill_count == 0 {
            return Err(web_error(JetError::NativeRuntime(
                "scoreKnownTextBatch returned a zero prefill count".to_owned(),
            )));
        }

        let mut log_probabilities = Vec::with_capacity(scored.scores.len());
        let mut target_token_counts = Vec::with_capacity(scored.scores.len());
        for score in scored.scores {
            if score.total_log_probability.is_nan()
                || score.total_log_probability == f64::INFINITY
                || score.total_log_probability > 0.0
            {
                return Err(web_error(JetError::NonFiniteScore(format!(
                    "scoreKnownTextBatch returned invalid total log-probability {}",
                    score.total_log_probability
                ))));
            }
            if score.target_token_count == 0 {
                return Err(web_error(JetError::NativeRuntime(
                    "scoreKnownTextBatch returned an empty target".to_owned(),
                )));
            }
            log_probabilities.push(score.total_log_probability);
            target_token_counts.push(score.target_token_count);
        }

        scores.push(ScoreResult {
            log_probabilities,
            prompt_tokens: scored.prompt_token_count,
            thinking_tokens: 0,
            target_token_counts,
            prefill_count: scored.prefill_count,
        });
    }

    let response = build_response(&model_id, &plans, &scores).map_err(web_error)?;
    response
        .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .map_err(|error| web_error(JetError::NativeRuntime(error.to_string())))
}

fn js_runtime_error(value: JsValue) -> JsValue {
    let message = value
        .as_string()
        .or_else(|| {
            Reflect::get(&value, &JsValue::from_str("message"))
                .ok()
                .and_then(|message| message.as_string())
        })
        .unwrap_or_else(|| "wllama scoreKnownTextBatch failed".to_owned());
    web_error(JetError::NativeRuntime(message))
}

fn web_error(error: JetError) -> JsValue {
    serde_wasm_bindgen::to_value(&WebError {
        code: error.code(),
        message: error.to_string(),
    })
    .unwrap_or_else(|_| JsValue::from_str(&error.to_string()))
}
