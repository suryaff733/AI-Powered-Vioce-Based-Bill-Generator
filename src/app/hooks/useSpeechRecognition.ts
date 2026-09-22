"use client";

import { useState, useEffect, useRef } from "react";

export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [language, setLanguageState] = useState("te-IN"); // Telugu-First primary setting
  const [confidence, setConfidence] = useState<number>(100);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        setIsSupported(true);
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = false;
        
        let savedLang = "te-IN";
        try {
          savedLang = localStorage.getItem("svs_voice_lang") || "te-IN";
        } catch (e) {}
        setLanguageState(savedLang);
        rec.lang = savedLang;

        rec.onstart = () => {
          setIsListening(true);
          setError(null);
        };

        rec.onresult = (event: any) => {
          let currentTranscript = "";
          let aggregateConfidence = 0;
          let resultCount = 0;
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              currentTranscript += event.results[i][0].transcript + " ";
              aggregateConfidence += event.results[i][0].confidence || 0.85;
              resultCount++;
            }
          }
          if (currentTranscript.trim()) {
            setTranscript((prev) => prev + currentTranscript);
            const finalConfidence = resultCount > 0 ? Math.round((aggregateConfidence / resultCount) * 100) : 100;
            setConfidence(finalConfidence);
          }
        };

        rec.onerror = (event: any) => {
          if (event.error === "no-speech") {
            return;
          }
          console.error("Speech recognition error:", event.error);
          setError(event.error);
          setIsListening(false);
        };

        rec.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = rec;

        return () => {
          try {
            rec.abort();
          } catch (e) {}
        };
      }
    }
  }, []);

  const startListening = () => {
    if (!isSupported || !recognitionRef.current) return;
    try {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setError(null);
      recognitionRef.current.lang = language;
      recognitionRef.current.start();
    } catch (err: any) {
      if (err.name !== "InvalidStateError") {
        console.error("Failed to start speech recognition:", err);
        setError(err.message || "Could not start recognition");
      }
    }
  };

  const stopListening = () => {
    if (!isSupported || !recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch (err: any) {
      console.error("Failed to stop speech recognition:", err);
    }
  };

  const resetTranscript = () => {
    setTranscript("");
    setConfidence(100);
    setError(null);
  };

  const changeLanguage = (lang: string) => {
    setLanguageState(lang);
    try {
      localStorage.setItem("svs_voice_lang", lang);
    } catch (e) {}
    if (recognitionRef.current) {
      recognitionRef.current.lang = lang;
    }
  };

  return {
    isListening,
    transcript,
    error,
    isSupported,
    language,
    confidence,
    startListening,
    stopListening,
    resetTranscript,
    changeLanguage,
  };
}
