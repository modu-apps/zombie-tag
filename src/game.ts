/**
 * Brains Game - Zombie Tag Multiplayer
 * Build: 2026-01-08
 *
 * Properly structured TypeScript implementation following engine best practices.
 * Build auto-transforms: Math.sqrt() -> dSqrt(), Math.random() -> dRandom()
 */

import {
    createGame,
    Game,
    Entity,
    Transform2D,
    Body2D,
    Player,
    Sprite,
    Camera2D,
    Simple2DRenderer,
    Physics2DSystem,
    InputPlugin,
    enableDebugUI,
} from 'modu-engine';

import {
    TEAM_HUMAN,
    PHASE_WAITING,
    PHASE_ENDED,
} from './constants';

import type { GameConfig, SpriteCache } from './types';
import { defineEntities, TeamComponent, GamePhaseComponent, TileData, FurnitureData } from './entities';
import { setupSystems, setupCollisions, getGameStateEntity, getSortedPlayers } from './systems';
import { createRenderer, createUIUpdater, loadSprites } from './render';

// ============================================
// Game State
// ============================================

let game: Game;
let renderer: Simple2DRenderer;
let physics: Physics2DSystem;
let input: InputPlugin;
let cameraEntity: Entity;

let canvas: HTMLCanvasElement;
let config: GameConfig;
let tileSize: number;
let mapWidth: number;
let mapHeight: number;
let playerRadius: number;

// Canvas dimensions for aiming system
let WIDTH: number;
let HEIGHT: number;

// Manual key tracking (InputPlugin's deduplication rounds small values to 0)
// The engine's inputToString rounds by 10, so -1/0/1 becomes 0
const keysDown = new Set<string>();

/**
 * Get scaled movement vector from tracked keys
 * Returns values like 100/-100 instead of 1/-1 to survive InputPlugin's rounding
 */
function getMovementVector(): { x: number; y: number } {
    let x = 0, y = 0;
    if (keysDown.has('a') || keysDown.has('arrowleft')) x -= 100;
    if (keysDown.has('d') || keysDown.has('arrowright')) x += 100;
    if (keysDown.has('w') || keysDown.has('arrowup')) y -= 100;
    if (keysDown.has('s') || keysDown.has('arrowdown')) y += 100;
    return { x, y };
}

const spriteCache: SpriteCache = {
    sprites: new Map(),
    tilesheetImg: null,
    tileCols: 1
};

// ============================================
// Helper Functions
// ============================================

function getLocalClientId(): number | null {
    const clientId = game.localClientId;
    if (!clientId || typeof clientId !== 'string') return null;
    return game.internClientId(clientId);
}

/**
 * Ensure camera entity exists (survives snapshot loads)
 */
function ensureCameraEntity(): Entity {
    if (!cameraEntity || cameraEntity.destroyed || !cameraEntity.has(Camera2D)) {
        cameraEntity = game.spawn('camera');
        const cam = cameraEntity.get(Camera2D);
        cam.x = mapWidth / 2;
        cam.y = mapHeight / 2;
        cam.smoothing = 0.5;  // Higher = more responsive (0.15 was too laggy)
        renderer.camera = cameraEntity;
    }
    return cameraEntity;
}

// ============================================
// Room Creation - Map Setup
// ============================================

/**
 * Create static map elements (floors, walls) - called by everyone including late joiners.
 * These are .syncNone() so they're not in snapshots - each client creates them locally.
 */
function createStaticMap(): void {
    // Skip if already created (check for any wall)
    if ([...game.query('wall')].length > 0) return;

    // Floor tiles are NO LONGER entities - rendered directly from tilemap in render.ts

    // Create walls (needed for physics collision)
    const wallLayer = config.map.layers.find(l => l.name === 'walls' || l.name === 'collision');
    if (wallLayer) {
        for (let i = 0; i < wallLayer.data.length; i++) {
            if (wallLayer.data[i] !== 0) {
                const tx = (i % config.map.width) * tileSize + tileSize / 2;
                const ty = Math.floor(i / config.map.width) * tileSize + tileSize / 2;
                game.spawn('wall', { x: tx, y: ty, tileId: wallLayer.data[i] });
            }
        }
    }
}

function createMap(): void {
    // Create static map (floors, walls)
    createStaticMap();

    // Create game-state entity to hold authoritative game phase
    const stateEntity = game.spawn('game-state', {
        phase: PHASE_WAITING,
        gameTick: 0,
        phaseStartTick: 0,
        sickInfectionTick: 0,
        outbreakTick: 0
    });

    // Create furniture
    config.initialEntities.forEach((e, configIndex) => {
        const type = config.entityTypes.furniture[e.type];
        if (!type) return;

        const w = (e.width || type.width) * tileSize;
        const h = (e.height || type.height) * tileSize;
        const x = e.x * tileSize;
        const y = e.y * tileSize;
        const spriteUrlId = game.internString('spriteUrl', type.sprite);
        const angleDegrees = e.angle || 0;
        const angleRadians = (angleDegrees * Math.PI) / 180;

        // Calculate mass based on furniture size
        const area = (w * h) / (tileSize * tileSize);
        let mass = 2 + area * 0.5;

        // Make certain furniture types heavier
        if (['sofa', 'couch', 'bigTable', 'bed', 'tank'].includes(e.type)) {
            mass *= 2;
        } else if (['tv', 'smallTable'].includes(e.type)) {
            mass *= 1.5;
        }

        const furniture = game.spawn('furniture', {
            x, y,
            angle: angleRadians,
            width: w,
            height: h,
            mass: mass,
            angularVelocity: 0
        });

        // Ensure Body2D dimensions are set
        const body = furniture.get(Body2D);
        if (body) {
            body.width = w;
            body.height = h;
            body.mass = mass;
            body.angularVelocity = 0;
        }

        // Store config index for round reset - MUST set manually after spawn
        const furnitureData = furniture.get(FurnitureData);
        if (furnitureData) {
            furnitureData.spriteUrlId = spriteUrlId;
            furnitureData.w = w;
            furnitureData.h = h;
            furnitureData.configIndex = configIndex;
        }
    });
}

// ============================================
// Player Spawn/Despawn
// ============================================

function spawnPlayer(clientId: string): void {
    // CRITICAL: Check if player entity already exists (from snapshot)
    // This prevents duplicate entity creation that causes desync
    // Must intern first to ensure mapping exists, then use world method with numeric ID
    // (Same pattern as push-box game which doesn't have desync issues)
    const numericId = game.internClientId(clientId);
    const existing = game.world.getEntityByClientId(numericId);
    if (existing) {
        console.log(`[spawn] Player ${clientId.slice(0,8)} already exists (eid=${existing.eid}), skipping spawn`);
        return;
    }

    const spawn = config.regions.spawn;
    // Fixed spawn position - center of spawn region
    // Using Math.random() causes desync because late joiners have different RNG state during catchup
    const x = (spawn.x + spawn.width / 2) * tileSize;
    const y = (spawn.y + spawn.height / 2) * tileSize;

    console.log(`[spawn] Creating player ${clientId.slice(0,8)} at (${x.toFixed(0)}, ${y.toFixed(0)})`);
    game.spawn('player', {
        x, y,
        clientId,
        team: TEAM_HUMAN,
        score: 0
    });
}

function despawnPlayer(clientId: string): void {
    const numericId = game.internClientId(clientId);
    const entity = game.getEntityByClientId(numericId);
    entity?.destroy();
}

// ============================================
// Main Entry Point
// ============================================

export async function initGame(): Promise<void> {
    // Load configuration
    const res = await fetch('brains.json');
    const data = await res.json();
    config = data.game as GameConfig;

    tileSize = config.metadata.tileSize;
    mapWidth = config.map.width * tileSize;
    mapHeight = config.map.height * tileSize;
    playerRadius = config.entityTypes.player.human.width * tileSize;

    // Setup canvas
    canvas = document.getElementById('game') as HTMLCanvasElement;
    canvas.width = Math.min(mapWidth, window.innerWidth - 40);
    canvas.height = Math.min(mapHeight, window.innerHeight - 40);
    WIDTH = canvas.width;
    HEIGHT = canvas.height;

    // Handle window resize
    window.addEventListener('resize', () => {
        canvas.width = Math.min(mapWidth, window.innerWidth - 40);
        canvas.height = Math.min(mapHeight, window.innerHeight - 40);
        WIDTH = canvas.width;
        HEIGHT = canvas.height;
    });

    // Manual keyboard tracking - bypasses InputPlugin's deduplication issue
    // The engine rounds input values by 10, so small values like -1/0/1 become 0
    window.addEventListener('keydown', (e) => {
        keysDown.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => {
        keysDown.delete(e.key.toLowerCase());
    });
    // Clear keys when window loses focus to prevent stuck keys
    window.addEventListener('blur', () => {
        keysDown.clear();
    });

    // Create game instance
    game = createGame();
    physics = game.addPlugin(Physics2DSystem, { gravity: { x: 0, y: 0 } });
    renderer = game.addPlugin(Simple2DRenderer, canvas);
    input = game.addPlugin(InputPlugin, canvas);

    // Expose for debugging
    (window as any).game = game;

    // Define entities
    defineEntities(game, tileSize, playerRadius);

    // Load sprites
    await loadSprites(config, spriteCache);

    // Hide loading, show UI
    document.getElementById('loading')!.style.display = 'none';
    document.getElementById('ui')!.style.display = 'block';

    // Setup input actions
    // Movement input - uses manual key tracking with scaled values
    // The callback returns values like 100/-100 which survive InputPlugin's rounding
    input.action('move', {
        type: 'vector',
        bindings: [getMovementVector]
    });

    // Aim input - raw mouse position on canvas
    // Direction is calculated in the aiming system relative to screen center
    input.action('aim', {
        type: 'vector',
        bindings: ['mouse']
    });

    // Create camera entity
    cameraEntity = game.spawn('camera');
    const cam = cameraEntity.get(Camera2D);
    cam.x = mapWidth / 2;
    cam.y = mapHeight / 2;
    cam.smoothing = 0.15;
    renderer.camera = cameraEntity;

    // Create UI updater
    const phaseEl = document.getElementById('phase')!;
    const scoreEl = document.getElementById('score')!;
    const updateUI = createUIUpdater(game, phaseEl, scoreEl);

    // Setup systems
    setupSystems(game, config, tileSize, WIDTH, HEIGHT, updateUI);
    setupCollisions(game, physics, tileSize);

    // Create renderer
    const renderFn = createRenderer(
        game, renderer, ensureCameraEntity, canvas, config, tileSize, playerRadius,
        spriteCache, getLocalClientId
    );
    renderer.render = renderFn;

    // Connect to server with proper callbacks including onSnapshot
    game.connect('brains', {
        onRoomCreate() {
            createMap();
        },

        onConnect(clientId: string) {
            spawnPlayer(clientId);
        },

        onDisconnect(clientId: string) {
            despawnPlayer(clientId);
        },

        /**
         * CRITICAL: onSnapshot handler for late joiners
         *
         * When a client joins late, they receive a snapshot of the current game state.
         * This callback allows us to properly synchronize client state with the server.
         *
         * Note: Walls are now synced (not syncNone) to ensure physics body creation
         * order matches room creator. This prevents physics divergence.
         */
        onSnapshot(entities: Entity[]) {
            // Find local player and center camera on them
            const localId = getLocalClientId();
            if (localId !== null) {
                for (const entity of entities) {
                    if (entity.type === 'player' && !entity.destroyed) {
                        const playerComp = entity.get(Player);
                        if (playerComp.clientId === localId) {
                            const transform = entity.get(Transform2D);
                            const camEntity = ensureCameraEntity();
                            const cam = camEntity.get(Camera2D);
                            cam.x = transform.x;
                            cam.y = transform.y;
                            break;
                        }
                    }
                }
            }
        }
    });

    // Enable debug UI
    enableDebugUI(game);

    // Handle round restart after end
    // This is done client-side with a check to ensure determinism
    game.addSystem(() => {
        const stateEntity = getGameStateEntity(game);
        if (!stateEntity) return;

        const state = stateEntity.get(GamePhaseComponent);

        // Check if round ended and enough time has passed (5 seconds = 100 ticks)
        if (state.phase === PHASE_ENDED) {
            const ticksSinceEnd = state.gameTick - state.phaseStartTick;
            if (ticksSinceEnd >= 100) {  // 5 seconds at 20 tick rate
                const players = getSortedPlayers(game);
                if (players.length >= 2) {
                    // Reset to preoutbreak
                    state.phase = 1; // PHASE_PREOUTBREAK
                    state.phaseStartTick = state.gameTick;
                    state.sickInfectionTick = 0;
                    state.outbreakTick = 0;

                    // Reset all players to human and respawn at spawn area
                    const spawn = config.regions.spawn;
                    const spawnCenterX = (spawn.x + spawn.width / 2) * tileSize;
                    const spawnCenterY = (spawn.y + spawn.height / 2) * tileSize;

                    for (let i = 0; i < players.length; i++) {
                        const player = players[i];
                        const teamComp = player.get(TeamComponent);
                        teamComp.team = TEAM_HUMAN;
                        teamComp.score = 0;

                        // Reset position to spawn area (deterministic based on player index)
                        const transform = player.get(Transform2D);
                        const body = player.get(Body2D);
                        // Spread players in a grid pattern around spawn center
                        const col = i % 4;
                        const row = Math.floor(i / 4);
                        const offsetX = (col - 1.5) * playerRadius * 3;
                        const offsetY = (row - 0.5) * playerRadius * 3;
                        transform.x = spawnCenterX + offsetX;
                        transform.y = spawnCenterY + offsetY;
                        // Stop movement
                        if (body) {
                            body.vx = 0;
                            body.vy = 0;
                        }
                    }

                    // Reset all furniture by destroying and recreating from config
                    // This is the only reliable way since physics engine has internal state
                    const furniture = [...game.query('furniture')];
                    for (const f of furniture) {
                        f.destroy();
                    }

                    // Recreate all furniture from config
                    config.initialEntities.forEach((e, configIndex) => {
                        const type = config.entityTypes.furniture[e.type];
                        if (!type) return;

                        const w = (e.width || type.width) * tileSize;
                        const h = (e.height || type.height) * tileSize;
                        const x = e.x * tileSize;
                        const y = e.y * tileSize;
                        const spriteUrlId = game.internString('spriteUrl', type.sprite);
                        const angleDegrees = e.angle || 0;
                        const angleRadians = (angleDegrees * Math.PI) / 180;

                        const area = (w * h) / (tileSize * tileSize);
                        let mass = 2 + area * 0.5;
                        if (['sofa', 'couch', 'bigTable', 'bed', 'tank'].includes(e.type)) {
                            mass *= 2;
                        } else if (['tv', 'smallTable'].includes(e.type)) {
                            mass *= 1.5;
                        }

                        const newFurniture = game.spawn('furniture', {
                            x, y,
                            angle: angleRadians,
                            width: w,
                            height: h,
                            mass: mass,
                            angularVelocity: 0
                        });

                        const body = newFurniture.get(Body2D);
                        if (body) {
                            body.width = w;
                            body.height = h;
                            body.mass = mass;
                            body.angularVelocity = 0;
                        }

                        const furnitureData = newFurniture.get(FurnitureData);
                        if (furnitureData) {
                            furnitureData.spriteUrlId = spriteUrlId;
                            furnitureData.w = w;
                            furnitureData.h = h;
                            furnitureData.configIndex = configIndex;
                        }
                    });

                } else {
                    // Not enough players, go back to waiting
                    state.phase = PHASE_WAITING;
                }
            }
        }
    }, { phase: 'update' });
}

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGame);
} else {
    initGame();
}
