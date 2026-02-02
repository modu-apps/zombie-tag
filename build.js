/**
 * Build script for Brains game
 *
 * Features:
 * - Deterministic transform: converts Math.sqrt -> dSqrt, Math.random -> dRandom
 * - Bundles game code (engine loaded from CDN/localhost)
 * - Source maps for debugging
 *
 * Usage:
 *   node build.js           # Build once
 *   node build.js --watch   # Watch mode
 *   node build.js --watch --serve  # Watch + dev server
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

/**
 * Transform code to use deterministic math functions.
 */
function deterministicTransform(code, filename, fullPath) {
    if (filename.includes('node_modules') || fullPath.includes('engine')) {
        return code;
    }

    console.log(`[deterministic] Transforming: ${filename}`);

    const neededImports = new Set();
    const existingImportMatch = code.match(/import\s*\{([^}]+)\}\s*from\s*['"]modu-engine['"]/s);
    const existingImportBlock = existingImportMatch ? existingImportMatch[1] : '';

    const hasDSqrt = /\bdSqrt\b/.test(existingImportBlock);
    const hasDRandom = /\bdRandom\b/.test(existingImportBlock);

    // Transform Math.sqrt(x) -> dSqrt(x)
    code = code.replace(/Math\.sqrt\s*\(/g, () => {
        if (!hasDSqrt) neededImports.add('dSqrt');
        return 'dSqrt(';
    });

    // Transform Math.random() -> dRandom()
    code = code.replace(/Math\.random\s*\(\s*\)/g, () => {
        if (!hasDRandom) neededImports.add('dRandom');
        return 'dRandom()';
    });

    // Add imports if needed
    if (neededImports.size > 0) {
        const imports = Array.from(neededImports).join(', ');
        const engineImportRegex = /import\s*\{([^}]+)\}\s*from\s*['"]modu-engine['"]/s;
        const match = code.match(engineImportRegex);

        if (match) {
            let existingImports = match[1].trim();
            if (existingImports.endsWith(',')) {
                existingImports = existingImports.slice(0, -1);
            }
            const newImports = `${existingImports}, ${imports}`;
            code = code.replace(engineImportRegex, `import { ${newImports} } from 'modu-engine'`);
        } else {
            code = `import { ${imports} } from 'modu-engine';\n` + code;
        }
    }

    return code;
}

const deterministicPlugin = {
    name: 'deterministic',
    setup(build) {
        build.onLoad({ filter: /\.(ts|js)$/ }, async (args) => {
            const source = await fs.promises.readFile(args.path, 'utf8');
            const transformed = deterministicTransform(source, path.basename(args.path), args.path);
            return {
                contents: transformed,
                loader: args.path.endsWith('.ts') ? 'ts' : 'js',
            };
        });
    },
};

// Plugin to map 'modu-engine' imports to the CDN global (window.Modu)
const cdnEnginePlugin = {
    name: 'cdn-engine',
    setup(build) {
        // Resolve 'modu-engine' to a virtual module
        build.onResolve({ filter: /^modu-engine$/ }, () => ({
            path: 'modu-engine',
            namespace: 'cdn-global',
        }));

        // Return a module that re-exports from the global
        build.onLoad({ filter: /.*/, namespace: 'cdn-global' }, () => ({
            contents: 'module.exports = window.Modu;',
            loader: 'js',
        }));
    },
};

const buildOptions = {
    entryPoints: ['src/game.ts'],
    bundle: true,
    outfile: 'dist/game.js',
    format: 'iife',
    globalName: 'BrainsGame',
    sourcemap: true,
    target: 'es2020',
    plugins: [deterministicPlugin, cdnEnginePlugin],
    define: {
        'process.env.NODE_ENV': '"development"',
    },
    logLevel: 'info',
};

async function build() {
    const args = process.argv.slice(2);
    const watch = args.includes('--watch');
    const serve = args.includes('--serve');

    // Auto-detect: CI/GitHub Actions = production (CDN), otherwise local
    const isCI = process.env.CI || process.env.GITHUB_ACTIONS;
    const localEngineUrl = 'http://localhost:3001/dist/modu.iife.js';
    const cdnEngineUrl = `https://cdn.moduengine.com/modu.iife.js?v=${Date.now()}`;
    const engineUrl = isCI ? cdnEngineUrl : localEngineUrl;

    if (!fs.existsSync('dist')) {
        fs.mkdirSync('dist');
    }

    // Copy assets to dist
    const assetsTocp = ['brains.json'];
    for (const asset of assetsTocp) {
        if (fs.existsSync(asset)) {
            fs.copyFileSync(asset, `dist/${asset}`);
        }
    }

    // Copy local engine from parent directory (if not CI)
    if (!isCI) {
        const localEnginePath = path.join(__dirname, '../../engine/dist/modu.iife.js');
        if (fs.existsSync(localEnginePath)) {
            fs.copyFileSync(localEnginePath, 'dist/modu-local.js');
            console.log('[build] Copied local engine from ../../engine/dist/modu.iife.js');
        } else {
            console.warn('[build] WARNING: Local engine not found at', localEnginePath);
        }
    }

    // Create/update index.html in dist
    // TEMP: Force CDN to test if desync is from local changes
    const forceCDN = false;
    const engineScript = (isCI || forceCDN)
        ? `<script>document.write('<script src="https://cdn.moduengine.com/modu.min.js?v=' + Date.now() + '"><\\/script>');</script>`
        : `<script src="modu-local.js?v=${Date.now()}"></script>`;

    const indexHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Brains - Zombie Tag</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: #0a0e14;
            color: #e0e0e0;
            font-family: system-ui, -apple-system, sans-serif;
            overflow: hidden;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
        }
        canvas { border: 2px solid #1a1f2e; background: #16213e; cursor: crosshair; }
        #ui {
            position: fixed; top: 20px; left: 20px;
            background: rgba(0, 0, 0, 0.8); padding: 15px; border-radius: 8px;
            backdrop-filter: blur(5px); min-width: 200px;
        }
        #ui h2 { color: #4ecdc4; font-size: 18px; margin-bottom: 10px; }
        .phase { color: #ffd700; font-weight: bold; margin: 8px 0; }
        .team-humans { color: #4ecdc4; }
        .team-zombies { color: #e94560; }
        #loading { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #4ecdc4; }
    </style>
</head>
<body>
    <div id="loading">Loading game...</div>
    <canvas id="game"></canvas>
    <div id="ui" style="display: none;">
        <h2>Brains</h2>
        <div class="phase" id="phase">Waiting...</div>
        <div id="score"></div>
    </div>

    <!-- Modu Engine -->
    ${engineScript}
    <!-- Expose Modu global for bundled imports -->
    <script>if(typeof Modu!=='undefined')window.Modu=Modu;</script>
    <!-- Game bundle (uses Modu global) -->
    <script src="game.js"></script>
</body>
</html>`;

    fs.writeFileSync('dist/index.html', indexHtml);
    console.log('[build] Engine: ' + (isCI ? 'CDN (CI)' : 'localhost'));

    if (watch) {
        const ctx = await esbuild.context(buildOptions);
        await ctx.watch();
        console.log('[build] Watching for changes...');

        if (serve) {
            // Kill any existing process on the port
            const { execSync } = require('child_process');
            try {
                if (process.platform === 'win32') {
                    execSync('npx kill-port 8082', { stdio: 'ignore' });
                } else {
                    execSync('lsof -ti:8082 | xargs kill -9 2>/dev/null || true', { stdio: 'ignore' });
                }
            } catch { }

            const { port } = await ctx.serve({
                servedir: 'dist',
                port: 8082,
            });
            console.log(`[build] Serving at http://localhost:${port}`);
        }
    } else {
        await esbuild.build(buildOptions);
        console.log('[build] Done!');
    }
}

build().catch((err) => {
    console.error(err);
    process.exit(1);
});
