import { useState } from "react";
import { getLanguage, setLanguage, t, type Language } from "./lib/lang";
import { Benchmark } from "./Benchmark";

function App() {
    const [lang, setLang] = useState<Language>(getLanguage());

    const handleLangChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newLang = e.target.value as Language;
        setLanguage(newLang);
        setLang(newLang);
    };

    return (
        <div className="w-full min-h-screen bg-gray-950 text-gray-200 flex flex-col items-center py-10 px-4 font-sans selection:bg-green-500/30">
            <div className="max-w-5xl w-full flex flex-col gap-8">
                {/* Header Section */}
                <header className="flex flex-col md:flex-row justify-between items-center pb-6 border-b border-gray-800 gap-6">
                    <div className="flex flex-col gap-2 text-center md:text-left">
                        <h1 className="text-4xl font-bold text-green-400 tracking-tight">
                            {t("title")}
                        </h1>
                        <p className="text-gray-400 text-lg">
                            {t("description")}
                        </p>
                    </div>

                    {/* Language Selector */}
                    <div className="flex items-center gap-3 bg-gray-900/50 p-2 rounded-lg border border-gray-800 shadow-sm">
                        <span className="text-sm font-medium text-gray-400 px-2">{t("lang")}</span>
                        <select
                            className="bg-gray-800 text-gray-100 py-1.5 px-3 rounded cursor-pointer outline-none focus:ring-2 focus:ring-green-500/50 border border-gray-700 transition-all hover:border-gray-600"
                            value={lang}
                            onChange={handleLangChange}
                        >
                            <option value="en">{t("english")}</option>
                            <option value="uk">{t("ukrainian")}</option>
                        </select>
                    </div>
                </header>

                {/* Main Benchmark Component */}
                <main>
                    <Benchmark />
                </main>
            </div>
        </div>
    );
}

export default App;