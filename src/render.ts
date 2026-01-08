/**
 * Brains Game Rendering
 *
 * Factory pattern for creating the renderer function.
 * Handles tiles, furniture, players, and UI.
 */

import {
    Game,
    Entity,
    Simple2DRenderer,
    Transform2D,
    Sprite,
    Player,
    Camera2D,
} from 'modu-engine';

import {
    TEAM_HUMAN,
    TEAM_ZOMBIE,
    TEAM_SICK,
    PHASE_WAITING,
    PHASE_PREOUTBREAK,
    PHASE_POSTOUTBREAK,
    TIME_PREOUTBREAK,
    TICK_RATE,
} from './constants';

import { TeamComponent, TileData, FurnitureData, GamePhaseComponent } from './entities';
import { getGameStateEntity, getSortedPlayers } from './systems';
import type { GameConfig, SpriteCache } from './types';

// ============================================
// Camera Update
// ============================================

export function updateCamera(
    game: Game,
    cameraEntity: Entity,
    getLocalClientId: () => number | null,
    alpha: number
): void {
    const localId = getLocalClientId();
    if (localId === null) return;

    const player = game.world.getEntityByClientId(localId);
    if (!player || player.destroyed) return;

    const camera = cameraEntity.get(Camera2D);

    // Interpolate player position
    player.interpolate(alpha);
    const x = player.render?.interpX ?? player.get(Transform2D).x;
    const y = player.render?.interpY ?? player.get(Transform2D).y;

    // Smooth camera follow
    camera.x += (x - camera.x) * camera.smoothing;
    camera.y += (y - camera.y) * camera.smoothing;
}

// ============================================
// Renderer Factory
// ============================================

export function createRenderer(
    game: Game,
    renderer: Simple2DRenderer,
    getCameraEntity: () => Entity,
    canvas: HTMLCanvasElement,
    config: GameConfig,
    tileSize: number,
    playerRadius: number,
    spriteCache: SpriteCache,
    getLocalClientId: () => number | null
): () => void {
    const ctx = renderer.context;
    const tileCols = spriteCache.tileCols;

    function renderWithCamera(): void {
        const cameraEntity = getCameraEntity();
        const alpha = game.getRenderAlpha();
        const camera = cameraEntity.get(Camera2D);

        // Update camera to follow local player
        updateCamera(game, cameraEntity, getLocalClientId, alpha);

        const camX = camera.x;
        const camY = camera.y;

        // Clear canvas
        ctx.fillStyle = '#0a0e14';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Apply camera transform
        ctx.save();
        ctx.translate(canvas.width / 2 - camX, canvas.height / 2 - camY);
        ctx.imageSmoothingEnabled = false;

        // Get all entities and sort by layer
        const entities = Array.from(game.getAllEntities()).filter(e => !e.destroyed);
        entities.sort((a, b) => {
            const aLayer = a.has(Sprite) ? a.get(Sprite).layer : 0;
            const bLayer = b.has(Sprite) ? b.get(Sprite).layer : 0;
            return aLayer - bLayer;
        });

        // Render all entities
        for (const entity of entities) {
            if (entity.destroyed) continue;

            // Interpolate position for smooth rendering
            entity.interpolate(alpha);
            const pos = { x: entity.render.interpX, y: entity.render.interpY };
            const type = entity.type;

            // Floor tiles
            if (type === '_floor' && entity.has(TileData)) {
                renderTile(ctx, entity, pos, tileSize, spriteCache, tileCols, '#1a2332');
                continue;
            }

            // Walls
            if (type === 'wall' && entity.has(TileData)) {
                renderTile(ctx, entity, pos, tileSize, spriteCache, tileCols, '#2c3e50');
                continue;
            }

            // Furniture
            if (type === 'furniture' && entity.has(FurnitureData)) {
                renderFurniture(ctx, game, entity, pos, spriteCache);
                continue;
            }

            // Players
            if (type === 'player' && entity.has(TeamComponent)) {
                renderPlayer(ctx, game, entity, pos, config, playerRadius, spriteCache);
            }
        }

        ctx.restore();
    }

    return renderWithCamera;
}

// ============================================
// Individual Render Functions
// ============================================

function renderTile(
    ctx: CanvasRenderingContext2D,
    entity: Entity,
    pos: { x: number; y: number },
    tileSize: number,
    spriteCache: SpriteCache,
    tileCols: number,
    fallbackColor: string
): void {
    const tileData = entity.get(TileData);
    const tilesheetImg = spriteCache.tilesheetImg;

    if (tilesheetImg && tileData.tileId) {
        const tileId = tileData.tileId - 1;
        const srcX = (tileId % tileCols) * tileSize;
        const srcY = Math.floor(tileId / tileCols) * tileSize;
        ctx.drawImage(
            tilesheetImg,
            srcX, srcY, tileSize, tileSize,
            pos.x - tileSize / 2, pos.y - tileSize / 2, tileSize, tileSize
        );
    } else {
        ctx.fillStyle = fallbackColor;
        ctx.fillRect(pos.x - tileSize / 2, pos.y - tileSize / 2, tileSize, tileSize);
    }
}

function renderFurniture(
    ctx: CanvasRenderingContext2D,
    game: Game,
    entity: Entity,
    pos: { x: number; y: number },
    spriteCache: SpriteCache
): void {
    const furnitureData = entity.get(FurnitureData);
    const transform = entity.get(Transform2D);
    const spriteUrl = game.getString('spriteUrl', furnitureData.spriteUrlId);
    const sprite = spriteCache.sprites.get(spriteUrl || '');
    const w = furnitureData.w;
    const h = furnitureData.h;
    const angle = transform ? transform.angle : 0;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    if (angle) ctx.rotate(angle);

    if (sprite) {
        ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
    } else {
        ctx.fillStyle = '#7f8c8d';
        ctx.fillRect(-w / 2, -h / 2, w, h);
    }

    ctx.restore();
}

function renderPlayer(
    ctx: CanvasRenderingContext2D,
    game: Game,
    entity: Entity,
    pos: { x: number; y: number },
    config: GameConfig,
    playerRadius: number,
    spriteCache: SpriteCache
): void {
    const teamComp = entity.get(TeamComponent);
    const teamNum = teamComp.team;

    // Get team configuration
    const teamName = teamNum === TEAM_ZOMBIE ? 'zombie' : teamNum === TEAM_SICK ? 'sick' : 'human';
    const teamConfig = config.entityTypes.player[teamName];
    const sprite = spriteCache.sprites.get(teamConfig?.sprite || '');
    const color = teamConfig?.color || '#fff';
    const aimAngle = teamComp.aimAngle;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(aimAngle);

    if (sprite) {
        ctx.drawImage(sprite, -playerRadius, -playerRadius, playerRadius * 2, playerRadius * 2);
    } else {
        // Fallback: colored circle
        ctx.beginPath();
        ctx.arc(0, 0, playerRadius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Direction indicator
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(playerRadius * 0.5, 0);
        ctx.lineTo(playerRadius * 0.8, -playerRadius * 0.2);
        ctx.lineTo(playerRadius * 0.8, playerRadius * 0.2);
        ctx.fill();
    }

    ctx.restore();
}

// ============================================
// UI Update Function
// ============================================

export function createUIUpdater(
    game: Game,
    phaseEl: HTMLElement,
    scoreEl: HTMLElement
): () => void {
    return () => {
        const stateEntity = getGameStateEntity(game);
        if (!stateEntity) return;

        const state = stateEntity.get(GamePhaseComponent);
        const players = getSortedPlayers(game);

        const humans = players.filter(p => p.get(TeamComponent).team === TEAM_HUMAN).length;
        const zombies = players.filter(p => p.get(TeamComponent).team === TEAM_ZOMBIE).length;
        const sick = players.filter(p => p.get(TeamComponent).team === TEAM_SICK).length;

        const ticksInPhase = state.gameTick - state.phaseStartTick;

        if (state.phase === PHASE_WAITING) {
            phaseEl.textContent = 'Waiting for players...';
        } else if (state.phase === PHASE_PREOUTBREAK) {
            const secondsLeft = Math.max(0, Math.ceil((TIME_PREOUTBREAK - ticksInPhase) / TICK_RATE));
            phaseEl.innerHTML = `Pre-outbreak: ${secondsLeft}s | <span class="team-humans">Humans: ${humans}</span> | Sick: ${sick}`;
        } else if (state.phase === PHASE_POSTOUTBREAK) {
            phaseEl.innerHTML = `<span class="team-humans">Humans: ${humans}</span> | <span class="team-zombies">Zombies: ${zombies}</span>`;
        } else {
            phaseEl.textContent = 'Round ended!';
        }
    };
}

// ============================================
// Sprite Loading
// ============================================

export async function loadSprites(
    config: GameConfig,
    spriteCache: SpriteCache
): Promise<void> {
    const loadSprite = (url: string): Promise<HTMLImageElement | null> => {
        if (spriteCache.sprites.has(url)) {
            return Promise.resolve(spriteCache.sprites.get(url)!);
        }

        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                spriteCache.sprites.set(url, img);
                resolve(img);
            };
            img.onerror = () => {
                console.warn('[Brains] Failed to load:', url);
                resolve(null);
            };
            img.src = url;
        });
    };

    // Load tilesheet
    const tilesheetInfo = config.map.tilesets?.[0];
    if (tilesheetInfo) {
        const img = await loadSprite(tilesheetInfo.localImage);
        spriteCache.tilesheetImg = img;
        spriteCache.tileCols = tilesheetInfo.columns || 1;
    }

    // Load player sprites
    await Promise.all([
        loadSprite(config.entityTypes.player.human.sprite),
        loadSprite(config.entityTypes.player.zombie.sprite),
        loadSprite(config.entityTypes.player.sick.sprite)
    ]);

    // Load furniture sprites (background)
    const furniturePromises = Object.values(config.entityTypes.furniture || {}).map(f => {
        if (f.sprite) return loadSprite(f.sprite);
        return Promise.resolve(null);
    });
    await Promise.all(furniturePromises);
}
