# Michi — Japanese in sentences

1,000 beginner Japanese sentences with optional kana and romaji hints, English
typing, and spaced repetition. Study one sentence or a few, whenever you like.

## Open the app on GitHub Pages

After the deployment finishes, the app will be at:

**https://seriouspassenger.github.io/michi-japanese/**

One-time setup:

1. Open [Settings → Pages](https://github.com/SeriousPassenger/michi-japanese/settings/pages).
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Merge the Pages workflow into `main`, or, if it is already on `main`, open
   **Actions → Deploy Michi to GitHub Pages → Run workflow** and select `main`.
4. Wait for the `build` and `deploy` jobs to succeed, then open the app URL above.

Later pushes to `main` automatically run the checks and deploy the updated app.
Pull requests run the checks without deploying. No npm installation, build
framework, API key, or hosting secret is needed.

The workflow publishes the app's runtime files from the repository root. All
asset links and the offline cache use relative paths, including under the
`/michi-japanese/` project URL.

## Use it on your phone

Open the Pages URL and wait until **Preferences** says **Offline files are
ready**. Use your browser's **Add to Home Screen** or **Install** option for
easy access. The initial visit needs a connection; cached sentence study works
offline afterward. Installation support and optional speech voices vary by browser.

Progress stays in the browser on each device. To move existing progress from a
local file or another device, export a backup in **Preferences**, then import
it on the Pages app. Hosted and local-file browsers use separate storage.

## Local use and maintenance

Open `index.html` with its sibling files, or use `michi-portable.html` for the
bundled single-file version. See [README.txt](README.txt) for study settings,
deck details, and backup instructions.

When changing cached app files, increment the cache version in `sw.js` so
existing installations receive the new assets. If maintaining the portable
version, regenerate it from the updated relative files as well.

Run the available logical checks with Node:

```sh
node scheduler-tests.js
node grading-tests.js
node app-model-tests.cjs
node offline-tests.cjs
```

These checks cover scheduling, app workflows, backups, and offline-cache logic.
They do not replace real-browser layout and accessibility testing.
