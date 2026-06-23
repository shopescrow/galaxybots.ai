export class Confidence {
  private readonly _value: number;

  private constructor(value: number) {
    if (value < 0 || value > 1) {
      throw new Error(`Confidence value must be between 0 and 1, got ${value}`);
    }
    this._value = value;
  }

  static of(value: number): Confidence {
    return new Confidence(Math.max(0, Math.min(1, value)));
  }

  static zero(): Confidence {
    return new Confidence(0);
  }

  static full(): Confidence {
    return new Confidence(1);
  }

  get value(): number {
    return this._value;
  }

  decay(factor = 0.1): Confidence {
    return Confidence.of(this._value * (1 - factor));
  }

  reinforce(boost = 0.1): Confidence {
    return Confidence.of(Math.min(1, this._value + boost * (1 - this._value)));
  }

  meetsThreshold(threshold: number): boolean {
    return this._value >= threshold;
  }

  toNumber(): number {
    return this._value;
  }

  toString(): string {
    return `Confidence(${(this._value * 100).toFixed(1)}%)`;
  }
}

export class Cost {
  private readonly _cents: number;

  private constructor(cents: number) {
    if (cents < 0) throw new Error("Cost cannot be negative");
    this._cents = cents;
  }

  static ofCents(cents: number): Cost {
    return new Cost(Math.floor(cents));
  }

  static ofDollars(dollars: number): Cost {
    return new Cost(Math.round(dollars * 100));
  }

  static zero(): Cost {
    return new Cost(0);
  }

  get cents(): number {
    return this._cents;
  }

  get dollars(): number {
    return this._cents / 100;
  }

  add(other: Cost): Cost {
    return new Cost(this._cents + other._cents);
  }

  exceeds(limitCents: number): boolean {
    return this._cents > limitCents;
  }

  toString(): string {
    return `$${this.dollars.toFixed(4)}`;
  }
}

export class Duration {
  private readonly _ms: number;

  private constructor(ms: number) {
    this._ms = Math.max(0, ms);
  }

  static ofMs(ms: number): Duration {
    return new Duration(ms);
  }

  static since(startMs: number): Duration {
    return new Duration(Date.now() - startMs);
  }

  get ms(): number {
    return this._ms;
  }

  get seconds(): number {
    return this._ms / 1000;
  }

  exceeds(limitMs: number): boolean {
    return this._ms > limitMs;
  }

  toString(): string {
    return `${this.seconds.toFixed(2)}s`;
  }
}

export interface ThoughtData {
  content: string;
  iteration: number;
  timestamp: number;
}

export class Thought {
  readonly content: string;
  readonly iteration: number;
  readonly timestamp: number;

  constructor(data: ThoughtData) {
    this.content = data.content;
    this.iteration = data.iteration;
    this.timestamp = data.timestamp;
  }

  static create(content: string, iteration: number): Thought {
    return new Thought({ content, iteration, timestamp: Date.now() });
  }

  toJSON(): ThoughtData {
    return { content: this.content, iteration: this.iteration, timestamp: this.timestamp };
  }
}

export interface ActionData {
  toolName: string;
  toolCallId: string;
  arguments: Record<string, unknown>;
  iteration: number;
  idempotencyKey?: string;
  timestamp: number;
}

export class Action {
  readonly toolName: string;
  readonly toolCallId: string;
  readonly arguments: Record<string, unknown>;
  readonly iteration: number;
  readonly idempotencyKey?: string;
  readonly timestamp: number;

  constructor(data: ActionData) {
    this.toolName = data.toolName;
    this.toolCallId = data.toolCallId;
    this.arguments = data.arguments;
    this.iteration = data.iteration;
    this.idempotencyKey = data.idempotencyKey;
    this.timestamp = data.timestamp;
  }

  static create(toolName: string, toolCallId: string, args: Record<string, unknown>, iteration: number): Action {
    return new Action({ toolName, toolCallId, arguments: args, iteration, timestamp: Date.now() });
  }

  toJSON(): ActionData {
    return {
      toolName: this.toolName,
      toolCallId: this.toolCallId,
      arguments: this.arguments,
      iteration: this.iteration,
      idempotencyKey: this.idempotencyKey,
      timestamp: this.timestamp,
    };
  }
}

export interface ObservationData {
  toolName: string;
  toolCallId: string;
  result: unknown;
  error?: string;
  durationMs: number;
  iteration: number;
  timestamp: number;
}

export class Observation {
  readonly toolName: string;
  readonly toolCallId: string;
  readonly result: unknown;
  readonly error?: string;
  readonly durationMs: number;
  readonly iteration: number;
  readonly timestamp: number;

  constructor(data: ObservationData) {
    this.toolName = data.toolName;
    this.toolCallId = data.toolCallId;
    this.result = data.result;
    this.error = data.error;
    this.durationMs = data.durationMs;
    this.iteration = data.iteration;
    this.timestamp = data.timestamp;
  }

  get isError(): boolean {
    return !!this.error;
  }

  toJSON(): ObservationData {
    return {
      toolName: this.toolName,
      toolCallId: this.toolCallId,
      result: this.result,
      error: this.error,
      durationMs: this.durationMs,
      iteration: this.iteration,
      timestamp: this.timestamp,
    };
  }
}

export interface EvaluationData {
  completeness: number;
  accuracy: number;
  relevance: number;
  overallScore: number;
  critique?: string;
  passedGate: boolean;
  iteration: number;
  timestamp: number;
}

export class Evaluation {
  readonly completeness: number;
  readonly accuracy: number;
  readonly relevance: number;
  readonly overallScore: number;
  readonly critique?: string;
  readonly passedGate: boolean;
  readonly iteration: number;
  readonly timestamp: number;

  constructor(data: EvaluationData) {
    this.completeness = data.completeness;
    this.accuracy = data.accuracy;
    this.relevance = data.relevance;
    this.overallScore = data.overallScore;
    this.critique = data.critique;
    this.passedGate = data.passedGate;
    this.iteration = data.iteration;
    this.timestamp = data.timestamp;
  }

  get confidence(): Confidence {
    return Confidence.of(this.overallScore);
  }

  toJSON(): EvaluationData {
    return {
      completeness: this.completeness,
      accuracy: this.accuracy,
      relevance: this.relevance,
      overallScore: this.overallScore,
      critique: this.critique,
      passedGate: this.passedGate,
      iteration: this.iteration,
      timestamp: this.timestamp,
    };
  }
}

export interface LoopTrace {
  botId?: number;
  botName?: string;
  clientId?: number;
  sessionId?: number;
  conversationId?: number;
  startedAt: number;
  endedAt: number;
  thoughts: ReturnType<Thought["toJSON"]>[];
  actions: ReturnType<Action["toJSON"]>[];
  observations: ReturnType<Observation["toJSON"]>[];
  evaluations: ReturnType<Evaluation["toJSON"]>[];
  iterationsCompleted: number;
  totalCostCents: number;
  terminationReason: string;
  failureCategory?: string;
  finalContent: string;
}
