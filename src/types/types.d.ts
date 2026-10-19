import type Alpine from 'alpinejs';
import type JSConfetti from 'js-confetti';

declare global {
  interface Window {
    Alpine: typeof Alpine;
    jsConfetti: JSConfetti;
  }
}

export {};
