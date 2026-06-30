export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: options.body === undefined ? undefined : { "content-type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(userFacingError(data?.error ?? data?.message ?? "Request failed"));
  }
  return data as T;
}

export function userFacingError(error: string): string {
  if (error === "llm_config_missing") return "Extraction needs setup.";
  if (error === "llm_no_valid_candidates") return "No actionable cards found in some sessions.";
  if (error === "llm_output_invalid") return "Extractor returned an unusable response.";
  if (error === "llm_batch_failed") return "Some sessions could not be processed.";
  if (error === "llm_timeout") return "Extraction timed out.";
  if (error === "llm_provider_failed") return "Extraction service could not finish.";
  if (error === "llm_input_truncated") return "Some session text was shortened for extraction.";
  if (error === "organize_scope_truncated") return "Some older sessions were left out by current limits.";
  if (error === "path_not_found") return "Source path needs setup.";
  if (error === "codex_path_not_found") return "Codex source path was not found.";
  if (error === "claude-code_path_not_found") return "Claude source path was not found.";
  if (error === "codex_no_sessions") return "No Codex sessions were found in the source path.";
  if (error === "claude-code_no_sessions") return "No Claude sessions were found in the source path.";
  if (error === "config_invalid") return "Settings need review.";
  if (error === "database_unavailable") return "Local database is unavailable.";
  if (error === "organize_failed") return "Organize failed. Open diagnostics for details.";
  return error.replace(/_/g, " ");
}
