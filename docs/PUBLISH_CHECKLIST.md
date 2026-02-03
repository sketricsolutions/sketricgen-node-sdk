# Publish checklist

Use this after making changes when you want to push to GitHub and/or publish to npm.

## 1. Push to GitHub

```bash
cd /path/to/sketricgen-node-sdk
npm run build
git add -A
git status   # ensure no .env, secrets, or node_modules
git commit -m "Your message"   # if you have changes
git push origin main
```

- Make the repo **public** (if desired): GitHub repo → Settings → General → Danger zone → Change visibility → Public.

## 2. Publish to npm (so anyone can `npm i sketricgen`)

**Requirement:** npm requires either **two-factor authentication (2FA)** or a **granular access token with publish permission** to publish packages. If you see `403 Forbidden - Two-factor authentication or granular access token with bypass 2fa enabled is required`, use one of the options below.

### Option A: Enable 2FA (recommended)

1. Go to [npmjs.com](https://www.npmjs.com) → log in → click your avatar → **Account settings**.
2. Under **Security**, enable **Two-Factor Authentication** (authenticator app or SMS).
3. In your terminal, run `npm publish` again. When prompted, enter the one-time code from your authenticator app (or SMS).

### Option B: Use a granular access token

1. On npm: **Account settings** → **Access Tokens** → **Generate New Token** → **Granular Access Token**.
2. Name it (e.g. "publish sketricgen"), choose **Packages and scopes** → **Read and write** for the packages you publish, and enable **Bypass 2FA for publish** if you want to publish without 2FA prompts.
3. Generate the token and copy it. Then in terminal:
   ```bash
   npm login
   ```
   When prompted for **Password**, paste the token (not your npm account password). Use your npm username and the token as the password.
4. Run `npm publish`.

---

1. **Log in once** (if not already):
   ```bash
   npm login
   ```
   Use your npmjs.com account (create one at https://www.npmjs.com/signup if needed). If using a token, paste the token when asked for password.

2. **Build and dry-run** (see what will be published):
   ```bash
   npm run build
   npm publish --dry-run
   ```

3. **Publish**:
   ```bash
   npm publish
   ```
   First publish of an unscoped name (e.g. `sketricgen`) makes the package public. If the name is taken, use a scoped name in `package.json` (e.g. `@your-org/sketricgen`) and publish with `npm publish --access public`.

## 3. Optional: tag and GitHub release

After publishing a version:

```bash
npm version patch   # or minor/major → updates package.json version
git push origin main
git push --tags
```

Then on GitHub: Releases → Draft a new release → choose the new tag (e.g. `v0.1.1`) and add release notes.
