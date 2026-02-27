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
  
  const [mode, setMode] = useState<'enToJa' | 'jaToEn'>(() => (localStorage.getItem('conf-mode') as any) || 'enToJa');
  const [range, setRange] = useState(() => JSON.parse(localStorage.getItem('conf-range') || '{"start":1,"end":100}'));
  const [sessionLimit, setSessionLimit] = useState(() => parseInt(localStorage.getItem('conf-limit') || '10'));
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const [solvedCount, setSolvedCount] = useState(0);
  const [correctSession, setCorrectSession] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [usedWordIds, setUsedWordIds] = useState<string[]>([]);

  // 累計習得数
  const totalCorrectAchieved = useMemo(() => {
    return allWords.reduce((sum, w) => sum + (w.correctTotal || 0), 0);
  }, [allWords]);

  // 要特訓数（間違いカウントが1以上の語数）
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
        const savedMap = new Map(savedList.map((w: any) => [w.id, w]));

        const formatted = parsed
          .filter(w => w.English && w.Japanese)
          .map(w => {
            const saved = savedMap.get(w.ID);
            return {
              id: w.ID,
              english: w.English,
              japanese: w.Japanese,
              wrongCount: saved ? saved.wrongCount : 0,
              correctTotal: saved ? saved.correctTotal || 0 : 0
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
      // 通常モードは完全ランダム（確率変動なし）
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
    if (window.confirm("これまでの学習記録をすべて削除しますか？")) {
      localStorage.removeItem('vocab-data');
      window.location.reload();
    }
  };

  const isTrainingPhase = sessionType === 'training' && (currentWord !== null || isFinished);
  const themeBg = isTrainingPhase ? 'bg-violet-950' : 'bg-slate-950';
  const getBgModifier = () => {
    if (feedback === 'correct') return '!bg-green-950';
    if (feedback === 'wrong') return '!bg-red-950';
    return themeBg;
  };

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center p-6 transition-all duration-500 text-white ${getBgModifier()}`} onClick={proceedNext}>
      
      {/* Settings Modal */}
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

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-6" onClick={(e) => { e.stopPropagation(); setShowHelp(false); }}>
          <div className="bg-slate-900 p-8 rounded-3xl max-w-sm w-full space-y-6 border border-white/10 shadow-2xl text-left" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-black border-b border-white/10 pb-2 tracking-tighter uppercase">Information</h2>
            <div className="space-y-4 text-sm font-medium leading-relaxed text-white/70">
              <section>
                <h3 className="text-white font-black text-xs uppercase tracking-widest mb-1">Total Mastery / To Train</h3>
                <p>左側は習得した語数、右側の紫色は現在「一度でも間違えた」ため特訓が必要な語数です。</p>
              </section>
              <section>
                <h3 className="text-white font-black text-xs uppercase tracking-widest mb-1">Normal / Training</h3>
                <p>通常モードは完全ランダム。トレーニングは要特訓語から間違いの多い順に出題します。</p>
              </section>
            </div>
            <button onClick={() => setShowHelp(false)} className="w-full py-4 bg-white text-black rounded-2xl font-black uppercase">Close</button>
          </div>
        </div>
      )}

      {isFinished ? (
        <div className="text-center space-y-8" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-xl font-bold tracking-[0.3em] text-white/30 uppercase">Result</h2>
          <div className="text-[10rem] font-black leading-none tracking-tighter tabular-nums">{Math.round((correctSession / (solvedCount || 1)) * 100)}<span className="text-4xl">%</span></div>
          <p className="text-2xl font-medium text-white/70">{solvedCount}問中 {correctSession}問正解</p>
          <button onClick={() => { setIsFinished(false); setSessionType('normal'); }} className="px-12 py-4 bg-white text-black rounded-full font-black shadow-lg active:scale-95 transition-all uppercase">Back to Lobby</button>
        </div>
      ) : !currentWord ? (
        <div className="text-center space-y-12 relative z-10" onClick={(e) => e.stopPropagation()}>
          <div className="space-y-4">
            <h1 className="text-8xl font-black tracking-tighter leading-none">VOCAB<br/>TRAINER</h1>
            <div className="flex gap-2 justify-center">
              <div className="px-6 py-2 rounded-2xl border border-white/10 bg-white/5">
                <p className="text-[10px] font-black tracking-[0.3em] text-white/40 uppercase mb-1">Total Mastery</p>
                <p className="text-4xl font-black tabular-nums">{totalCorrectAchieved.toLocaleString()}</p>
              </div>
              <div className="px-6 py-2 rounded-2xl border border-violet-500/20 bg-violet-500/10">
                <p className="text-[10px] font-black tracking-[0.3em] text-violet-400/60 uppercase mb-1">To Train</p>
                <p className="text-4xl font-black tabular-nums text-violet-400">{toTrainCount.toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-4 items-center w-full max-w-xs mx-auto">
            <button onClick={() => startSession('normal')} className="w-full py-6 bg-white text-black rounded-full font-black text-2xl shadow-2xl active:scale-95 transition-all uppercase">Start</button>
            <button onClick={() => hasWrongWords && startSession('training')} disabled={!hasWrongWords} className={`w-full py-5 rounded-full font-black text-xl shadow-xl transition-all uppercase border-none ${hasWrongWords ? 'bg-violet-600 text-white active:scale-95 hover:bg-violet-500 cursor-pointer' : 'bg-violet-900/30 text-white/20 cursor-not-allowed opacity-20'}`}>Training Mode</button>
            {!hasWrongWords && <p className="text-[10px] font-bold tracking-widest text-violet-500/50 uppercase">No mistakes to train yet</p>}
            <button onClick={() => setShowSettings(true)} className="mt-4 text-[10px] tracking-[0.3em] opacity-40 uppercase underline cursor-pointer hover:opacity-100 transition-opacity z-20">Settings</button>
          </div>
          <button onClick={() => setShowHelp(true)} className="fixed bottom-8 right-8 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 font-black hover:bg-white/10 hover:text-white transition-all z-30">?</button>
        </div>
      ) : (
        <div className="w-full max-w-xl space-y-12">
          <div className="text-center">
            <div className={`inline-block px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase mb-4 ${sessionType === 'training' ? 'bg-violet-500 text-white' : 'bg-white/10 text-white/50'}`}>
              {sessionType === 'training' ? 'Training Phase' : 'Normal Session'} {solvedCount + 1} / {sessionLimit}
            </div>
            <h2 className="text-7xl font-black break-words tracking-tight leading-tight">{mode === 'enToJa' ? currentWord.english : currentWord.japanese}</h2>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {options.map((option, i) => {
              const isCorrect = option === (mode === 'enToJa' ? currentWord.japanese : currentWord.english);
              let variant = feedback === null ? 'normal' : feedback === 'correct' ? (isCorrect ? 'correct' : 'dim') : (isCorrect ? 'correct' : 'wrong');
              return (
                <button
                  key={i}
                  onClick={(e) => { if (!feedback) { e.stopPropagation(); handleAnswer(option); } }}
                  className={`p-6 text-xl font-bold rounded-2xl border-2 transition-all text-center active:scale-[0.98]
                    ${variant === 'normal' ? (sessionType === 'training' ? 'bg-violet-900/40 border-violet-800 hover:border-violet-400' : 'bg-slate-900 border-slate-800 hover:border-white') : ''}
                    ${variant === 'correct' ? 'bg-green-500 border-green-500 shadow-[0_0_40px_rgba(34,197,94,0.4)] z-10 scale-105' : ''}
                    ${variant === 'wrong' ? 'bg-red-500 border-red-500 opacity-20' : ''}
                    ${variant === 'dim' ? 'opacity-10 border-transparent' : ''}
                  `}
                >
                  {option}
                </button>
              );
            })}
          </div>
          <div className="h-16 flex items-center justify-center">
            {feedback && <p className="text-xs font-black tracking-[0.4em] text-white/50 uppercase animate-pulse">Tap anywhere to continue</p>}
          </div>
        </div>
      )}
    </div>
  );
}