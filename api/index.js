// Vercel runs this file as one serverless function for every /api/* request (see vercel.json).
// The Express app is bundled to server/dist/app.js during the build.
export { app as default } from "../server/dist/app.js";
