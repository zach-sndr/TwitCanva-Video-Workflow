import { useRef, useCallback } from 'react';
import { findMenuSoundOption, getMenuSoundSettings } from '../services/menuSoundSettings';

export const useMenuSounds = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const fileAudioCacheRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const activeHoverAudioRef = useRef<HTMLAudioElement | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  const playDefaultMenuOpen = useCallback(() => {
    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(150, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.05);

      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.05);
    } catch (e) {
      // Audio not supported
    }
  }, [getAudioContext]);

  const playDefaultMenuItem = useCallback(() => {
    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.05);

      gainNode.gain.setValueAtTime(0.05, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.05);
    } catch (e) {
      // Audio not supported
    }
  }, [getAudioContext]);

  const playFileSound = useCallback((src: string) => {
    try {
      let baseAudio = fileAudioCacheRef.current.get(src);
      if (!baseAudio) {
        baseAudio = new Audio(src);
        baseAudio.preload = 'auto';
        fileAudioCacheRef.current.set(src, baseAudio);
      }

      const audio = baseAudio.cloneNode() as HTMLAudioElement;
      audio.volume = 0.35;
      void audio.play().catch(() => undefined);
    } catch {
      // Audio not supported
    }
  }, []);

  const stopHoverSound = useCallback(() => {
    const settings = getMenuSoundSettings();
    if (!settings.simplifyMenuSounds) return;

    const activeAudio = activeHoverAudioRef.current;
    if (!activeAudio) return;

    try {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    } catch {
      // Audio not supported
    }

    activeHoverAudioRef.current = null;
  }, []);

  const playClickSound = useCallback(() => {
    const settings = getMenuSoundSettings();
    const selected = findMenuSoundOption('menuOpen', settings.menuOpen);
    if (selected.kind === 'file' && selected.src) {
      playFileSound(selected.src);
      return;
    }
    playDefaultMenuOpen();
  }, [playDefaultMenuOpen, playFileSound]);

  const playHoverSound = useCallback(() => {
    const settings = getMenuSoundSettings();
    const selected = findMenuSoundOption('menuItem', settings.menuItem);
    if (selected.kind === 'file' && selected.src) {
      if (settings.simplifyMenuSounds) {
        stopHoverSound();
        try {
          let baseAudio = fileAudioCacheRef.current.get(selected.src);
          if (!baseAudio) {
            baseAudio = new Audio(selected.src);
            baseAudio.preload = 'auto';
            fileAudioCacheRef.current.set(selected.src, baseAudio);
          }

          const audio = baseAudio.cloneNode() as HTMLAudioElement;
          audio.volume = 0.35;
          activeHoverAudioRef.current = audio;
          void audio.play().catch(() => {
            if (activeHoverAudioRef.current === audio) {
              activeHoverAudioRef.current = null;
            }
          });
        } catch {
          // Audio not supported
        }
      } else {
        playFileSound(selected.src);
      }
      return;
    }
    playDefaultMenuItem();
  }, [playDefaultMenuItem, playFileSound, stopHoverSound]);

  return { playClickSound, playHoverSound, stopHoverSound };
};
