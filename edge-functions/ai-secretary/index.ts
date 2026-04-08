// edge-functions/ai-secretary/index.ts
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { executeTool, TOOL_DEFINITIONS, type ToolName } from "../_shared/tool-executor.ts";

// TODO: implement handler
Deno.serve(async (_req: Request) => {
  return new Response("ai-secretary not yet implemented", { status: 501 });
});
