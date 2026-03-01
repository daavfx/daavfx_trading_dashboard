// Type definitions for TinyLLM routing - matches Rust RoutingResponse exactly

export interface RoutingResponse {
  output: string;
  route: string;
  pending_inference: boolean;
  message: string | null;
}
