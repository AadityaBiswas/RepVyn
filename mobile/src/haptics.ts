// Haptics, kept for moments that earn them (Apple: causality, harmony, utility). Each fires on the event itself, in the same
// frame as what it confirms. Selection for a choice landing; light for a small commit; medium for a firm one; success when
// something is finished. Nothing buzzes on plain navigation.
//
// Android: expo-haptics drives the motor at 12–24 % strength (amplitude 30–60 of 255), which most phones' motors cannot
// make felt. Short pulses at the motor's full strength read as crisp clicks instead; length sets the weight.
import { Platform, Vibration } from "react-native";
import * as Haptics from "expo-haptics";

const android = Platform.OS === "android";
const quiet = (p: Promise<void>) => { void p.catch(() => {}); };
const pulse = (ms: number | number[]) => { try { Vibration.vibrate(ms); } catch { /* no motor */ } };

/** A choice landing: an option, a tab, a slider snapping, a countdown step. */
export const tick = () => (android ? pulse(8) : quiet(Haptics.selectionAsync()));
/** A light commit: a check-in, a swap, a page swiped away, the rest ending. */
export const tap = () => (android ? pulse(14) : quiet(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)));
/** A firm commit: a set logged, a workout or a timed hold starting. */
export const thud = () => (android ? pulse(24) : quiet(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)));
/** Something finished well: the workout done, a timed hold complete. Two beats, the second firmer. */
export const success = () => (android ? pulse([0, 14, 90, 26]) : quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)));
