import React, { useEffect, useState, useRef } from 'react';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+';

interface ScrambleTextProps {
  text: string;
  isHovered: boolean;
  speed?: 'slow' | 'fast';
}

export const ScrambleText: React.FC<ScrambleTextProps> = ({ text, isHovered, speed = 'slow' }) => {
  const [displayText, setDisplayText] = useState(text);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runScramble = () => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    let step = 0;
    const intervalTime = speed === 'fast' ? 10 : 25;
    const maxSteps = speed === 'fast' ? text.length * 4 : text.length * 3;

    const scramble = () => {
      if (step < maxSteps) {
        const scrambleProgress = speed === 'fast' ? 4 : 3;
        const scrambled = text.split('').map((char, i) => {
          if (char === ' ') return ' ';
          if (i < step / scrambleProgress) return char;
          return CHARS[Math.floor(Math.random() * CHARS.length)];
        });
        setDisplayText(scrambled.join(''));
        step++;
      } else {
        setDisplayText(text);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    };

    scramble();
    intervalRef.current = setInterval(scramble, intervalTime);
  };

  useEffect(() => {
    if (isHovered) {
      runScramble();
    } else {
      // Immediately show normal text when not hovered
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setDisplayText(text);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isHovered, text, speed]);

  return <>{displayText}</>;
};
