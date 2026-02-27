import { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';

type Word = {
  id: string;
  english: string;
  japanese: string;
  wrongCount: number;
  correctTotal: number;
};

export default function App() {
  const [allWords, setAllWords] = useState<Word[]>([]);
  const [currentWord, setCurrentWord] = useState<Word | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [sessionType, setSessionType] = useState<'normal' | 'training'>('normal');
  const [showOptions, setShowOptions] = useState(false);
  
  const [mode, setMode] = useState<'enToJa' | 'jaToEn'>(() => (localStorage.getItem('conf-mode') as any) || 'enToJa');
  const [range, setRange] = useState(() => JSON.parse(localStorage.getItem('conf-range') || '{"start":1,"end":100}'));
  const [sessionLimit, setSessionLimit] = useState(() => parseInt(localStorage.getItem('conf-limit') || '10'));
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const [solvedCount, setSolvedCount] = useState(0);
  const [correctSession, setCorrectSession] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [usedWordIds, setUsedWordIds] = useState<string[]>([]);

  const totalCorrectAchieved = useMemo(() => {
    return allWords.reduce((sum, w) => sum + (w.correctTotal || 0), 0);
  }, [allWords]);

  const toTrainCount = useMemo(() => {
    return allWords.reduce((sum, w) => sum + (w.wrongCount > 0 ? 1 : 0), 0);
  }, [allWords]);

  const hasWrongWords = toTrainCount > 0;

  useEffect(() => {
    localStorage.setItem('conf-mode', mode);
    localStorage.setItem('conf-range', JSON.stringify(range));
    localStorage.setItem('conf-limit', sessionLimit.toString());
  }, [mode, range, sessionLimit]);

  useEffect(() => {
    fetch('/systan_perfect_list.csv')
      .then(res => res.text())
      .then(csvData => {
        const parsed = Papa.parse(csvData, { header: true }).data as any[];
        const savedData = localStorage.getItem('vocab-data');
        const savedList = savedData ? JSON.parse(savedData) : [];
        const savedMap = new Map<string, { wrongCount: number, correctTotal: number }>(
          savedList.map((w: any) => [w.id, { wrongCount: w.wrongCount, correctTotal: w.correctTotal }])
        );

        const formatted: Word[] = parsed
          .filter((w) => w && w.English && w.Japanese)
          .map((w) => {
            const saved = savedMap.get(w.ID);
            return {
              id: w.ID,
              english: w.English,
              japanese: w.Japanese,
              wrongCount: saved ? saved.wrongCount : 0,
              correctTotal: saved ? saved.correctTotal : 0
            };
          });
        setAllWords(formatted);
      });
  }, []);

  const filteredWords = useMemo(() => {
    return allWords.filter(w => {
      const idNum = parseInt(w.id);
      return idNum >= range.start && idNum <= range.end;
    });
  }, [allWords, range]);

  const pickNextWord = (excludeIds: string[], type: 'normal' | 'training') => {
    const availableWords = filteredWords.filter(w => !excludeIds.includes(w.id));
    if (availableWords.length === 0) return null;

    if (type === 'training') {
      const sorted = [...availableWords].sort((a, b) => b.wrongCount - a.wrongCount);
      return sorted[0];
    } else {
      return availableWords[Math.floor(Math.random() * availableWords.length)];
    }
  };

  const startSession = (type: 'normal' | 'training') => {
    setSessionType(type);
    setSolvedCount(0);
    setCorrectSession(0);
    setIsFinished(false);
    setUsedWordIds([]);
    const firstWord = pickNextWord([], type);
    if (firstWord) setupQuestion(firstWord);
  };

  const setupQuestion = (word: Word) => {
    setCurrentWord(word);
    setUsedWordIds(prev => [...prev, word.id]);
    setShowOptions(false);
    const correctAnswer = mode === 'enToJa' ? word.japanese : word.english;
    const wrongAnswers = allWords
      .filter(w => (mode === 'enToJa' ? w.japanese : w.english) !== correctAnswer)
      .map(w => (mode === 'enToJa' ? w.japanese : w.english));
    const shuffledWrong = wrongAnswers.sort(() => 0.5 - Math.random()).slice(0, 3);
    setOptions([...shuffledWrong, correctAnswer].sort(() => 0.5 - Math.random()));
    setFeedback(null);
  };

  const handleAnswer = (answer: string) => {
    if (!currentWord || feedback || isFinished) return;
    const correctAnswer = mode === 'enToJa' ? currentWord.japanese : currentWord.english;
    const isCorrect = answer === correctAnswer;
    setFeedback(isCorrect ? 'correct' : 'wrong');
    if (isCorrect) setCorrectSession(prev => prev + 1);
    
    const updatedWords = allWords.map(w => {
      if (w.id === currentWord.id) {
        return { 
          ...w, 
          wrongCount: isCorrect ? Math.max(0, w.wrongCount - 1) : w.wrongCount + 1, 
          correctTotal: isCorrect ? 1 : 0 
        };
      }
      return w;
    });
    setAllWords(updatedWords);
    localStorage.setItem('vocab-data', JSON.stringify(updatedWords));
  };

  const proceedNext = () => {
    if (feedback === null || isFinished || !currentWord) return;
    const nextCount = solvedCount + 1;
    setSolvedCount(nextCount);
    if (nextCount >= sessionLimit) {
      setIsFinished(true);
      setCurrentWord(null);
      setFeedback(null);
    } else {
      const nextWord = pickNextWord([...usedWordIds], sessionType);
      if (nextWord) setupQuestion(nextWord);
      else { setIsFinished(true); setCurrentWord(null); setFeedback(null); }
    }
  };

  const handleReset = () => {
    if (window.confirm("学習記録をすべてリセットしますか？")) {
      localStorage.removeItem('vocab-data');
      window.location.reload();
    }
  };

  const themeBg = (sessionType === 'training' && (currentWord || isFinished)) ? 'bg-violet-950' : 'bg-slate-950';
  const getBgModifier = () => {
    if (feedback === 'correct') return '!bg-green-950';
    if (feedback === 'wrong') return '!bg-red-950';
    return themeBg;
  };

  return (
    <div 
      className={`h-[100dvh] w-full flex flex-col items-center justify-center p-6 transition-all duration-500 text-white overflow-hidden fixed inset-0 ${getBgModifier()}`} 
      onClick={proceedNext}
    >
      {showSettings && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-4" onClick={(e) => e.stopPropagation()}>
          <div className="bg-slate-900 p-8 rounded-3xl max-w-sm w-full space-y-4 border border-white/10 shadow-2xl">
            <h2 className="text-2xl font-black text-center border-b border-white/10 pb-2 tracking-tighter uppercase">Settings</h2>
            <div className="space-y-4 text-left">
              <label className="block text-xs font-black opacity-60 uppercase tracking-widest">Mode
                <select className="w-full p-3 bg-black/20 rounded-xl mt-1 text-white border-none outline-none" value={mode} onChange={(e) => setMode(e.target.value as any)}>
                  <option value="enToJa">ENG to JPN</option>
                  <option value="jaToEn">JPN to ENG</option>
                </select>
              </label>
              <label className="block text-xs font-black opacity-60 uppercase tracking-widest">Limit
                <input type="number" className="w-full p-3 bg-black/20 rounded-xl mt-1 border-none outline-none" value={sessionLimit} onChange={(e) => setSessionLimit(parseInt(e.target.value) || 1)} />
              </label>
              <div className="flex gap-3 text-xs font-black opacity-60 uppercase tracking-widest">
                <label className="flex-1">Start<input type="number" className="w-full p-3 bg-black/20 rounded-xl mt-1 border-none outline-none" value={range.start} onChange={(e) => setRange({...range, start: parseInt(e.target.value) || 1})} /></label>
                <label className="flex-1">End<input type="number" className="w-full p-3 bg-black/20 rounded-xl mt-1 border-none outline-none" value={range.end} onChange={(e) => setRange({...range, end: parseInt(e.target.value) || 1})} /></label>
              </div>
            </div>
            <div className="pt-4 space-y-3">
              <button onClick={() => setShowSettings(false)} className="w-full py-4 bg-white text-black rounded-2xl font-black active:scale-95 transition-transform uppercase">Save</button>
              <button onClick={handleReset} className="w-full py-2 text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] hover:text-red-400 transition-colors">Reset Progress</button>
            </div>
          </div>
        </div>
      )}

      {showHelp && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-6" onClick={(e) => { e.stopPropagation(); setShowHelp(false); }}>
          <div className="bg-slate-900 p-8 rounded-3xl max-w-sm w-full space-y-6 border border-white/10 shadow-2xl text-left" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-black border-b border-white/10 pb-2 tracking-tighter uppercase">Information</h2>
            <div className="space-y-4 text-sm font-medium leading-relaxed text-white/70">
              <section>
                <h3 className="text-white font-black text-xs uppercase tracking-widest mb-1">Mastery / To Train</h3>
                <p>左は習得数、右の紫は「一度でも間違えた」語数です。正解を重ねて0になれば特訓リストから清算されます。</p>
              </section>
              <section>
                <h3 className="text-white font-black text-xs uppercase tracking-widest mb-1">Modes</h3>
                <p>通常は完全ランダム。トレーニングは要特訓リストから間違いの多い順に出題します。</p>
              </section>
            </div>
            <button onClick={() => setShowHelp(false)} className="w-full py-4 bg-white text-black rounded-2xl font-black uppercase">Close</button>
          </div>
        </div>
      )}

      {isFinished ? (
        <div className="text-center space-y-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-sm font-bold tracking-[0.3em] text-white/30 uppercase">Result</h2>
          <div className="text-[7rem] sm:text-[10rem] font-black leading-none tracking-tighter tabular-nums">
            {Math.round((correctSession / (solvedCount || 1)) * 100)}<span className="text-xl sm:text-2xl">%</span>
          </div>
          <p className="text-lg sm:text-xl font-medium text-white/70">{solvedCount}問中 {correctSession}問正解</p>
          <button onClick={() => { setIsFinished(false); setSessionType('normal'); }} className="w-full py-4 bg-white text-black rounded-full font-black shadow-lg active:scale-90 transition-all uppercase">Back to Lobby</button>
        </div>
      ) : !currentWord ? (
        <div className="text-center space-y-10 relative z-10 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
          <div className="space-y-6">
            <h1 className="text-6xl sm:text-8xl font-black tracking-tighter leading-none uppercase">Vocab<br/>Trainer</h1>
            <div className="flex gap-3 justify-center">
              <div className="flex-1 px-4 py-4 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm">
                <p className="text-[10px] font-black tracking-[0.2em] text-white/40 uppercase mb-1">Mastery</p>
                <p className="text-4xl font-black tabular-nums">{totalCorrectAchieved.toLocaleString()}</p>
              </div>
              <div className="flex-1 px-4 py-4 rounded-3xl border border-violet-500/20 bg-violet-500/10 backdrop-blur-sm">
                <p className="text-[10px] font-black tracking-[0.2em] text-violet-400/60 uppercase mb-1">To Train</p>
                <p className="text-4xl font-black tabular-nums text-violet-400">{toTrainCount.toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-4 items-center w-full px-6">
            <button onClick={() => startSession('normal')} className="w-full py-6 bg-white text-black rounded-full font-black text-2xl shadow-2xl active:scale-95 transition-all uppercase">Start</button>
            <button onClick={() => hasWrongWords && startSession('training')} disabled={!hasWrongWords} className={`w-full py-5 rounded-full font-black text-xl shadow-xl transition-all uppercase border-none ${hasWrongWords ? 'bg-violet-600 text-white active:scale-95' : 'bg-violet-900/20 text-white/10 opacity-30 cursor-not-allowed'}`}>Training Mode</button>
            <button onClick={() => setShowSettings(true)} className="mt-4 text-[10px] tracking-[0.3em] opacity-40 uppercase underline p-2 z-20 cursor-pointer">Settings</button>
          </div>
          <button onClick={() => setShowHelp(true)} className="fixed bottom-8 right-8 w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 text-xl font-black z-30 active:scale-75 shadow-2xl">?</button>
        </div>
      ) : (
        <div className="w-full max-w-md flex flex-col items-center justify-between h-full py-12">
          <div className="text-center px-4 w-full">
            <div className={`inline-block px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase mb-8 ${sessionType === 'training' ? 'bg-violet-500 text-white' : 'bg-white/10 text-white/50'}`}>
              {sessionType === 'training' ? 'Training' : 'Normal'} {solvedCount + 1} / {sessionLimit}
            </div>
            <h2 className="text-6xl sm:text-7xl font-black break-words tracking-tight leading-tight min-h-[160px] flex items-center justify-center">
              {mode === 'enToJa' ? currentWord.english : currentWord.japanese}
            </h2>
          </div>

          <div className="w-full px-6 min-h-[320px] flex flex-col justify-center">
            {!showOptions ? (
              <div 
                onClick={(e) => { e.stopPropagation(); setShowOptions(true); }}
                className="w-full py-16 border-2 border-dashed border-white/20 rounded-3xl flex flex-col items-center justify-center space-y-4 cursor-pointer hover:border-white/40 transition-colors"
              >
                <div className="w-10 h-1 border-t-2 border-white/20"></div>
                <p className="text-[10px] font-black tracking-[0.4em] text-white/40 uppercase">Tap to reveal options</p>
                <div className="w-10 h-1 border-b-2 border-white/20"></div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 w-full">
                {options.map((option, i) => {
                  const isCorrect = option === (mode === 'enToJa' ? currentWord.japanese : currentWord.english);
                  let variant = feedback === null ? 'normal' : feedback === 'correct' ? (isCorrect ? 'correct' : 'dim') : (isCorrect ? 'correct' : 'wrong');
                  return (
                    <button
                      key={i}
                      onClick={(e) => { if (!feedback) { e.stopPropagation(); handleAnswer(option); } }}
                      className={`w-full p-6 text-xl font-bold rounded-2xl border-2 transition-all text-center active:scale-[0.97]
                        ${variant === 'normal' ? (sessionType === 'training' ? 'bg-violet-900/40 border-violet-800' : 'bg-slate-900 border-slate-800') : ''}
                        ${variant === 'correct' ? 'bg-green-500 border-green-500 shadow-xl z-10 scale-[1.03]' : ''}
                        ${variant === 'wrong' ? 'bg-red-500 border-red-500 opacity-20' : ''}
                        ${variant === 'dim' ? 'opacity-10 border-transparent' : ''}
                      `}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          
          <div className="h-12 flex items-end justify-center">
            {feedback && <p className="text-[10px] font-black tracking-[0.4em] text-white/30 uppercase animate-pulse">Tap anywhere to continue</p>}
          </div>
        </div>
      )}
    </div>
  );
}