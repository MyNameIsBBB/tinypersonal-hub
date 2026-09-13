import {
  runChatAgent as runBackendChatAgent,
  type RunAgentInput,
} from "@tinypersonal/backend-api";
import { after } from "next/server";

export async function runChatAgent(input: RunAgentInput) {
  const { response, persistenceTask } = await runBackendChatAgent(input);
  after(() => persistenceTask);
  return response;
}
