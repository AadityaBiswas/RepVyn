import type { ExternalPreset, Params, Region } from "./types";

export type Intensity = "light" | "moderate" | "hard";

/**
 * Fatigue from an external activity: preset per-60-min (moderate) values × minutes/60 × intensity.
 * No stimulus, novelty N = 1.
 */
export function externalLoad(
  presetId: ExternalPreset,
  minutes: number,
  intensity: Intensity,
  params: Params,
): { regions: [Region, number][]; systemic: number } {
  const preset = params.external.presets[presetId];
  const scale = (minutes / 60) * params.external.intensity[intensity];
  const regions = (Object.entries(preset.fatigue) as [Region, number][]).map(([r, f]): [Region, number] => [r, f * scale]);
  return { regions, systemic: preset.systemic * scale };
}
