// Timer alarm sounds, all synthesized with the Web Audio API, so they need no files,
// make no requests to other sites, and work offline.

export const ALARM_SOUNDS = [
  { id: "classic", label: "Classic" },
  { id: "chime", label: "Chime" },
  { id: "bowl", label: "Singing bowl" },
  { id: "marimba", label: "Marimba" },
  { id: "digital", label: "Digital" },
  { id: "none", label: "Silent" }
] as const;

export type AlarmSound = typeof ALARM_SOUNDS[number]["id"];

let context: AudioContext | null = null;

function audioContext(): AudioContext {
  context ??= new AudioContext();
  if (context.state === "suspended") context.resume();
  return context;
}

// One note: an oscillator with a quick attack and an exponential fade
function note(ctx: AudioContext, output: AudioNode, frequency: number, start: number, length: number, type: OscillatorType = "sine", level = 1): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(level, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  oscillator.connect(gain).connect(output);
  oscillator.start(start);
  oscillator.stop(start + length + 0.05);
}

export function playAlarmSound(sound: AlarmSound, volume = 0.7): void {
  if (sound === "none" || volume <= 0) return;

  const ctx = audioContext();
  const output = ctx.createGain();
  output.gain.value = volume * 0.5;
  output.connect(ctx.destination);
  const now = ctx.currentTime + 0.05;

  switch (sound) {
    case "classic":
      // A wind-up alarm clock: a small bell struck 14 times a second, in two bursts
      [0, 1.6].forEach(offset => {
        for (let strike = 0; strike < 16; strike++) {
          const start = now + offset + strike / 14;
          [[1975.5, 0.5], [2960, 0.22], [4186, 0.1]].forEach(([frequency, level]) =>
            note(ctx, output, frequency, start, 0.09, "sine", level)
          );
        }
      });
      break;
    case "chime":
      // A rising C major arpeggio, played twice
      [0, 1.4].forEach(offset =>
        [1046.5, 1318.5, 1568].forEach((frequency, i) => note(ctx, output, frequency, now + offset + i * 0.18, 1.2, "sine", 0.6))
      );
      break;
    case "bowl":
      // A long, soft tone with the inharmonic overtones of a struck bowl
      [[220, 0.7], [604, 0.3], [1186, 0.15]].forEach(([frequency, level]) =>
        note(ctx, output, frequency, now, 5, "sine", level)
      );
      break;
    case "marimba":
      [659.3, 784, 987.8, 784, 1318.5].forEach((frequency, i) =>
        note(ctx, output, frequency, now + i * 0.16, 0.45, "triangle", 0.8)
      );
      break;
    case "digital":
      // Two groups of three short beeps
      [0, 0.9].forEach(offset =>
        [0, 0.15, 0.3].forEach(step => note(ctx, output, 880, now + offset + step, 0.1, "square", 0.25))
      );
      break;
  }
}
