/**
 * Brains Game Types
 *
 * TypeScript interfaces for type safety across modules.
 */

/**
 * Game configuration loaded from brains.json
 */
export interface GameConfig {
    metadata: {
        name: string;
        version: string;
        description: string;
        author: string;
        tileSize: number;
    };
    settings: {
        physics: {
            timestep: number;
            gravity: number;
            inputDelay: number;
            maxRollbackFrames: number;
        };
        gameplay: {
            maxPlayers: number;
            roundDuration: number;
            sickInfectionDelay: number;
            outbreakDelay: number;
        };
    };
    entityTypes: {
        player: {
            human: PlayerTypeConfig;
            zombie: PlayerTypeConfig;
            sick: PlayerTypeConfig;
        };
        furniture: Record<string, FurnitureTypeConfig>;
    };
    regions: {
        spawn: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
    };
    map: {
        width: number;
        height: number;
        layers: MapLayer[];
        tilesets?: TilesetConfig[];
    };
    initialEntities: InitialEntity[];
}

export interface PlayerTypeConfig {
    name: string;
    sprite: string;
    color: string;
    width: number;
    height: number;
    speed: number;
    mass: number;
    bodyType: string;
    collisionGroup: string;
}

export interface FurnitureTypeConfig {
    name: string;
    sprite: string;
    width: number;
    height: number;
    bodyType: string;
    collisionGroup: string;
}

export interface MapLayer {
    name: string;
    data: number[];
}

export interface TilesetConfig {
    localImage: string;
    columns: number;
}

export interface InitialEntity {
    type: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    angle?: number;
}

/**
 * Sprite cache entry
 */
export interface SpriteCache {
    sprites: Map<string, HTMLImageElement>;
    tilesheetImg: HTMLImageElement | null;
    tileCols: number;
}
