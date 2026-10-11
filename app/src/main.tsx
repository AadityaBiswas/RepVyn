// Entry point: mounts the app. Built into one self-contained page by app/build.mjs.
import { render } from "preact";
import { registerServiceWorker } from "./cloud/pwa";
import { watchErrors } from "./cloud/telemetry";
import { AppRoot } from "./ui/app";

watchErrors();
registerServiceWorker();
render(<AppRoot />, document.getElementById("app")!);
