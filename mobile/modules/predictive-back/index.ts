// Android's predictive back gesture, as it happens (see android/…/PredictiveBackModule.kt). Null on iOS and the web.
import { requireOptionalNativeModule } from "expo-modules-core";

type Events = {
  onBackStart: (e: { left: boolean }) => void;
  onBackProgress: (e: { progress: number }) => void;
  onBackCancel: () => void;
  onBack: () => void;
};
interface PredictiveBack {
  setEnabled(enabled: boolean): void;
  addListener<K extends keyof Events>(event: K, listener: Events[K]): { remove(): void };
}

export const predictiveBack = requireOptionalNativeModule<PredictiveBack>("PredictiveBack");
