
import React, { useState, useCallback, useEffect } from 'react';
import { Header } from './components/Header';
import { GeneratorControls } from './components/GeneratorControls';
import { ImageDisplay } from './components/ImageDisplay';
import { Footer } from './components/Footer';
import { HistoryPanel } from './components/HistoryPanel';
import { CameraModal } from './components/CameraModal';
import { GenerationMode, VideoGenerationConfig, VideoStyle, ImageStyle, HistoryItem, ImageQuality, Complexity } from './types';
import { generateImage, generateVideo } from './services/geminiService';

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    // Fixed: Added optional modifier to match ambient declaration in the environment
    aistudio?: AIStudio;
  }
}

const App: React.FC = () => {
  const [mode, setMode] = useState<GenerationMode>(GenerationMode.THUMBNAIL);
  const [prompt, setPrompt] = useState<string>('');
  const [generatedMediaUrl, setGeneratedMediaUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [quality, setQuality] = useState<ImageQuality>(ImageQuality.STANDARD);
  const [complexity, setComplexity] = useState<Complexity>(Complexity.STANDARD);
  const [videoConfig, setVideoConfig] = useState<VideoGenerationConfig>({
    duration: 4,
    style: VideoStyle.DEFAULT,
    aspectRatio: '16:9',
  });
  const [imageStyle, setImageStyle] = useState<ImageStyle>(ImageStyle.DEFAULT);
  const [customImageStyle, setCustomImageStyle] = useState<string>('');
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    try {
      const storedHistory = localStorage.getItem('generationHistory');
      if (storedHistory) {
        setHistory(JSON.parse(storedHistory));
      }
    } catch (error) {
      console.error("Failed to load history from localStorage", error);
    }
  }, []);

  const addToHistory = useCallback((newItem: HistoryItem) => {
    setHistory(prevHistory => {
      const updatedHistory = [newItem, ...prevHistory].slice(0, 50);
      try {
        localStorage.setItem('generationHistory', JSON.stringify(updatedHistory));
      } catch (error) {
        console.error("Failed to save history to localStorage", error);
      }
      return updatedHistory;
    });
  }, []);

  const ensureApiKey = async () => {
    if (quality === ImageQuality.HD || mode === GenerationMode.VIDEO) {
      // Fixed: Added safety check for optional aistudio property
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey) {
          await window.aistudio.openSelectKey();
          return true; 
        }
      }
    }
    return true;
  };
  
  const runImageGeneration = useCallback(async (
    genPrompt: string,
    genMode: GenerationMode,
    genImageStyle: ImageStyle,
    genCustomImageStyle: string,
    genQuality: ImageQuality,
    genComplexity: Complexity,
    inputBase64?: string
  ) => {
    if (!genPrompt.trim() && !inputBase64) {
      setError('Please enter a prompt or provide an image.');
      return;
    }

    setIsLoading(true);
    setGeneratedMediaUrl(null);
    setError(null);
    setLoadingMessage(genComplexity === Complexity.SIMPLE ? 'Applying simple edit...' : 'Engineering professional masterpiece...');

    try {
      await ensureApiKey();
      const mediaUrl = await generateImage(genPrompt, genMode, genImageStyle, genCustomImageStyle, inputBase64, genQuality, genComplexity);
      setGeneratedMediaUrl(mediaUrl);
      const newItem: HistoryItem = {
        id: new Date().getTime().toString(),
        timestamp: new Date().toISOString(),
        prompt: genPrompt || (inputBase64 ? 'Image Transformation' : ''),
        mode: genMode,
        imageStyle: genImageStyle,
        customImageStyle: genCustomImageStyle,
        imageDataUrl: mediaUrl,
        quality: genQuality,
        complexity: genComplexity
      };
      addToHistory(newItem);
    } catch (e: any) {
      console.error(e);
      if (e.message?.includes("Requested entity was not found")) {
        setError("API Key Error. Please select a valid key from a paid GCP project.");
        // Fixed: Added safety check for optional aistudio property
        await window.aistudio?.openSelectKey();
      } else {
        setError(`Generation failed: ${e.message || 'Unknown error'}`);
      }
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [addToHistory, quality, mode]);

  const handleGenerate = useCallback(async (inputBase64?: string) => {
    const finalInputImage = inputBase64 || sourceImage || undefined;
    
    if (mode === GenerationMode.VIDEO) {
        if (!prompt.trim()) {
          setError('Please enter a prompt.');
          return;
        }
        setIsLoading(true);
        setGeneratedMediaUrl(null);
        setError(null);
        setLoadingMessage('Initializing video sequence...');
        try {
            await ensureApiKey();
            const mediaUrl = await generateVideo(prompt, videoConfig);
            setGeneratedMediaUrl(mediaUrl);
        } catch (e: any) {
            console.error(e);
            setError(`Failed to generate video.`);
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    } else {
        await runImageGeneration(prompt, mode, imageStyle, customImageStyle, quality, complexity, finalInputImage);
    }
  }, [prompt, mode, imageStyle, customImageStyle, videoConfig, quality, complexity, runImageGeneration, sourceImage]);

  const handleSelectHistoryItem = (item: HistoryItem) => {
    setGeneratedMediaUrl(item.imageDataUrl);
    setPrompt(item.prompt);
    setMode(item.mode);
    setImageStyle(item.imageStyle);
    setCustomImageStyle(item.customImageStyle);
    if (item.quality) setQuality(item.quality);
    if (item.complexity) setComplexity(item.complexity);
  };

  const handleRegenerateFromHistory = (item: HistoryItem) => {
    setPrompt(item.prompt);
    setMode(item.mode);
    setImageStyle(item.imageStyle);
    setCustomImageStyle(item.customImageStyle);
    const q = item.quality || ImageQuality.STANDARD;
    const c = item.complexity || Complexity.STANDARD;
    setQuality(q);
    setComplexity(c);
    runImageGeneration(item.prompt, item.mode, item.imageStyle, item.customImageStyle, q, c);
  };

  const handleSaveEditedImage = useCallback((newUrl: string) => {
    const newItem: HistoryItem = {
      id: new Date().getTime().toString(),
      timestamp: new Date().toISOString(),
      prompt: `${prompt} (Edited)`,
      mode: mode,
      imageStyle: imageStyle,
      customImageStyle: customImageStyle,
      imageDataUrl: newUrl,
      quality: quality,
      complexity: complexity
    };
    addToHistory(newItem);
  }, [prompt, mode, imageStyle, customImageStyle, quality, complexity, addToHistory]);
  
  const handleDeleteHistoryItem = (id: string) => {
    const updatedHistory = history.filter(item => item.id !== id);
    setHistory(updatedHistory);
    localStorage.setItem('generationHistory', JSON.stringify(updatedHistory));
  };

  const handleClearHistory = () => {
    setHistory([]);
    localStorage.removeItem('generationHistory');
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans flex flex-col">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8 flex flex-col lg:flex-row gap-8">
        <div className="lg:w-1/4 lg:sticky top-8 self-start">
          <GeneratorControls
            mode={mode}
            setMode={setMode}
            prompt={prompt}
            setPrompt={setPrompt}
            handleGenerate={handleGenerate}
            isLoading={isLoading}
            videoConfig={videoConfig}
            setVideoConfig={setVideoConfig}
            imageStyle={imageStyle}
            setImageStyle={setImageStyle}
            customImageStyle={customImageStyle}
            setCustomImageStyle={setCustomImageStyle}
            quality={quality}
            setQuality={setQuality}
            complexity={complexity}
            setComplexity={setComplexity}
            sourceImage={sourceImage}
            setSourceImage={setSourceImage}
            onOpenCamera={() => setIsCameraOpen(true)}
          />
        </div>
        <div className="lg:w-1/2">
          <ImageDisplay
            isLoading={isLoading}
            loadingMessage={loadingMessage}
            generatedMedia={generatedMediaUrl}
            setGeneratedMedia={setGeneratedMediaUrl}
            error={error}
            mode={mode}
            videoConfig={mode === GenerationMode.VIDEO ? videoConfig : undefined}
            onSaveEdit={handleSaveEditedImage}
            quality={quality}
            onPromptUpdate={setPrompt}
            onAIAction={(base64) => handleGenerate(base64)}
          />
        </div>
        <div className="lg:w-1/4">
           <HistoryPanel
            history={history}
            onSelect={handleSelectHistoryItem}
            onRegenerate={handleRegenerateFromHistory}
            onDelete={handleDeleteHistoryItem}
            onClear={handleClearHistory}
           />
        </div>
      </main>
      <Footer />
      <CameraModal 
        isOpen={isCameraOpen} 
        onClose={() => setIsCameraOpen(false)} 
        onCapture={(img) => setSourceImage(img)} 
      />
    </div>
  );
};

export default App;
