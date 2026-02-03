# Testing the Sketricgen Node SDK

Use this guide to verify the package locally: (A) build and run inside the SDK repo, then (B) use it from another Node project via `npm link`.

**Requirements:** Node.js >= 18.

---

## A. Build and run in the SDK repo

### 1. Install and build

```bash
cd sketricgen-node-sdk
npm install
npm run build
```

You should see a `dist/` folder with `.js` and `.d.ts` files.

### 2. Load environment variables

The client reads `SKETRICGEN_API_KEY` (and optionally `SKETRICGEN_TIMEOUT`, `SKETRICGEN_UPLOAD_TIMEOUT`, `SKETRICGEN_MAX_RETRIES`). Choose one of these approaches:

- **Shell:**  
  `export SKETRICGEN_API_KEY=your-api-key`
- **`.env` in SDK repo:**  
  Create a `.env` file (add it to `.gitignore` if needed) and either:
  - Use Node’s built-in env file (Node 20.6+):  
    `node --env-file=.env run-test.mjs`
  - Or install `dotenv` and at the top of your script:  
    `import 'dotenv/config';`  
    (after `npm install dotenv`)

### 3. Run a test script in the SDK repo

To see usage for each method from the CLI, run `npx sketricgen --help` or `npx sketricgen --help runWorkflow` (and similarly for `files.upload`, `fromEnv`, `SketricGenClient`).

The package is **ESM**. Use a `.mjs` file or run with `node --input-type=module` (or put the script in a project with `"type": "module"`).

**Example 1: Run an existing workflow (message only)**

Save as `run-test.mjs` in the SDK repo root:

```js
import { SketricGenClient } from './dist/index.js';

const client = SketricGenClient.fromEnv();
const AGENT_ID = 'YOUR_AGENT_ID'; // replace with a real agent ID

async function main() {
  const response = await client.runWorkflow(AGENT_ID, 'Hello, what can you do?');
  console.log('Response:', response.response);
  console.log('Conversation ID:', response.conversation_id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Run:

```bash
export SKETRICGEN_API_KEY=your-api-key
node run-test.mjs
```

**Example 2: Run workflow + file upload + user message**

Save as `run-test-with-file.mjs` in the SDK repo root:

```js
import { SketricGenClient } from './dist/index.js';

const client = SketricGenClient.fromEnv();
const AGENT_ID = 'YOUR_AGENT_ID';   // replace with a real agent ID
const FILE_PATH = './path/to/your/file.pdf';  // replace with a real file path (e.g. PDF or image)

async function main() {
  // Option A: Pass file path in runWorkflow (client uploads then runs)
  const response = await client.runWorkflow(AGENT_ID, 'Summarize this document.', {
    filePaths: [FILE_PATH],
  });
  console.log('Response:', response.response);

  // Option B: Upload first, then run with returned file ID
  // const uploadResult = await client.files.upload({ agentId: AGENT_ID, file: FILE_PATH });
  // const response = await client.runWorkflow(AGENT_ID, 'Summarize this document.', {
  //   assets: [uploadResult.fileId],
  // });
  // console.log('Response:', response.response);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Run:

```bash
export SKETRICGEN_API_KEY=your-api-key
node run-test-with-file.mjs
```

Replace `YOUR_AGENT_ID` and `FILE_PATH` with real values. Allowed file types: `image/jpeg`, `image/webp`, `image/png`, `application/pdf`, `image/gif`. Max file size: 20 MB.

---

## B. Test from another Node project (integration test)

This checks that the package’s **exports** and **entry points** work when consumed by another app (as they would after `npm publish`).

### 1. Link the SDK from the SDK repo

In the SDK repo, after building:

```bash
cd sketricgen-node-sdk
npm run build
npm link
```

### 2. Use the linked package in another app

In a **different** directory (your test app):

```bash
mkdir sketricgen-test-app && cd sketricgen-test-app
npm init -y
npm link sketricgen
```

Make the app ESM so `import` works. In `package.json` add:

```json
"type": "module"
```

Add a `.env` file (or export in the shell) with:

```
SKETRICGEN_API_KEY=your-api-key
```

### 3. Test script in the other app

To see method usage from the CLI in this app, run `npx sketricgen --help` or `npx sketricgen --help runWorkflow`.

Create `test.mjs` (or `test.js` if `"type": "module"` is set):

```js
import { SketricGenClient } from 'sketricgen';

// Load .env if you use dotenv (npm install dotenv)
// import 'dotenv/config';

const client = SketricGenClient.fromEnv();
const AGENT_ID = 'YOUR_AGENT_ID';

async function main() {
  // 1. Run workflow (message only)
  const response = await client.runWorkflow(AGENT_ID, 'Hello');
  console.log('Workflow response:', response.response);

  // 2. Optional: file upload then run with that file
  // const upload = await client.files.upload({ agentId: AGENT_ID, file: './document.pdf' });
  // const response2 = await client.runWorkflow(AGENT_ID, 'Summarize this.', { assets: [upload.fileId] });
  // console.log('With file:', response2.response);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Run:

```bash
export SKETRICGEN_API_KEY=your-api-key
node test.mjs
```

If you use a `.env` file, run with:

```bash
node --env-file=.env test.mjs
```

or add `import 'dotenv/config';` at the top and `npm install dotenv`, then:

```bash
node test.mjs
```

### 4. Unlink when done

In the test app:

```bash
npm unlink sketricgen
```

In the SDK repo (optional):

```bash
npm unlink
```

---

## Checklist

- [ ] **A.1** `npm install` and `npm run build` succeed in the SDK repo.
- [ ] **A.2** Env is loaded (e.g. `SKETRICGEN_API_KEY` set or `.env` with `--env-file` / `dotenv`).
- [ ] **A.3** Run workflow (message only) with a real agent ID and get a non-error response.
- [ ] **A.4** Run workflow with a file (path in `filePaths` or upload then `assets`) and get a non-error response.
- [ ] **B.1** `npm link` in SDK repo and `npm link sketricgen` in another app succeed.
- [ ] **B.2** In that app, `import { SketricGenClient } from 'sketricgen'` works and `runWorkflow` (and optionally `files.upload`) run without errors.

This verifies the published “shape” of the package (exports, `main`/`module`/`types`) when consumed by another project.
