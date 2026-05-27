export const translations = {
    en: {
        lang: "Language",
        english: "English",
        ukrainian: "Ukrainian",
        title: "LLM Test",
        description: "This website will download and run some AI models to test your hardware, if website crashes for some reason, you can retry to start a model, or skip it's processing entierly. Be kind to leave some report for crashes. RECOMMENDATION: don't start this test on mobile data/internet on, starting this will use around 1GB of data to download AI models!",
        detectedHardware: "Detected hardware",
        threads: "Threads",
        stopAndReset: "Stop & reset",
        resetData: "Reset data",
        restartBenchmark: "Restart benchmark",
        startBenchmark: "Start benchmark",
        runs: "runs",
        downloadingModelWeights: "Downloading model weights",
        caching: "Caching in browser storage...",
        promptText: "Prompt",
        runLabel: "Run",
        skipped: "Skipped",
        success: "Success",
        error: "Error",
        totalTime: "Total",
        retries: "Retries",
        userReport: "User Report",
        viewOutput: "View Output",
        interruptedWarning: "was interrupted (Page reload/Crash).",
        retryRun: "Retry Run",
        skipRun: "Skip Run",
        skipPrompt: "Skip Prompt",
        skipModel: "Skip Model",
        reportBug: "Report Bug",
        reportPlaceholder: "Describe the issue, then choose a Skip action above...",
        saveAndContinue: "Save & Continue",
        generatingRun: "Generating Run",
        retryPrefix: "Retry",
        testsCompleted: "All tests completed successfully!",
        dataSavedLocally: "Data has been saved locally. You can now upload it to the central database.",
        uploading: "Uploading...",
        uploadedSuccessfully: "Uploaded Successfully",
        uploadResults: "Upload Results to Database",
        uploadFailed: "Failed to upload. Is the server running?",
        confirmReset: "Are you sure you want to delete all current benchmark progress and start from scratch?",
        waiting: "Waiting...",
        running: "Running...",
        completed: "Completed",
        loadingWebGPU: "Loading model into WebGPU (may take a moment)...",
        waitingResponse: "Waiting for model response...",
        skipReasonRun: "Skipped (Run)",
        skipReasonPrompt: "Skipped (Prompt)",
        skipReasonModel: "Skipped (Model)",
    },
    uk: {
        lang: "Мова",
        english: "Англійська",
        ukrainian: "Українська",
        title: "LLM Тест",
        description: "Цей вебсайт завантажить та запустить деякі моделі штучного інтелекту для тестування вашого обладнання. Якщо з якоїсь причини вебсайт дасть збій, ви можете повторно спробувати запустити модель або повністю пропустити її обробку. Будь ласка, залиште звіт про збої. РЕКОМЕНДАЦІЯ: не починайте цей тест з увімкненими мобільними даними/інтернетом, оскільки для завантаження моделей ШІ буде використано близько 1 ГБ даних!",
        detectedHardware: "Виявлене обладнання",
        threads: "Потоки",
        stopAndReset: "Зупинити та скинути",
        resetData: "Очистити дані",
        restartBenchmark: "Перезапустити бенчмарк",
        startBenchmark: "Почати бенчмарк",
        runs: "прогонів",
        downloadingModelWeights: "Завантаження ваг моделі",
        caching: "Кешування у пам'яті браузера...",
        promptText: "Промпт",
        runLabel: "Прогін",
        skipped: "Пропущено",
        success: "Успіх",
        error: "Помилка",
        totalTime: "Час",
        retries: "Спроби",
        userReport: "Звіт",
        viewOutput: "Показати вивід",
        interruptedWarning: "був перерваний (Перезавантаження/Збій).",
        retryRun: "Повторити",
        skipRun: "Пропустити прогін",
        skipPrompt: "Пропустити промпт",
        skipModel: "Пропустити модель",
        reportBug: "Повідомити про помилку",
        reportPlaceholder: "Опишіть проблему та оберіть дію 'Пропустити' вище...",
        saveAndContinue: "Зберегти та продовжити",
        generatingRun: "Генерація прогону",
        retryPrefix: "Спроба",
        testsCompleted: "Всі тести успішно завершено!",
        dataSavedLocally: "Дані збережено локально. Тепер ви можете завантажити їх до центральної бази даних.",
        uploading: "Завантаження...",
        uploadedSuccessfully: "Успішно завантажено",
        uploadResults: "Відправити результати до БД",
        uploadFailed: "Помилка завантаження. Сервер працює?",
        confirmReset: "Ви впевнені, що хочете видалити весь поточний прогрес і почати з нуля?",
        waiting: "В очікуванні...",
        running: "Виконується...",
        completed: "Завершено",
        loadingWebGPU: "Завантаження моделі в WebGPU (це може зайняти час)...",
        waitingResponse: "Очікування відповіді від моделі...",
        skipReasonRun: "Пропущено (Прогін)",
        skipReasonPrompt: "Пропущено (Промпт)",
        skipReasonModel: "Пропущено (Модель)",
    }
} as const;

export type Language = keyof typeof translations;
export type TranslationKey = keyof (typeof translations)["en"];

const STORAGE_KEY = 'app_lang';

export const getLanguage = (): Language => {
    const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
    if (saved && translations[saved]) return saved;

    const browserLang = navigator.language.split('-')[0] as Language;
    return translations[browserLang] ? browserLang : 'en';
};

export const t = (key: TranslationKey): string => {
    const lang = getLanguage();
    return translations[lang][key] || translations['en'][key] || key;
};

export const setLanguage = (lang: Language): void => {
    localStorage.setItem(STORAGE_KEY, lang);
    window.location.reload();
};