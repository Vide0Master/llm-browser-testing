import React, { useState, useEffect, useRef } from 'react';
import localforage from 'localforage';
import { BenchmarkRunner } from './lib/BenchmarkRunner';
import type { BenchmarkState, BenchmarkConfig, HardwareInfo, DownloadProgressData, Model } from './lib/types';
import {
    Cpu, Box, FileText, CheckCircle, XCircle, SkipForward,
    AlertTriangle, RefreshCw, MessageSquare, Loader2, Play, Trophy,
    DownloadCloud, Trash2, Square, UploadCloud, Check
} from 'lucide-react';
import { t } from './lib/lang';

const defaultConfig: BenchmarkConfig = {
    models: [
        { name: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC" },
        { name: "Llama-3.2-1B-Instruct-q4f16_1-MLC" },
        { name: "Llama-3.2-3B-Instruct-q4f16_1-MLC" }
    ] as Model[],
    prompts: [
        "Tell me a story.",
        "Explain quantum computing.",
        "Write a quicksort in Python."
    ],
    runs: 3
};

const getHardwareInfo = (): HardwareInfo => {
    let gpuName = 'Unknown';
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
            const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) gpuName = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        }
    } catch { /* empty */ }

    return {
        os: navigator.platform,
        cpuThreads: navigator.hardwareConcurrency || 'Unknown',
        ramGB: ((navigator as Navigator & { deviceMemory?: number }).deviceMemory) || 'Unknown (Restricted)',
        gpu: gpuName,
        vram: 'API Restricted'
    };
};

export const Benchmark: React.FC = () => {
    const [state, setState] = useState<BenchmarkState | null>(null);
    const [liveText, setLiveText] = useState<string>('');
    const [isRunning, setIsRunning] = useState<boolean>(false);
    const [hardware, setHardware] = useState<HardwareInfo>(getHardwareInfo());
    const [isReporting, setIsReporting] = useState<boolean>(false);
    const [reportText, setReportText] = useState<string>('');
    const [downloadProgress, setDownloadProgress] = useState<DownloadProgressData | null>(null);
    const [isModelLoading, setIsModelLoading] = useState<boolean>(false);
    const [isUploading, setIsUploading] = useState<boolean>(false);
    const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');

    const runnerRef = useRef<BenchmarkRunner | null>(null);
    const activeRunElementRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLiveText('');
    }, [state?.currentModelIdx, state?.currentPromptIdx, state?.currentRunIdx]);

    useEffect(() => {
        const checkState = async () => {
            const db = localforage.createInstance({ name: 'llm_benchmark', storeName: 'results' });
            const savedState = await db.getItem<BenchmarkState>('benchmark_state');

            if (savedState && !savedState.isComplete) {
                savedState.isInterrupted = true;
                await db.setItem('benchmark_state', savedState);
                setState(savedState);
                if (savedState.hardware) setHardware(savedState.hardware);
            }
        };
        checkState();
    }, []);

    useEffect(() => {
        if (activeRunElementRef.current && (isRunning || state?.isInterrupted)) {
            activeRunElementRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [state?.currentModelIdx, state?.currentPromptIdx, state?.currentRunIdx, isRunning, state?.isInterrupted]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden && isRunning) {
                // Вкладка скрыта - нужно остановить бенчмарк
                if (runnerRef.current) {
                    runnerRef.current.stop();
                }
                setIsRunning(false);
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [isRunning]);

    const handleDownloadProgress = (data: DownloadProgressData) => {
        setIsModelLoading(true);
        if (data.status === 'progress') {
            setDownloadProgress(data);
        } else if (data.status === 'ready') {
            setIsModelLoading(false);
        }
    };

    const initRunner = () => {
        if (!runnerRef.current) {
            runnerRef.current = new BenchmarkRunner(
                defaultConfig,
                (newState) => setState({ ...newState }),
                (text) => setLiveText(text),
                handleDownloadProgress
            );
        }
    };

    const handleStart = async () => {
        setIsRunning(true);
        setDownloadProgress(null);
        setIsModelLoading(true);
        initRunner();

        const db = localforage.createInstance({ name: 'llm_benchmark', storeName: 'results' });
        await db.removeItem('benchmark_state');
        setState(null);
        setLiveText('');

        await runnerRef.current?.startOrResume(hardware);
        setIsRunning(false);
        setIsModelLoading(false);
    };

    const handleAction = async (action: 'retry' | 'skip_run' | 'skip_prompt' | 'skip_model') => {
        setIsRunning(true);
        setIsReporting(false);
        initRunner();

        await runnerRef.current?.resolveInterruption(action, reportText.trim() ? reportText : undefined);
        setReportText('');
        setIsRunning(false);
    };

    const handleReset = async () => {
        if (!window.confirm(t("confirmReset"))) {
            return;
        }

        if (runnerRef.current) {
            runnerRef.current.stop();
            runnerRef.current = null;
        }

        const db = localforage.createInstance({ name: 'llm_benchmark', storeName: 'results' });
        await db.removeItem('benchmark_state');

        setState(null);
        setLiveText('');
        setDownloadProgress(null);
        setIsRunning(false);
        setIsModelLoading(false);
    };

    const handleUploadResults = async () => {
        setIsUploading(true);
        setUploadStatus('idle');

        try {
            const db = localforage.createInstance({ name: 'llm_benchmark', storeName: 'results' });
            const finalState = await db.getItem<BenchmarkState>('benchmark_state');

            if (!finalState) {
                throw new Error("No benchmark data found to upload.");
            }

            const response = await fetch('/api/data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(finalState),
            });

            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }

            setUploadStatus('success');

            setTimeout(() => {
                setUploadStatus('idle');
            }, 3000);

        } catch (error) {
            // eslint-disable-next-line no-console
            console.error("Failed to upload results:", error);
            setUploadStatus('error');

            setTimeout(() => {
                setUploadStatus('idle');
            }, 5000);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="w-full flex flex-col gap-6">

            {/* Control Panel & Hardware Info */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-900 border border-gray-800 p-5 rounded-xl">
                <div className="flex items-center gap-3 text-sm text-gray-300">
                    <div className="bg-gray-800 p-2 rounded-lg border border-gray-700 text-green-400">
                        <Cpu size={20} />
                    </div>
                    <div className="flex flex-col">
                        <span className="font-semibold text-gray-100">{t("detectedHardware")}</span>
                        <span className="text-gray-400">
                            GPU: <span className="text-gray-300">{hardware.gpu}</span> &bull; {t("threads")}: <span className="text-gray-300">{hardware.cpuThreads}</span> &bull; RAM: <span className="text-gray-300">{hardware.ramGB}Gb</span>
                        </span>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    {isRunning ? (
                        <button
                            onClick={handleReset}
                            className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-lg shadow-red-900/20 w-full md:w-auto justify-center"
                        >
                            <Square size={18} fill="currentColor" />
                            {t("stopAndReset")}
                        </button>
                    ) : (
                        <>
                            {state && (
                                <button
                                    onClick={handleReset}
                                    className="flex items-center gap-2 bg-gray-800 hover:bg-red-900/50 text-red-400 hover:text-red-300 border border-gray-700 hover:border-red-800/50 px-5 py-2.5 rounded-lg font-medium transition-all w-full md:w-auto justify-center"
                                >
                                    <Trash2 size={18} />
                                    {t("resetData")}
                                </button>
                            )}

                            {!state?.isInterrupted && (
                                <button
                                    onClick={handleStart}
                                    className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-lg shadow-green-900/20 w-full md:w-auto justify-center"
                                >
                                    <Play size={18} fill="currentColor" />
                                    {state ? t("restartBenchmark") : t("startBenchmark")}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Tree Container */}
            <div className="flex flex-col gap-6">
                {state && defaultConfig.models.map((model: Model, mIdx) => {
                    const modelName = model.name;
                    const isModelFinished = state.currentModelIdx > mIdx || state.isComplete;
                    const isModelActive = state.currentModelIdx === mIdx && !state.isComplete;
                    const isModelWaiting = state.currentModelIdx < mIdx;

                    const opacityClass = isModelWaiting ? "opacity-40 grayscale" : isModelFinished ? "opacity-80" : "opacity-100";

                    return (
                        <div key={modelName} className={`flex flex-col gap-4 transition-all duration-500 ${opacityClass}`}>
                            {/* model header */}
                            <div className="flex items-center gap-3 border-b border-gray-800 pb-3">
                                {isModelFinished ? <CheckCircle className="text-green-500" size={24} /> : <Box className="text-green-500" size={24} />}
                                <h2 className="text-2xl font-semibold text-gray-100 truncate">
                                    {modelName}
                                </h2>
                                <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded-full border border-gray-700 ml-auto whitespace-nowrap">
                                    {isModelFinished ? t("completed") : isModelWaiting ? t("waiting") : t("running")}
                                </span>
                            </div>

                            {/* prompt list */}
                            {!isModelWaiting && (
                                <div className="flex flex-col gap-6 pl-2 md:pl-6 border-l-2 border-gray-800/50 ml-3">
                                    {defaultConfig.prompts.map((prompt, pIdx) => {
                                        const isPromptActive = isModelActive && state.currentPromptIdx === pIdx;
                                        const isPromptWaiting = isModelActive && pIdx > state.currentPromptIdx;
                                        const resultsHistory = state.results[modelName]?.[prompt] || [];

                                        if (isPromptWaiting) {
                                            return (
                                                <div key={pIdx} className="flex items-center gap-3 bg-gray-800/20 p-3 rounded-lg border border-gray-700/30 opacity-40 grayscale">
                                                    <FileText className="text-gray-500 shrink-0" size={16} />
                                                    <div className="text-gray-400 font-medium text-sm truncate">"{prompt}"</div>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div key={pIdx} className="flex flex-col gap-3">
                                                <div className={`flex items-start gap-3 p-3 rounded-lg border ${isPromptActive ? 'bg-gray-800/60 border-green-500/30 shadow-md' : 'bg-gray-800/40 border-gray-700/50'}`}>
                                                    <FileText className={`${isPromptActive ? 'text-green-400' : 'text-green-500'} mt-0.5 shrink-0`} size={18} />
                                                    <div className="text-gray-200 font-medium">📝 {t("promptText")}: "{prompt}"</div>
                                                </div>

                                                <div className="flex flex-col gap-2 pl-4">
                                                    {resultsHistory.map((res, i) => {
                                                        const statusColor = res.skipped ? 'border-yellow-500/50 text-yellow-400' : res.success ? 'border-green-500/50 text-green-400' : 'border-red-500/50 text-red-400';
                                                        const StatusIcon = res.skipped ? SkipForward : res.success ? CheckCircle : XCircle;
                                                        let statusText = t("error");
                                                        if (res.success) {
                                                            statusText = t("success");
                                                        } else if (res.skipped) {
                                                            if (res.skipAction === 'skip_prompt') statusText = t("skipReasonPrompt");
                                                            else if (res.skipAction === 'skip_model') statusText = t("skipReasonModel");
                                                            else statusText = t("skipReasonRun");
                                                        }

                                                        return (
                                                            <div key={i} className={`flex flex-col gap-2 p-3 rounded-md border-l-4 bg-gray-900 border-y border-r border-y-gray-800 border-r-gray-800 ${statusColor}`}>
                                                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                                                    <StatusIcon size={16} />
                                                                    <strong className="font-semibold text-gray-200">
                                                                        {statusText} | {t("runLabel")} {res.runId}:
                                                                    </strong>

                                                                    {res.success && res.metrics ? (
                                                                        <span className="text-gray-400">
                                                                            <span className="text-green-400 font-mono">{res.metrics.tokensPerSecond.toFixed(1)} t/s</span> | TTFT: {res.metrics.ttftMs.toFixed(0)}ms | {t("totalTime")}: {(res.metrics.totalDurationMs / 1000).toFixed(1)}s
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-red-400">{res.error}</span>
                                                                    )}

                                                                    {(res.retries ?? 0) > 0 && <span className="text-blue-400 text-xs px-2 py-0.5 bg-blue-900/30 rounded">{t("retries")}: {res.retries}</span>}
                                                                    {res.crashReport && <span className="text-yellow-400/80 italic ml-auto text-xs flex items-center gap-1"><MessageSquare size={12} /> {t("userReport")}: {res.crashReport}</span>}
                                                                </div>

                                                                {res.output && (
                                                                    <details className="group mt-1">
                                                                        <summary className="cursor-pointer text-xs text-gray-500 hover:text-green-400 transition-colors select-none">
                                                                            {t("viewOutput")}
                                                                        </summary>
                                                                        <div className="mt-2 p-3 bg-gray-950 border border-gray-800 rounded text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
                                                                            {typeof res.output === 'string' ? res.output : JSON.stringify(res.output, null, 2)}
                                                                        </div>
                                                                    </details>
                                                                )}
                                                            </div>
                                                        );
                                                    })}

                                                    {isPromptActive && (
                                                        <div ref={activeRunElementRef} className={`mt-2 p-4 rounded-xl border-2 shadow-lg transition-all ${state.isInterrupted ? 'border-yellow-500/50 bg-yellow-900/10 shadow-yellow-900/20' : 'border-green-500/30 bg-green-900/10 shadow-green-900/10'}`}>

                                                            {state.isInterrupted ? (
                                                                <div className="flex flex-col gap-4">
                                                                    <div className="flex items-center gap-2 text-yellow-400 font-semibold">
                                                                        <AlertTriangle size={20} />
                                                                        {t("runLabel")} {state.currentRunIdx} {t("interruptedWarning")}
                                                                    </div>

                                                                    <div className="flex flex-wrap gap-2">
                                                                        <button onClick={() => handleAction('retry')} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded transition-colors text-sm font-medium"><RefreshCw size={16} /> {t("retryRun")}</button>
                                                                        <button onClick={() => handleAction('skip_run')} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-2 rounded transition-colors text-sm font-medium"><SkipForward size={16} /> {t("skipRun")}</button>
                                                                        <button onClick={() => handleAction('skip_prompt')} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-2 rounded transition-colors text-sm font-medium"><SkipForward size={16} /> {t("skipPrompt")}</button>
                                                                        <button onClick={() => handleAction('skip_model')} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-2 rounded transition-colors text-sm font-medium"><SkipForward size={16} /> {t("skipModel")}</button>

                                                                        <button onClick={() => setIsReporting(!isReporting)} className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-500 text-white px-3 py-2 rounded transition-colors text-sm font-medium ml-auto">
                                                                            <MessageSquare size={16} /> {t("reportBug")}
                                                                        </button>
                                                                    </div>

                                                                    {isReporting && (
                                                                        <div className="flex mt-2 animate-in fade-in slide-in-from-top-2">
                                                                            <textarea
                                                                                value={reportText}
                                                                                onChange={(e) => setReportText(e.target.value)}
                                                                                placeholder={t("reportPlaceholder")}
                                                                                className="flex-1 bg-gray-950 border border-gray-700 text-gray-100 px-3 py-2 rounded focus:outline-none focus:border-yellow-500 transition-colors resize-y min-h-[42px]"
                                                                            />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <div className="flex flex-col gap-3">
                                                                    {isModelLoading && downloadProgress ? (
                                                                        <div className="flex flex-col gap-3 p-3 bg-gray-950 border border-gray-800 rounded-lg shadow-inner">
                                                                            <div className="flex justify-between items-end text-sm">
                                                                                <div className="flex flex-col gap-1 w-[80%]">
                                                                                    <span className="flex items-center gap-2 text-green-400 font-semibold">
                                                                                        <DownloadCloud size={18} className="animate-pulse" />
                                                                                        {t("downloadingModelWeights")}
                                                                                    </span>
                                                                                    <span className="text-gray-500 text-xs font-mono truncate w-full" title={downloadProgress.text || t("caching")}>
                                                                                        {downloadProgress.text || t("caching")}
                                                                                    </span>
                                                                                </div>
                                                                                <div className="text-right font-mono text-green-400 ml-4 whitespace-nowrap">
                                                                                    {((downloadProgress.progress || 0) * 100).toFixed(1)}%
                                                                                </div>
                                                                            </div>
                                                                            <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                                                                                <div
                                                                                    className="bg-green-500 h-2 rounded-full transition-all duration-200 ease-out"
                                                                                    style={{ width: `${(downloadProgress.progress || 0) * 100}%` }}
                                                                                ></div>
                                                                            </div>
                                                                        </div>
                                                                    ) : liveText === '' ? (
                                                                        <div className="flex items-center gap-3 text-blue-400 font-medium animate-pulse">
                                                                            <Loader2 size={20} className="animate-spin" />
                                                                            {state.currentPromptIdx === 0 && state.currentRunIdx === 1
                                                                                ? t("loadingWebGPU")
                                                                                : t("waitingResponse")}
                                                                        </div>
                                                                    ) : (
                                                                        <>
                                                                            <div className="flex items-center gap-2 text-green-400 font-semibold">
                                                                                <Loader2 size={18} className="animate-spin" />
                                                                                {t("generatingRun")} {state.currentRunIdx} / {defaultConfig.runs}...
                                                                                {state.currentRunRetries > 0 && <span className="text-red-400 text-xs ml-2 bg-red-900/30 px-2 py-0.5 rounded">({t("retryPrefix")} #{state.currentRunRetries})</span>}
                                                                            </div>
                                                                            <div className="bg-black border border-gray-800 rounded p-4 text-gray-300 font-mono text-sm whitespace-pre-wrap min-h-20 leading-relaxed">
                                                                                {liveText}<span className="inline-block w-2 h-4 bg-green-500 ml-1 animate-pulse align-middle"></span>
                                                                            </div>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}

                {state?.isComplete && (
                    <div className="flex flex-col items-center justify-center gap-5 mt-6 bg-green-900/10 border border-green-500/30 p-8 rounded-xl text-center animate-in fade-in zoom-in-95">
                        <Trophy className="text-green-400 w-12 h-12" />
                        <div className="flex flex-col gap-1">
                            <h3 className="text-xl font-bold text-green-400">{t("testsCompleted")}</h3>
                            <p className="text-gray-400">{t("dataSavedLocally")}</p>
                        </div>
                        <div className="flex flex-col items-center gap-3 mt-2">
                            <button
                                onClick={handleUploadResults}
                                disabled={isUploading || uploadStatus === 'success'}
                                className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all shadow-lg w-full md:w-auto justify-center ${uploadStatus === 'success'
                                    ? 'bg-green-700 text-white cursor-default'
                                    : isUploading
                                        ? 'bg-blue-600/50 text-white/70 cursor-not-allowed'
                                        : 'bg-blue-600 hover:bg-blue-500 text-white hover:-translate-y-0.5 shadow-blue-900/30'
                                    }`}
                            >
                                {isUploading ? (
                                    <><Loader2 size={20} className="animate-spin" /> {t("uploading")}</>
                                ) : uploadStatus === 'success' ? (
                                    <><Check size={20} /> {t("uploadedSuccessfully")}</>
                                ) : (
                                    <><UploadCloud size={20} /> {t("uploadResults")}</>
                                )}
                            </button>

                            {uploadStatus === 'error' && (
                                <span className="text-red-400 text-sm font-medium animate-in fade-in">
                                    {t("uploadFailed")}
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};