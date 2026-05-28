export interface Model {
    name: string;
}

export interface BenchmarkConfig {
    models: Model[];
    prompts: string[];
    runs: number;
}

export interface RunMetrics {
    ttftMs: number;
    totalDurationMs: number;
    tokensGenerated: number;
    tokensPerSecond: number;
}

export interface RunResult {
    runId: number;
    timestamp: string;
    success?: boolean;
    output?: string;
    metrics?: RunMetrics;
    error?: string;

    retries?: number;
    skipped?: boolean;
    skipAction?: 'skip_run' | 'skip_prompt' | 'skip_model';
    crashReport?: string;
}

export interface HardwareInfo {
    os: string;
    cpuThreads: number | string;
    ramGB: number | string;
    gpu: string;
    vram: string;
}

export interface BenchmarkState {
    isComplete: boolean;
    isInterrupted: boolean;
    currentModelIdx: number;
    currentPromptIdx: number;
    currentRunIdx: number;
    currentRunRetries: number;
    results: Record<string, Record<string, RunResult[]>>;
    hardware: HardwareInfo | null;
}

export interface DownloadProgressData {
    status: 'initiate' | 'download' | 'progress' | 'done' | 'ready';
    text?: string;
    progress?: number;
}

export type WorkerInitMessage = { type: 'init'; modelName: string };
export type WorkerGenerateMessage = { type: 'generate'; text: string; maxTokens?: number };
export type WorkerIncomingMessage = WorkerInitMessage | WorkerGenerateMessage;

export type WorkerOutgoingMessage =
    | { status: 'loading_model' | 'model_ready' }
    | { status: 'progress'; data: DownloadProgressData }
    | { status: 'stream'; token: string }
    | { status: 'complete'; output: string; metrics: RunMetrics }
    | { status: 'error'; error: string };