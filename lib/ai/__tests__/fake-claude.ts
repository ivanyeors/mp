import Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParamsBase } from "@anthropic-ai/sdk/resources/beta/messages/messages";

export interface FakeAnswer {
  text: string;
  stop_reason?: "end_turn" | "max_tokens" | "refusal";
  model?: string;
  usage?: { input_tokens: number; output_tokens: number };
  chunk?: number;
  error?: Error;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

class FakeStream {
  private listeners: ((delta: string, snapshot: string) => void)[] = [];
  private aborted = false;
  currentMessage: { model: string; usage: { input_tokens: number; output_tokens: number } } | undefined;
  private readonly done: Promise<unknown>;

  delivered = 0;

  constructor(
    private readonly answer: FakeAnswer,
    private readonly model: string,
    private readonly signal?: AbortSignal,
  ) {
    this.done = this.run();
    this.done.catch(() => undefined);
  }

  on(event: string, fn: (delta: string, snapshot: string) => void) {
    if (event === "text") this.listeners.push(fn);
    return this;
  }

  abort() {
    this.aborted = true;
  }

  private stopped() {
    return this.aborted || Boolean(this.signal?.aborted);
  }

  private async run() {
    await tick();
    if (this.answer.error) throw this.answer.error;
    const model = this.answer.model ?? this.model;
    const usage = this.answer.usage ?? { input_tokens: 3000, output_tokens: 2000 };
    this.currentMessage = { model, usage: { input_tokens: usage.input_tokens, output_tokens: 0 } };
    const size = this.answer.chunk ?? 40;
    let snapshot = "";
    for (let i = 0; i < this.answer.text.length; i += size) {
      if (this.stopped()) throw new Anthropic.APIUserAbortError();
      const delta = this.answer.text.slice(i, i + size);
      snapshot += delta;
      this.delivered = snapshot.length;
      for (const fn of this.listeners) fn(delta, snapshot);
      await tick();
    }
    if (this.stopped()) throw new Anthropic.APIUserAbortError();
    return {
      model,
      stop_reason: this.answer.stop_reason ?? "end_turn",
      usage,
      content: [{ type: "text", text: this.answer.text }],
    };
  }

  finalMessage() {
    return this.done;
  }
}

export function fakeClaude(answers: FakeAnswer[]) {
  const calls: MessageCreateParamsBase[] = [];
  const streams: FakeStream[] = [];
  const stream = (params: MessageCreateParamsBase, opts?: { signal?: AbortSignal }) => {
    calls.push(params);
    const answer = answers[Math.min(calls.length - 1, answers.length - 1)];
    const s = new FakeStream(answer, params.model, opts?.signal);
    streams.push(s);
    return s;
  };
  return {
    client: { beta: { messages: { stream } } } as unknown as Anthropic,
    calls,
    delivered: () => streams.at(-1)?.delivered ?? 0,
  };
}

export const userMessage = (params: MessageCreateParamsBase) => {
  const content = params.messages[0]?.content;
  return typeof content === "string" ? content : JSON.stringify(content);
};
