/**
 * Brains Game Entity Definitions
 *
 * Components and entity type registrations.
 * Uses proper GamePhase component instead of storing state in Sprite.
 */

import {
    Game,
    Transform2D,
    Body2D,
    Player,
    Sprite,
    Camera2D,
    BODY_KINEMATIC,
    BODY_STATIC,
    BODY_DYNAMIC,
    SHAPE_CIRCLE,
    SHAPE_RECT,
    defineComponent,
} from 'modu-engine';

import {
    TEAM_HUMAN,
    PHASE_WAITING,
} from './constants';

// ============================================
// Custom Components
// ============================================

/**
 * Team component - stores player team and score
 */
export const TeamComponent = defineComponent('Team', {
    team: TEAM_HUMAN,       // 0=human, 1=zombie, 2=sick
    score: 0
    // Note: aimAngle removed from sync - computed at render time to avoid floating-point desync
});

/**
 * GamePhase component - stores authoritative game state
 * Attached to a dedicated game-state entity for proper synchronization.
 * This replaces the hacky pattern of storing game state in Sprite component.
 */
export const GamePhaseComponent = defineComponent('GamePhase', {
    phase: PHASE_WAITING,      // 0=waiting, 1=preoutbreak, 2=postoutbreak, 3=ended
    gameTick: 0,
    phaseStartTick: 0,
    sickInfectionTick: 0,
    outbreakTick: 0
});

/**
 * TileData component - stores tile ID for floor/wall rendering
 */
export const TileData = defineComponent('TileData', {
    tileId: 0
});

/**
 * FurnitureData component - stores furniture sprite, dimensions, and config index
 * Config index is used to look up initial position from config.initialEntities on round restart
 */
export const FurnitureData = defineComponent('FurnitureData', {
    spriteUrlId: 0,  // Interned string ID
    w: 64,           // Pixel width (integer to avoid f32 desync)
    h: 64,           // Pixel height (integer to avoid f32 desync)
    configIndex: 0   // Index in config.initialEntities for position reset
});

// ============================================
// Entity Definitions
// ============================================

export function defineEntities(game: Game, tileSize: number, playerRadius: number): void {
    // Game state entity - holds authoritative game phase data
    // This entity syncs game state to all clients properly
    game.defineEntity('game-state')
        .with(GamePhaseComponent)
        .register();

    // Floor tiles - NO LONGER ENTITIES
    // Floors are rendered directly from tilemap data in render.ts
    // This saves ~1500+ entities and massive snapshot size

    // Walls - physics collision only (rendered from tilemap in render.ts)
    // MUST be synced to ensure physics body creation order matches between
    // room creator and late joiners. Without sync, walls are created at different
    // times causing physics divergence.
    game.defineEntity('wall')
        .with(Transform2D)
        .with(Body2D, { shapeType: SHAPE_RECT, width: tileSize, height: tileSize, bodyType: BODY_STATIC })
        .register();

    // Furniture - dynamic physics objects (pushable)
    game.defineEntity('furniture')
        .with(Transform2D)
        .with(Sprite, { shape: SHAPE_RECT, layer: 2, visible: false })
        .with(Body2D, {
            shapeType: SHAPE_RECT,
            bodyType: BODY_DYNAMIC,
            mass: 5,
            restitution: 0.01,  // Nearly zero bounce to reduce wall jitter
            friction: 0.1,      // Low friction
            damping: 0.8,       // High damping to settle quickly
            width: tileSize,
            height: tileSize
        })
        .with(FurnitureData)
        .register();

    // Player - dynamic body with high mass (Box2D-style character)
    // Using dynamic instead of kinematic so physics naturally handles wall collisions
    const playerSize = playerRadius * 2;  // Convert radius to diameter for rect size
    game.defineEntity('player')
        .with(Transform2D)
        .with(Sprite, { shape: SHAPE_RECT, width: playerSize, height: playerSize, layer: 3 })
        .with(Body2D, {
            shapeType: SHAPE_RECT,
            width: playerSize,
            height: playerSize,
            bodyType: BODY_DYNAMIC,
            mass: 20,           // High mass - can push furniture (mass 5) easily
            restitution: 0,     // No bounce
            friction: 0.3,      // Some friction for control
            damping: 0.1,       // Low damping for responsive movement
            lockRotation: true  // Player rotation controlled by mouse, not physics
        })
        .with(Player)
        .with(TeamComponent)
        .register();

    // Camera entity - client-only, excluded from snapshots
    game.defineEntity('camera')
        .with(Camera2D, { smoothing: 0.5 })
        .syncNone()
        .register();
}
