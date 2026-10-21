import { registerRootComponent } from "expo";
import { randomUUID } from "expo-crypto";

// The shared store and workout code call crypto.randomUUID(), which React Native does not have.
const g = globalThis as { crypto?: { randomUUID?: () => string } };
g.crypto ??= {};
g.crypto.randomUUID ??= randomUUID;

import App from "./App";

registerRootComponent(App);
