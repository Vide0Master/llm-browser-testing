import localforage from 'localforage';
import type { BenchmarkConfig, BenchmarkState, RunResult, RunMetrics, HardwareInfo, DownloadProgressData, WorkerOutgoingMessage, Model } from './types';
import Worker from './worker.ts?worker';

export class BenchmarkRunner {
    private models: Model[];
    private prompts: string[];
    private runsPerPrompt: number;
    private onProgressUpdate: (state: BenchmarkState) => void;
    private onLiveTextUpdate: (text: string) => void;
    private worker: Worker | null = null;
    private db: LocalForage;
    private onDownloadProgress: (data: DownloadProgressData) => void;

    constructor(
        config: BenchmarkConfig,
        onProgressUpdate: (state: BenchmarkState) => void,
        onLiveTextUpdate: (text: string) => void,
        onDownloadProgress: (data: DownloadProgressData) => void
    ) {
        this.models = config.models;
        this.prompts = config.prompts;
        this.runsPerPrompt = config.runs;
        this.onProgressUpdate = onProgressUpdate;
        this.onLiveTextUpdate = onLiveTextUpdate;
        this.db = localforage.createInstance({ name: 'llm_benchmark', storeName: 'results' });
        this.onDownloadProgress = onDownloadProgress;
    }

    public async startOrResume(hardware?: HardwareInfo): Promise<void> {
        let state = await this.db.getItem<BenchmarkState>('benchmark_state');

        if (!state) {
            if (!hardware) throw new Error("Hardware info required for new benchmark");
            state = this.createNewState(hardware);
            await this.saveState(state);
        }

        if (state.isInterrupted) {
            this.onProgressUpdate(state);
            return;
        }

        this.onProgressUpdate(state);
        await this.runLoop(state);
    }

    public async resolveInterruption(
        action: 'retry' | 'skip_run' | 'skip_prompt' | 'skip_model',
        reportText?: string
    ): Promise<void> {
        const state = await this.db.getItem<BenchmarkState>('benchmark_state');
        if (!state) return;

        if (action === 'retry') {
            this.stop();
            state.currentRunRetries = (state.currentRunRetries || 0) + 1;
            state.isInterrupted = false;
            await this.saveState(state);
            await this.runLoop(state);
            return;
        }

        const modelName = this.models[state.currentModelIdx].name;
        const prompt = this.prompts[state.currentPromptIdx];
        let errorReason = '';

        if (action === 'skip_run') errorReason = 'Skipped run after page crash';
        else if (action === 'skip_prompt') errorReason = 'Skipped entire prompt after page crash';
        else if (action === 'skip_model') errorReason = 'Skipped entire model after page crash';

        this.recordResult(state, modelName, prompt, state.currentRunIdx, {
            success: false,
            skipped: true,
            skipAction: action,
            error: errorReason,
            crashReport: reportText,
            retries: state.currentRunRetries || 0
        });

        if (action === 'skip_run') state.currentRunIdx++;
        else if (action === 'skip_prompt') state.currentRunIdx = this.runsPerPrompt + 1;
        else if (action === 'skip_model') {
            state.currentRunIdx = this.runsPerPrompt + 1;
            state.currentPromptIdx = this.prompts.length;
        }

        if (state.currentRunIdx > this.runsPerPrompt) {
            state.currentRunIdx = 1;
            state.currentPromptIdx++;
        }
        if (state.currentPromptIdx >= this.prompts.length) {
            state.currentPromptIdx = 0;
            state.currentModelIdx++;
        }
        if (state.currentModelIdx >= this.models.length) {
            state.isComplete = true;
        }

        state.currentRunRetries = 0;
        state.isInterrupted = false;

        this.stop();
        await this.saveState(state);

        if (!state.isComplete) {
            await this.runLoop(state);
        }
    }

    public stop(): void {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }

    private createNewState(hardware: HardwareInfo): BenchmarkState {
        return {
            isComplete: false,
            isInterrupted: false,
            currentModelIdx: 0,
            currentPromptIdx: 0,
            currentRunIdx: 1,
            currentRunRetries: 0,
            results: {},
            hardware: hardware
        };
    }

    private async saveState(state: BenchmarkState): Promise<void> {
        await this.db.setItem('benchmark_state', state);
        this.onProgressUpdate(state);
    }

    private async runLoop(state: BenchmarkState): Promise<void> {
        for (let m = state.currentModelIdx; m < this.models.length; m++) {
            const model = this.models[m];

            await this.loadModelInWorker(model.name);

            for (let p = state.currentPromptIdx; p < this.prompts.length; p++) {
                const prompt = this.prompts[p];

                for (let r = state.currentRunIdx; r <= this.runsPerPrompt; r++) {
                    state.currentModelIdx = m;
                    state.currentPromptIdx = p;
                    state.currentRunIdx = r;
                    await this.saveState(state);

                    this.onLiveTextUpdate('');

                    try {
                        const result = await this.executeRun(prompt);
                        this.recordResult(state, model.name, prompt, r, {
                            success: true,
                            output: result.output,
                            metrics: result.metrics,
                            retries: state.currentRunRetries
                        });
                    } catch (error: unknown) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        this.recordResult(state, model.name, prompt, r, {
                            success: false,
                            error: errorMessage,
                            retries: state.currentRunRetries
                        });
                    }

                    state.currentRunRetries = 0;
                    await this.saveState(state);
                }
                state.currentRunIdx = 1;
            }
            state.currentPromptIdx = 0;
        }

        state.isComplete = true;
        this.stop();
        await this.saveState(state);
    }

    private executeRun(prompt: string): Promise<{ output: string; metrics: RunMetrics }> {
        return new Promise((resolve, reject) => {
            if (!this.worker) return reject(new Error("Worker not initialized"));
            let currentText = "";
            let lastTokenTime = Date.now();

            const tokenTimeout = setInterval(() => {
                if (Date.now() - lastTokenTime > 60000) {
                    clearInterval(tokenTimeout);
                    reject(new Error("Generation stalled - no tokens received for 60 seconds."));
                }
            }, 10000);

            this.worker.onmessage = (e: MessageEvent<WorkerOutgoingMessage>) => {
                const data = e.data;
                if (data.status === 'stream') {
                    lastTokenTime = Date.now();
                    currentText += data.token;
                    this.onLiveTextUpdate(currentText);
                }
                if (data.status === 'complete') {
                    clearInterval(tokenTimeout);
                    resolve({ output: data.output, metrics: data.metrics });
                }
                if (data.status === 'error') {
                    clearInterval(tokenTimeout);
                    reject(new Error(data.error));
                }
            };

            this.worker.postMessage({ type: 'generate', text: prompt });
        });
    }

    private async loadModelInWorker(modelName: string): Promise<void> {
        if (!this.worker) {
            this.worker = new Worker();
        }

        return new Promise((resolve, reject) => {
            if (!this.worker) return reject(new Error("Failed to create worker"));

            const timeout = setTimeout(() => {
                reject(new Error("Worker initialization timeout - WebGPU may be unavailable or download is too slow"));
            }, 120000);

            this.worker.onmessage = (e: MessageEvent<WorkerOutgoingMessage>) => {
                if (e.data.status === 'model_ready') {
                    clearTimeout(timeout);
                    resolve();
                }
                if (e.data.status === 'error') {
                    clearTimeout(timeout);
                    reject(new Error(e.data.error));
                }
                if (e.data.status === 'progress') {
                    this.onDownloadProgress(e.data.data);
                }
            };

            this.worker.onerror = (error: ErrorEvent) => {
                clearTimeout(timeout);
                reject(new Error(`Worker error: ${error.message}`));
            };

            this.worker.postMessage({
                type: 'init',
                modelName: modelName
            });
        });
    }

    private recordResult(state: BenchmarkState, modelName: string, prompt: string, runId: number, payload: Partial<RunResult>) {
        if (!state.results[modelName]) state.results[modelName] = {};
        if (!state.results[modelName][prompt]) state.results[modelName][prompt] = [];
        state.results[modelName][prompt].push({ runId, timestamp: new Date().toISOString(), ...payload } as RunResult);
    }
}