// True in `npm run build:demo`, the single-file build used for the shared
// demo page. That viewer blocks print dialogs, embedded videos, the camera
// and new tabs, so a few controls adapt.
export const DEMO = import.meta.env.MODE === 'demo'
