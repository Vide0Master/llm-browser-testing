import { MLCEngine } from "@mlc-ai/web-llm";
import type { WorkerIncomingMessage, WorkerOutgoingMessage } from './types';

const ctx = self as unknown as Worker;
let engine: MLCEngine | null = null;
let currentModel: string | null = null;

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

ctx.onmessage = async (event: MessageEvent<WorkerIncomingMessage>) => {
    const data = event.data;

    if (data.type === 'init') {
        try {
            ctx.postMessage({ status: 'loading_model' } as WorkerOutgoingMessage);

            if (!navigator.gpu) {
                throw new Error("WebGPU is not supported or disabled. Please enable it in your browser settings (chrome://flags).");
            }

            if (!engine) {
                engine = new MLCEngine();
                engine.setInitProgressCallback((report) => {
                    ctx.postMessage({
                        status: 'progress',
                        data: {
                            status: 'progress',
                            text: report.text,
                            progress: report.progress
                        }
                    });
                });
            }

            if (currentModel !== data.modelName) {
                const reloadConfig = isMobile ? {
                    context_window_size: 1024, // Оптимизировано для телефонов
                    kvCacheQuantization: "q4f16_1",
                    initBin: 1
                } : {
                    context_window_size: 4096,
                };

                // @ts-ignore
                await engine.reload(data.modelName, reloadConfig);
                currentModel = data.modelName;
            }

            ctx.postMessage({ status: 'model_ready' } as WorkerOutgoingMessage);
        } catch (error: any) {
            console.error("WebLLM init error:", error);
            ctx.postMessage({ status: 'error', error: error?.message || String(error) } as WorkerOutgoingMessage);
        }
        return;
    }

    if (data.type === 'generate') {
        if (!engine || !currentModel) {
            ctx.postMessage({ status: 'error', error: 'Model is not initialized.' } as WorkerOutgoingMessage);
            return;
        }

        try {
            let fullOutput = "";
            let tokensGenerated = 0;
            const startTime = performance.now();
            let ttftMs = 0;

            // WEB-LLM АВТОМАТИЧЕСКИ ПРИМЕНИТ ШАБЛОН (Qwen/Llama) К ЭТОМУ МАССИВУ
            const messages = [
                { role: "user", content: data.text }
            ];

            const stream = await engine.chat.completions.create({
                messages: messages as any, // Приводим тип, если компилятор ругается
                stream: true,
                temperature: 0.1,
                max_tokens: isMobile ? Math.min(data.maxTokens || 256, 256) : (data.maxTokens || 512)
            });

            for await (const chunk of stream) {
                if (tokensGenerated === 0) {
                    ttftMs = performance.now() - startTime;
                }

                const token = chunk.choices[0]?.delta?.content || "";
                if (token) {
                    fullOutput += token;
                    tokensGenerated++;
                    ctx.postMessage({ status: 'stream', token } as WorkerOutgoingMessage);
                }
            }

            const totalDurationMs = performance.now() - startTime;
            const metrics = {
                ttftMs,
                totalDurationMs,
                tokensGenerated,
                tokensPerSecond: (tokensGenerated / totalDurationMs) * 1000
            };

            ctx.postMessage({ status: 'complete', output: fullOutput, metrics } as WorkerOutgoingMessage);
        } catch (error: any) {
            ctx.postMessage({ status: 'error', error: error?.message || String(error) } as WorkerOutgoingMessage);
        }
    }
};