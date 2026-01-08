/**
 * Brains Game Systems
 *
 * All game systems with proper deterministic ordering using string ID comparison.
 * Systems are split into focused units for maintainability.
 */

import {
    Game,
    Entity,
    Transform2D,
    Body2D,
    Player,
    Sprite,
    Physics2DSystem,
    toFixed,
    toFloat,
    fpMul,
} from 'modu-engine';

import {
    TEAM_HUMAN,
    TEAM_ZOMBIE,
    TEAM_SICK,
    PHASE_WAITING,
    PHASE_PREOUTBREAK,
    PHASE_POSTOUTBREAK,
    PHASE_ENDED,
    TIME_PREOUTBREAK,
    TIME_SICK,
    OUTBREAK_RATIO,
} from './constants';

import { TeamComponent, GamePhaseComponent, FurnitureData } from './entities';
import type { GameConfig } from './types';

// ============================================
// Helper Functions - Deterministic Sorting
// ============================================

/**
 * Get string form of a numeric client ID
 */
export function getClientIdStr(game: Game, numericId: number): string {
    return game.getClientIdString(numericId) || '';
}

/**
 * Compare strings for deterministic sorting
 * CRITICAL: This ensures identical ordering on all clients
 */
function compareStrings(a: string, b: string): number {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
}

/**
 * Get players sorted deterministically by client ID STRING (not numeric)
 * This is CRITICAL for preventing divergence across clients
 */
export function getSortedPlayers(game: Game): Entity[] {
    const players = [...game.query('player')].filter(p => !p.destroyed);

    // Sort by entity ID first for stable iteration, then by client string
    players.sort((a, b) => {
        const aStr = getClientIdStr(game, a.get(Player).clientId);
        const bStr = getClientIdStr(game, b.get(Player).clientId);
        return compareStrings(aStr, bStr);
    });

    return players;
}

/**
 * Get the game state entity (creates if needed on room creation)
 */
export function getGameStateEntity(game: Game): Entity | null {
    const stateEntities = [...game.query('game-state')];
    return stateEntities.length > 0 ? stateEntities[0] : null;
}

// ============================================
// Movement System
// ============================================

export function createMovementSystem(
    game: Game,
    config: GameConfig
): () => void {
    const HUMAN_SPEED = config.entityTypes.player.human.speed;
    const ZOMBIE_SPEED = config.entityTypes.player.zombie.speed;
    const SICK_SPEED = config.entityTypes.player.sick.speed;

    // Fixed-point constant for diagonal normalization
    const INV_SQRT2 = 46341; // 0.7071 * 65536

    return () => {
        const sortedPlayers = getSortedPlayers(game);

        for (const player of sortedPlayers) {
            const playerComp = player.get(Player);
            const teamComp = player.get(TeamComponent);
            const inputData = game.world.getInput(playerComp.clientId);

            if (!inputData) continue;

            // Movement with WASD
            if (inputData.move && (inputData.move.x !== 0 || inputData.move.y !== 0)) {
                const mx = inputData.move.x > 0 ? 1 : inputData.move.x < 0 ? -1 : 0;
                const my = inputData.move.y > 0 ? 1 : inputData.move.y < 0 ? -1 : 0;

                // Score-based speed multiplier
                const scoreMultiplier = 1 + teamComp.score / 30000;
                let speed: number;

                if (teamComp.team === TEAM_HUMAN) {
                    speed = HUMAN_SPEED * scoreMultiplier;
                } else if (teamComp.team === TEAM_ZOMBIE) {
                    speed = ZOMBIE_SPEED * scoreMultiplier;
                } else {
                    speed = SICK_SPEED * scoreMultiplier;
                }

                let vx = mx * speed * 60;
                let vy = my * speed * 60;

                // Normalize diagonal movement using fixed-point math
                if (mx !== 0 && my !== 0) {
                    vx = toFloat(fpMul(toFixed(vx), INV_SQRT2));
                    vy = toFloat(fpMul(toFixed(vy), INV_SQRT2));
                }

                player.setVelocity(vx, vy);
            } else {
                player.setVelocity(0, 0);
            }
        }
    };
}

// ============================================
// Aiming System
// ============================================

export function createAimingSystem(game: Game, canvasWidth: number, canvasHeight: number): () => void {
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;

    return () => {
        const sortedPlayers = getSortedPlayers(game);

        for (const player of sortedPlayers) {
            const playerComp = player.get(Player);
            const teamComp = player.get(TeamComponent);
            const inputData = game.world.getInput(playerComp.clientId);

            if (!inputData?.aim) continue;

            // Input provides raw mouse position on canvas
            const aim = inputData.aim;
            let mouseX = centerX;
            let mouseY = centerY;

            if (Array.isArray(aim)) {
                mouseX = aim[0] || centerX;
                mouseY = aim[1] || centerY;
            } else if (typeof aim === 'object') {
                mouseX = aim.x || centerX;
                mouseY = aim.y || centerY;
            }

            // Calculate direction from screen center to mouse position
            const dx = mouseX - centerX;
            const dy = mouseY - centerY;

            // Convert to angle (add PI/2 so "up" in screen space points forward)
            teamComp.aimAngle = Math.atan2(dy, dx) + Math.PI / 2;
        }
    };
}

// ============================================
// Game Phase Management System
// ============================================

export function createGamePhaseSystem(
    game: Game,
    updateUI: () => void
): () => void {
    return () => {
        const stateEntity = getGameStateEntity(game);
        if (!stateEntity) return;

        const state = stateEntity.get(GamePhaseComponent);
        state.gameTick++;

        const players = getSortedPlayers(game);

        // Auto-start round when 2+ players join
        if (state.phase === PHASE_WAITING && players.length >= 2) {
            startRound(game, stateEntity);
        }

        // Phase transitions
        const ticksInPhase = state.gameTick - state.phaseStartTick;

        if (state.phase === PHASE_PREOUTBREAK) {
            // Make players sick 45 seconds in (15 seconds before outbreak)
            if (state.sickInfectionTick === 0 && ticksInPhase >= (TIME_PREOUTBREAK - TIME_SICK)) {
                makeSomePlayersSick(game, stateEntity);
            }

            // Start outbreak at 60 seconds
            if (ticksInPhase >= TIME_PREOUTBREAK) {
                startOutbreak(game, stateEntity);
            }
        }

        if (state.phase === PHASE_POSTOUTBREAK) {
            // Check win conditions
            const humans = players.filter(p => p.get(TeamComponent).team === TEAM_HUMAN).length;
            const zombies = players.filter(p => p.get(TeamComponent).team === TEAM_ZOMBIE).length;

            if (humans === 0 && zombies > 0) {
                endRound(game, stateEntity, 'zombies');
            } else if (zombies === 0 && humans > 0) {
                endRound(game, stateEntity, 'humans');
            }
        }

        updateUI();
    };
}

// ============================================
// Infection System
// ============================================

export function createInfectionSystem(
    game: Game,
    infectionDist: number
): () => void {
    return () => {
        const stateEntity = getGameStateEntity(game);
        if (!stateEntity) return;

        const state = stateEntity.get(GamePhaseComponent);
        if (state.phase !== PHASE_POSTOUTBREAK) return;

        const players = getSortedPlayers(game);

        // Process zombies in deterministic order
        for (const zombie of players) {
            const zombieTeam = zombie.get(TeamComponent);
            if (zombieTeam.team !== TEAM_ZOMBIE) continue;

            const zombieTransform = zombie.get(Transform2D);

            // Check against all humans in deterministic order
            for (const human of players) {
                const humanTeam = human.get(TeamComponent);
                if (humanTeam.team !== TEAM_HUMAN) continue;

                const humanTransform = human.get(Transform2D);
                const dx = zombieTransform.x - humanTransform.x;
                const dy = zombieTransform.y - humanTransform.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < infectionDist) {
                    humanTeam.team = TEAM_ZOMBIE;
                    zombieTeam.score++;
                }
            }
        }
    };
}

// ============================================
// Helper Functions for Game Phase
// ============================================

function startRound(game: Game, stateEntity: Entity): void {
    const state = stateEntity.get(GamePhaseComponent);

    state.phase = PHASE_PREOUTBREAK;
    state.phaseStartTick = state.gameTick;
    state.sickInfectionTick = 0;
    state.outbreakTick = 0;

    // Reset ALL players to human (in deterministic order)
    const players = getSortedPlayers(game);
    for (const player of players) {
        const teamComp = player.get(TeamComponent);
        teamComp.team = TEAM_HUMAN;
        teamComp.score = 0;
    }
}

function makeSomePlayersSick(game: Game, stateEntity: Entity): void {
    const state = stateEntity.get(GamePhaseComponent);
    const players = getSortedPlayers(game);

    // Filter humans only (already sorted deterministically)
    const humans = players.filter(p => p.get(TeamComponent).team === TEAM_HUMAN);
    const numToInfect = Math.max(1, Math.floor(humans.length * OUTBREAK_RATIO));

    // Deterministic shuffle using tick number
    const shuffled = [...humans];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = (state.gameTick + i) % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    for (let i = 0; i < numToInfect && i < shuffled.length; i++) {
        shuffled[i].get(TeamComponent).team = TEAM_SICK;
    }

    state.sickInfectionTick = state.gameTick;
}

function startOutbreak(game: Game, stateEntity: Entity): void {
    const state = stateEntity.get(GamePhaseComponent);

    state.phase = PHASE_POSTOUTBREAK;
    state.outbreakTick = state.gameTick;

    // Convert all sick players to zombies (in deterministic order)
    const players = getSortedPlayers(game);
    for (const player of players) {
        const teamComp = player.get(TeamComponent);
        if (teamComp.team === TEAM_SICK) {
            teamComp.team = TEAM_ZOMBIE;
        }
    }
}

function endRound(game: Game, stateEntity: Entity, winner: string): void {
    const state = stateEntity.get(GamePhaseComponent);
    state.phase = PHASE_ENDED;
    state.phaseStartTick = state.gameTick;  // CRITICAL: Set this so the 5-second timer works
}

// ============================================
// Collision Handlers
// ============================================

export function setupCollisions(
    game: Game,
    physics: Physics2DSystem,
    tileSize: number
): void {
    // Player-furniture collision: Apply push force for responsiveness
    physics.onCollision('player', 'furniture', (player, furniture) => {
        const playerTransform = player.get(Transform2D);
        const furnitureTransform = furniture.get(Transform2D);
        const furnitureBody = furniture.get(Body2D);
        const playerBody = player.get(Body2D);
        const furnitureData = furniture.get(FurnitureData);

        if (!playerTransform || !furnitureTransform || !furnitureBody || !playerBody) return;

        // Skip if player is not moving
        const playerSpeed = Math.sqrt(playerBody.vx * playerBody.vx + playerBody.vy * playerBody.vy);
        if (playerSpeed < 10) return;

        // Get furniture dimensions
        const furnitureWidth = furnitureData ? furnitureData.w : tileSize;
        const furnitureHeight = furnitureData ? furnitureData.h : tileSize;

        // Calculate collision point on furniture's edge
        const relX = playerTransform.x - furnitureTransform.x;
        const relY = playerTransform.y - furnitureTransform.y;

        // Clamp to furniture boundaries
        const halfWidth = furnitureWidth / 2;
        const halfHeight = furnitureHeight / 2;
        const collisionX = Math.max(-halfWidth, Math.min(halfWidth, relX));
        const collisionY = Math.max(-halfHeight, Math.min(halfHeight, relY));

        // Calculate push direction
        const dx = furnitureTransform.x - playerTransform.x;
        const dy = furnitureTransform.y - playerTransform.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0.01) {
            const pushStrength = Math.min(playerSpeed * 0.4, 120);
            const pushX = (dx / dist) * pushStrength;
            const pushY = (dy / dist) * pushStrength;

            // Apply linear impulse
            furnitureBody.impulseX += pushX;
            furnitureBody.impulseY += pushY;

            // Calculate and apply torque
            const torque = (collisionX * pushY - collisionY * pushX) * 0.00001;
            const massEffect = 3 / (furnitureBody.mass || 5);
            const adjustedTorque = torque * massEffect;

            const maxAngularVelocity = 0.5;
            const currentAngVel = furnitureBody.angularVelocity || 0;
            const newAngularVelocity = currentAngVel + adjustedTorque;
            furnitureBody.angularVelocity = Math.max(-maxAngularVelocity,
                Math.min(maxAngularVelocity, newAngularVelocity));
        }
    });
}

// ============================================
// Setup All Systems
// ============================================

export function setupSystems(
    game: Game,
    config: GameConfig,
    tileSize: number,
    canvasWidth: number,
    canvasHeight: number,
    updateUI: () => void
): void {
    const infectionDist = 1.2 * tileSize;

    // Add systems in proper order
    game.addSystem(createMovementSystem(game, config), { phase: 'update' });
    game.addSystem(createAimingSystem(game, canvasWidth, canvasHeight), { phase: 'update' });
    game.addSystem(createGamePhaseSystem(game, updateUI), { phase: 'update' });
    game.addSystem(createInfectionSystem(game, infectionDist), { phase: 'update' });
}
