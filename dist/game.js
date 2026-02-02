"use strict";
var BrainsGame = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // cdn-global:modu-engine
  var require_modu_engine = __commonJS({
    "cdn-global:modu-engine"(exports, module) {
      module.exports = window.Modu;
    }
  });

  // src/game.ts
  var game_exports = {};
  __export(game_exports, {
    initGame: () => initGame
  });
  var import_modu_engine4 = __toESM(require_modu_engine());

  // src/constants.ts
  var TEAM_HUMAN = 0;
  var TEAM_ZOMBIE = 1;
  var TEAM_SICK = 2;
  var PHASE_WAITING = 0;
  var PHASE_PREOUTBREAK = 1;
  var PHASE_POSTOUTBREAK = 2;
  var PHASE_ENDED = 3;
  var TICK_RATE = 20;
  var TIME_PREOUTBREAK = 60 * TICK_RATE;
  var TIME_SICK = 15 * TICK_RATE;
  var OUTBREAK_RATIO = 0.3;

  // src/entities.ts
  var import_modu_engine = __toESM(require_modu_engine());
  var TeamComponent = (0, import_modu_engine.defineComponent)("Team", {
    team: TEAM_HUMAN,
    // 0=human, 1=zombie, 2=sick
    score: 0
    // Note: aimAngle removed from sync - computed at render time to avoid floating-point desync
  });
  var GamePhaseComponent = (0, import_modu_engine.defineComponent)("GamePhase", {
    phase: PHASE_WAITING,
    // 0=waiting, 1=preoutbreak, 2=postoutbreak, 3=ended
    gameTick: 0,
    phaseStartTick: 0,
    sickInfectionTick: 0,
    outbreakTick: 0
  });
  var TileData = (0, import_modu_engine.defineComponent)("TileData", {
    tileId: 0
  });
  var FurnitureData = (0, import_modu_engine.defineComponent)("FurnitureData", {
    spriteUrlId: 0,
    // Interned string ID
    w: 64,
    // Pixel width (integer to avoid f32 desync)
    h: 64,
    // Pixel height (integer to avoid f32 desync)
    configIndex: 0
    // Index in config.initialEntities for position reset
  });
  function defineEntities(game2, tileSize2, playerRadius2) {
    game2.defineEntity("game-state").with(GamePhaseComponent).register();
    game2.defineEntity("wall").with(import_modu_engine.Transform2D).with(import_modu_engine.Body2D, { shapeType: import_modu_engine.SHAPE_RECT, width: tileSize2, height: tileSize2, bodyType: import_modu_engine.BODY_STATIC }).register();
    game2.defineEntity("furniture").with(import_modu_engine.Transform2D).with(import_modu_engine.Sprite, { shape: import_modu_engine.SHAPE_RECT, layer: 2, visible: false }).with(import_modu_engine.Body2D, {
      shapeType: import_modu_engine.SHAPE_RECT,
      bodyType: import_modu_engine.BODY_DYNAMIC,
      mass: 5,
      restitution: 0.01,
      // Nearly zero bounce to reduce wall jitter
      friction: 0.1,
      // Low friction
      damping: 0.8,
      // High damping to settle quickly
      width: tileSize2,
      height: tileSize2
    }).with(FurnitureData).register();
    const playerSize = 40;
    game2.defineEntity("player").with(import_modu_engine.Transform2D).with(import_modu_engine.Sprite, { shape: import_modu_engine.SHAPE_RECT, width: playerSize, height: playerSize, layer: 3 }).with(import_modu_engine.Body2D, {
      shapeType: import_modu_engine.SHAPE_RECT,
      width: playerSize,
      height: playerSize,
      bodyType: import_modu_engine.BODY_DYNAMIC,
      mass: 20,
      // High mass - can push furniture (mass 5) easily
      restitution: 0,
      // No bounce
      friction: 0.3,
      // Some friction for control
      damping: 0.1,
      // Low damping for responsive movement
      lockRotation: true
      // Player rotation controlled by mouse, not physics
    }).with(import_modu_engine.Player).with(TeamComponent).register();
    game2.defineEntity("camera").with(import_modu_engine.Camera2D, { smoothing: 0.5, zoom: 0.77, targetZoom: 0.77 }).syncNone().register();
  }

  // src/systems.ts
  var import_modu_engine2 = __toESM(require_modu_engine());
  function getClientIdStr(game2, numericId) {
    return game2.getClientIdString(numericId) || "";
  }
  function compareStrings(a, b) {
    if (a < b)
      return -1;
    if (a > b)
      return 1;
    return 0;
  }
  function getSortedPlayers(game2) {
    const players = [...game2.query("player")].filter((p) => !p.destroyed);
    players.sort((a, b) => {
      const aStr = getClientIdStr(game2, a.get(import_modu_engine2.Player).clientId);
      const bStr = getClientIdStr(game2, b.get(import_modu_engine2.Player).clientId);
      return compareStrings(aStr, bStr);
    });
    return players;
  }
  function getGameStateEntity(game2) {
    const stateEntities = [...game2.query("game-state")];
    return stateEntities.length > 0 ? stateEntities[0] : null;
  }
  function createMovementSystem(game2, config2) {
    const HUMAN_SPEED = config2.entityTypes.player.human.speed;
    const ZOMBIE_SPEED = config2.entityTypes.player.zombie.speed;
    const SICK_SPEED = config2.entityTypes.player.sick.speed;
    const INV_SQRT2 = 46341;
    return () => {
      const sortedPlayers = getSortedPlayers(game2);
      for (const player of sortedPlayers) {
        const playerComp = player.get(import_modu_engine2.Player);
        const teamComp = player.get(TeamComponent);
        const inputData = game2.world.getInput(playerComp.clientId);
        if (!inputData)
          continue;
        if (inputData.move && (inputData.move.x !== 0 || inputData.move.y !== 0)) {
          const mx = inputData.move.x > 0 ? 1 : inputData.move.x < 0 ? -1 : 0;
          const my = inputData.move.y > 0 ? 1 : inputData.move.y < 0 ? -1 : 0;
          const scoreMultiplier = 1 + teamComp.score / 3e4;
          let speed;
          if (teamComp.team === TEAM_HUMAN) {
            speed = HUMAN_SPEED * scoreMultiplier;
          } else if (teamComp.team === TEAM_ZOMBIE) {
            speed = ZOMBIE_SPEED * scoreMultiplier;
          } else {
            speed = SICK_SPEED * scoreMultiplier;
          }
          let vx = mx * speed * 60;
          let vy = my * speed * 60;
          if (mx !== 0 && my !== 0) {
            vx = (0, import_modu_engine2.toFloat)((0, import_modu_engine2.fpMul)((0, import_modu_engine2.toFixed)(vx), INV_SQRT2));
            vy = (0, import_modu_engine2.toFloat)((0, import_modu_engine2.fpMul)((0, import_modu_engine2.toFixed)(vy), INV_SQRT2));
          }
          player.setVelocity(vx, vy);
        } else {
          player.setVelocity(0, 0);
        }
      }
    };
  }
  var aimAngleCache = /* @__PURE__ */ new Map();
  function createAimingSystem(game2, canvasWidth, canvasHeight) {
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    return () => {
      const sortedPlayers = getSortedPlayers(game2);
      for (const player of sortedPlayers) {
        const playerComp = player.get(import_modu_engine2.Player);
        const inputData = game2.world.getInput(playerComp.clientId);
        if (!inputData?.aim)
          continue;
        const aim = inputData.aim;
        let mouseX2 = centerX;
        let mouseY2 = centerY;
        if (Array.isArray(aim)) {
          mouseX2 = aim[0] || centerX;
          mouseY2 = aim[1] || centerY;
        } else if (typeof aim === "object") {
          mouseX2 = aim.x || centerX;
          mouseY2 = aim.y || centerY;
        }
        const dx = mouseX2 - centerX;
        const dy = mouseY2 - centerY;
        const angle = Math.atan2(dy, dx) + Math.PI / 2;
        aimAngleCache.set(player.eid, angle);
        const transform = player.get(import_modu_engine2.Transform2D);
        transform.angle = angle;
      }
    };
  }
  function createGamePhaseSystem(game2, updateUI) {
    return () => {
      const stateEntity = getGameStateEntity(game2);
      if (!stateEntity)
        return;
      const state = stateEntity.get(GamePhaseComponent);
      state.gameTick++;
      const players = getSortedPlayers(game2);
      if (state.phase === PHASE_WAITING && players.length >= 2) {
        startRound(game2, stateEntity);
      }
      const ticksInPhase = state.gameTick - state.phaseStartTick;
      if (state.phase === PHASE_PREOUTBREAK) {
        if (state.sickInfectionTick === 0 && ticksInPhase >= TIME_PREOUTBREAK - TIME_SICK) {
          makeSomePlayersSick(game2, stateEntity);
        }
        if (ticksInPhase >= TIME_PREOUTBREAK) {
          startOutbreak(game2, stateEntity);
        }
      }
      if (state.phase === PHASE_POSTOUTBREAK) {
        const humans = players.filter((p) => p.get(TeamComponent).team === TEAM_HUMAN).length;
        const zombies = players.filter((p) => p.get(TeamComponent).team === TEAM_ZOMBIE).length;
        if (humans === 0 && zombies > 0) {
          endRound(game2, stateEntity, "zombies");
        } else if (zombies === 0 && humans > 0) {
          endRound(game2, stateEntity, "humans");
        }
      }
      updateUI();
    };
  }
  function createInfectionSystem(game2, infectionDist) {
    return () => {
      const stateEntity = getGameStateEntity(game2);
      if (!stateEntity)
        return;
      const state = stateEntity.get(GamePhaseComponent);
      if (state.phase !== PHASE_POSTOUTBREAK)
        return;
      const players = getSortedPlayers(game2);
      for (const zombie of players) {
        const zombieTeam = zombie.get(TeamComponent);
        if (zombieTeam.team !== TEAM_ZOMBIE)
          continue;
        const zombieTransform = zombie.get(import_modu_engine2.Transform2D);
        for (const human of players) {
          const humanTeam = human.get(TeamComponent);
          if (humanTeam.team !== TEAM_HUMAN)
            continue;
          const humanTransform = human.get(import_modu_engine2.Transform2D);
          const dx = zombieTransform.x - humanTransform.x;
          const dy = zombieTransform.y - humanTransform.y;
          const dist = (0, import_modu_engine2.dSqrt)(dx * dx + dy * dy);
          if (dist < infectionDist) {
            humanTeam.team = TEAM_ZOMBIE;
            zombieTeam.score++;
          }
        }
      }
    };
  }
  function startRound(game2, stateEntity) {
    const state = stateEntity.get(GamePhaseComponent);
    state.phase = PHASE_PREOUTBREAK;
    state.phaseStartTick = state.gameTick;
    state.sickInfectionTick = 0;
    state.outbreakTick = 0;
    const players = getSortedPlayers(game2);
    for (const player of players) {
      const teamComp = player.get(TeamComponent);
      teamComp.team = TEAM_HUMAN;
      teamComp.score = 0;
    }
  }
  function makeSomePlayersSick(game2, stateEntity) {
    const state = stateEntity.get(GamePhaseComponent);
    const players = getSortedPlayers(game2);
    const humans = players.filter((p) => p.get(TeamComponent).team === TEAM_HUMAN);
    const numToInfect = Math.max(1, Math.floor(humans.length * OUTBREAK_RATIO));
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
  function startOutbreak(game2, stateEntity) {
    const state = stateEntity.get(GamePhaseComponent);
    state.phase = PHASE_POSTOUTBREAK;
    state.outbreakTick = state.gameTick;
    const players = getSortedPlayers(game2);
    for (const player of players) {
      const teamComp = player.get(TeamComponent);
      if (teamComp.team === TEAM_SICK) {
        teamComp.team = TEAM_ZOMBIE;
      }
    }
  }
  function endRound(game2, stateEntity, winner) {
    const state = stateEntity.get(GamePhaseComponent);
    state.phase = PHASE_ENDED;
    state.phaseStartTick = state.gameTick;
  }
  function setupCollisions(game2, physics2, tileSize2) {
    physics2.onCollision("player", "furniture", (player, furniture) => {
      const playerTransform = player.get(import_modu_engine2.Transform2D);
      const furnitureTransform = furniture.get(import_modu_engine2.Transform2D);
      const furnitureBody = furniture.get(import_modu_engine2.Body2D);
      const playerBody = player.get(import_modu_engine2.Body2D);
      const furnitureData = furniture.get(FurnitureData);
      if (!playerTransform || !furnitureTransform || !furnitureBody || !playerBody)
        return;
      const playerSpeed = (0, import_modu_engine2.dSqrt)(playerBody.vx * playerBody.vx + playerBody.vy * playerBody.vy);
      if (playerSpeed < 10)
        return;
      const furnitureWidth = furnitureData ? furnitureData.w : tileSize2;
      const furnitureHeight = furnitureData ? furnitureData.h : tileSize2;
      const relX = playerTransform.x - furnitureTransform.x;
      const relY = playerTransform.y - furnitureTransform.y;
      const halfWidth = furnitureWidth / 2;
      const halfHeight = furnitureHeight / 2;
      const collisionX = Math.max(-halfWidth, Math.min(halfWidth, relX));
      const collisionY = Math.max(-halfHeight, Math.min(halfHeight, relY));
      const dx = furnitureTransform.x - playerTransform.x;
      const dy = furnitureTransform.y - playerTransform.y;
      const dist = (0, import_modu_engine2.dSqrt)(dx * dx + dy * dy);
      if (dist > 0.01) {
        const pushStrength = Math.min(playerSpeed * 0.4, 120);
        const pushX = dx / dist * pushStrength;
        const pushY = dy / dist * pushStrength;
        furnitureBody.impulseX += pushX;
        furnitureBody.impulseY += pushY;
      }
    });
  }
  function setupSystems(game2, config2, tileSize2, canvasWidth, canvasHeight, updateUI) {
    const infectionDist = 1.2 * tileSize2;
    game2.addSystem(createMovementSystem(game2, config2), { phase: "update" });
    game2.addSystem(createAimingSystem(game2, canvasWidth, canvasHeight), { phase: "update" });
    game2.addSystem(createGamePhaseSystem(game2, updateUI), { phase: "update" });
    game2.addSystem(createInfectionSystem(game2, infectionDist), { phase: "update" });
  }

  // src/render.ts
  var import_modu_engine3 = __toESM(require_modu_engine());
  function updateCamera(game2, cameraEntity2, getLocalClientId2, alpha) {
    const localId = getLocalClientId2();
    if (localId === null)
      return;
    const player = game2.world.getEntityByClientId(localId);
    if (!player || player.destroyed)
      return;
    const camera = cameraEntity2.get(import_modu_engine3.Camera2D);
    player.interpolate(alpha);
    const x = player.render?.interpX ?? player.get(import_modu_engine3.Transform2D).x;
    const y = player.render?.interpY ?? player.get(import_modu_engine3.Transform2D).y;
    camera.x += (x - camera.x) * camera.smoothing;
    camera.y += (y - camera.y) * camera.smoothing;
  }
  function createRenderer(game2, renderer2, getCameraEntity, canvas2, config2, tileSize2, playerRadius2, spriteCache2, getLocalClientId2) {
    const ctx = renderer2.context;
    const tileCols = spriteCache2.tileCols;
    function renderWithCamera() {
      const cameraEntity2 = getCameraEntity();
      const alpha = game2.getRenderAlpha();
      const camera = cameraEntity2.get(import_modu_engine3.Camera2D);
      updateCamera(game2, cameraEntity2, getLocalClientId2, alpha);
      const camX = camera.x;
      const camY = camera.y;
      ctx.fillStyle = "#0a0e14";
      ctx.fillRect(0, 0, canvas2.width, canvas2.height);
      ctx.save();
      ctx.translate(canvas2.width / 2 - camX, canvas2.height / 2 - camY);
      ctx.imageSmoothingEnabled = false;
      const floorLayer = config2.map.layers.find((l) => l.name === "floor" || l.name.includes("floor"));
      if (floorLayer && spriteCache2.tilesheetImg) {
        for (let i = 0; i < floorLayer.data.length; i++) {
          const tileId = floorLayer.data[i];
          if (tileId !== 0) {
            const tx = i % config2.map.width * tileSize2;
            const ty = Math.floor(i / config2.map.width) * tileSize2;
            const srcTileId = tileId - 1;
            const srcX = srcTileId % tileCols * tileSize2;
            const srcY = Math.floor(srcTileId / tileCols) * tileSize2;
            ctx.drawImage(spriteCache2.tilesheetImg, srcX, srcY, tileSize2, tileSize2, tx, ty, tileSize2, tileSize2);
          }
        }
      }
      const wallLayer = config2.map.layers.find((l) => l.name === "walls" || l.name === "collision");
      if (wallLayer && spriteCache2.tilesheetImg) {
        for (let i = 0; i < wallLayer.data.length; i++) {
          const tileId = wallLayer.data[i];
          if (tileId !== 0) {
            const tx = i % config2.map.width * tileSize2;
            const ty = Math.floor(i / config2.map.width) * tileSize2;
            const srcTileId = tileId - 1;
            const srcX = srcTileId % tileCols * tileSize2;
            const srcY = Math.floor(srcTileId / tileCols) * tileSize2;
            ctx.drawImage(spriteCache2.tilesheetImg, srcX, srcY, tileSize2, tileSize2, tx, ty, tileSize2, tileSize2);
          }
        }
      }
      const entities = Array.from(game2.getAllEntities()).filter(
        (e) => !e.destroyed && (e.type === "furniture" || e.type === "player")
      );
      entities.sort((a, b) => {
        const aLayer = a.has(import_modu_engine3.Sprite) ? a.get(import_modu_engine3.Sprite).layer : 0;
        const bLayer = b.has(import_modu_engine3.Sprite) ? b.get(import_modu_engine3.Sprite).layer : 0;
        return aLayer - bLayer;
      });
      for (const entity of entities) {
        if (entity.destroyed)
          continue;
        entity.interpolate(alpha);
        const pos = { x: entity.render.interpX, y: entity.render.interpY };
        const type = entity.type;
        if (type === "furniture" && entity.has(FurnitureData)) {
          renderFurniture(ctx, game2, entity, pos, spriteCache2);
          continue;
        }
        if (type === "player" && entity.has(TeamComponent)) {
          renderPlayer(ctx, game2, entity, pos, config2, playerRadius2, spriteCache2);
        }
      }
      ctx.restore();
    }
    return renderWithCamera;
  }
  function renderFurniture(ctx, game2, entity, pos, spriteCache2) {
    const furnitureData = entity.get(FurnitureData);
    const transform = entity.get(import_modu_engine3.Transform2D);
    const spriteUrl = game2.getString("spriteUrl", furnitureData.spriteUrlId);
    const sprite = spriteCache2.sprites.get(spriteUrl || "");
    const w = furnitureData.w;
    const h = furnitureData.h;
    const angle = transform ? transform.angle : 0;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    if (angle)
      ctx.rotate(angle);
    if (sprite) {
      ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
    } else {
      ctx.fillStyle = "#7f8c8d";
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }
    ctx.restore();
  }
  function renderPlayer(ctx, game2, entity, pos, config2, playerRadius2, spriteCache2) {
    const teamComp = entity.get(TeamComponent);
    const teamNum = teamComp.team;
    const transform = entity.get(import_modu_engine3.Transform2D);
    const teamName = teamNum === TEAM_ZOMBIE ? "zombie" : teamNum === TEAM_SICK ? "sick" : "human";
    const teamConfig = config2.entityTypes.player[teamName];
    const sprite = spriteCache2.sprites.get(teamConfig?.sprite || "");
    const color = teamConfig?.color || "#fff";
    const bodyAngle = transform ? transform.angle : 0;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(bodyAngle);
    const playerSize = 40;
    const halfSize = playerSize / 2;
    if (sprite) {
      ctx.drawImage(sprite, -halfSize, -halfSize, playerSize, playerSize);
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(-halfSize, -halfSize, playerSize, playerSize);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(-halfSize, -halfSize, playerSize, playerSize);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(halfSize * 0.5, 0);
      ctx.lineTo(halfSize * 0.8, -halfSize * 0.2);
      ctx.lineTo(halfSize * 0.8, halfSize * 0.2);
      ctx.fill();
    }
    ctx.restore();
  }
  function createUIUpdater(game2, phaseEl, scoreEl) {
    return () => {
      const stateEntity = getGameStateEntity(game2);
      if (!stateEntity)
        return;
      const state = stateEntity.get(GamePhaseComponent);
      const players = getSortedPlayers(game2);
      const humans = players.filter((p) => p.get(TeamComponent).team === TEAM_HUMAN).length;
      const zombies = players.filter((p) => p.get(TeamComponent).team === TEAM_ZOMBIE).length;
      const sick = players.filter((p) => p.get(TeamComponent).team === TEAM_SICK).length;
      const ticksInPhase = state.gameTick - state.phaseStartTick;
      if (state.phase === PHASE_WAITING) {
        phaseEl.textContent = "Waiting for players...";
      } else if (state.phase === PHASE_PREOUTBREAK) {
        const secondsLeft = Math.max(0, Math.ceil((TIME_PREOUTBREAK - ticksInPhase) / TICK_RATE));
        phaseEl.innerHTML = `Pre-outbreak: ${secondsLeft}s | <span class="team-humans">Humans: ${humans}</span> | Sick: ${sick}`;
      } else if (state.phase === PHASE_POSTOUTBREAK) {
        phaseEl.innerHTML = `<span class="team-humans">Humans: ${humans}</span> | <span class="team-zombies">Zombies: ${zombies}</span>`;
      } else {
        phaseEl.textContent = "Round ended!";
      }
    };
  }
  async function loadSprites(config2, spriteCache2) {
    const loadSprite = (url) => {
      if (spriteCache2.sprites.has(url)) {
        return Promise.resolve(spriteCache2.sprites.get(url));
      }
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          spriteCache2.sprites.set(url, img);
          resolve(img);
        };
        img.onerror = () => {
          console.warn("[Brains] Failed to load:", url);
          resolve(null);
        };
        img.src = url;
      });
    };
    const tilesheetInfo = config2.map.tilesets?.[0];
    if (tilesheetInfo) {
      const img = await loadSprite(tilesheetInfo.image);
      spriteCache2.tilesheetImg = img;
      spriteCache2.tileCols = tilesheetInfo.columns || 1;
    }
    await Promise.all([
      loadSprite(config2.entityTypes.player.human.sprite),
      loadSprite(config2.entityTypes.player.zombie.sprite),
      loadSprite(config2.entityTypes.player.sick.sprite)
    ]);
    const furniturePromises = Object.values(config2.entityTypes.furniture || {}).map((f) => {
      if (f.sprite)
        return loadSprite(f.sprite);
      return Promise.resolve(null);
    });
    await Promise.all(furniturePromises);
  }

  // src/game.ts
  var game;
  var renderer;
  var physics;
  var input;
  var cameraEntity;
  var canvas;
  var config;
  var tileSize;
  var mapWidth;
  var mapHeight;
  var playerRadius;
  var WIDTH;
  var HEIGHT;
  var mouseX;
  var mouseY;
  var spriteCache = {
    sprites: /* @__PURE__ */ new Map(),
    tilesheetImg: null,
    tileCols: 1
  };
  function getLocalClientId() {
    const clientId = game.localClientId;
    if (!clientId || typeof clientId !== "string")
      return null;
    return game.internClientId(clientId);
  }
  function ensureCameraEntity() {
    if (!cameraEntity || cameraEntity.destroyed || !cameraEntity.has(import_modu_engine4.Camera2D)) {
      cameraEntity = game.spawn("camera");
      const cam = cameraEntity.get(import_modu_engine4.Camera2D);
      cam.x = mapWidth / 2;
      cam.y = mapHeight / 2;
      cam.smoothing = 0.5;
      renderer.camera = cameraEntity;
    }
    return cameraEntity;
  }
  function createStaticMap() {
    if ([...game.query("wall")].length > 0)
      return;
    const wallLayer = config.map.layers.find((l) => l.name === "walls" || l.name === "collision");
    if (wallLayer) {
      for (let i = 0; i < wallLayer.data.length; i++) {
        if (wallLayer.data[i] !== 0) {
          const tx = i % config.map.width * tileSize + tileSize / 2;
          const ty = Math.floor(i / config.map.width) * tileSize + tileSize / 2;
          game.spawn("wall", { x: tx, y: ty, tileId: wallLayer.data[i] });
        }
      }
    }
  }
  function createMap() {
    createStaticMap();
    const stateEntity = game.spawn("game-state", {
      phase: PHASE_WAITING,
      gameTick: 0,
      phaseStartTick: 0,
      sickInfectionTick: 0,
      outbreakTick: 0
    });
    config.initialEntities.forEach((e, configIndex) => {
      const type = config.entityTypes.furniture[e.type];
      if (!type)
        return;
      const w = (e.width || type.width) * tileSize;
      const h = (e.height || type.height) * tileSize;
      const x = e.x * tileSize;
      const y = e.y * tileSize;
      const spriteUrlId = game.internString("spriteUrl", type.sprite);
      const angleDegrees = e.angle || 0;
      const angleRadians = angleDegrees * Math.PI / 180;
      const area = w * h / (tileSize * tileSize);
      let mass = 2 + area * 0.5;
      if (["sofa", "couch", "bigTable", "bed", "tank"].includes(e.type)) {
        mass *= 2;
      } else if (["tv", "smallTable"].includes(e.type)) {
        mass *= 1.5;
      }
      const furniture = game.spawn("furniture", {
        x,
        y,
        angle: angleRadians,
        width: w,
        height: h,
        mass,
        angularVelocity: 0
      });
      const body = furniture.get(import_modu_engine4.Body2D);
      if (body) {
        body.width = w;
        body.height = h;
        body.mass = mass;
        body.angularVelocity = 0;
      }
      const furnitureData = furniture.get(FurnitureData);
      if (furnitureData) {
        furnitureData.spriteUrlId = spriteUrlId;
        furnitureData.w = w;
        furnitureData.h = h;
        furnitureData.configIndex = configIndex;
      }
    });
  }
  function spawnPlayer(clientId) {
    const numericId = game.internClientId(clientId);
    const existing = game.world.getEntityByClientId(numericId);
    if (existing) {
      console.log(`[spawn] Player ${clientId.slice(0, 8)} already exists (eid=${existing.eid}), skipping spawn`);
      return;
    }
    const spawn = config.regions.spawn;
    const x = (spawn.x + spawn.width / 2) * tileSize;
    const y = (spawn.y + spawn.height / 2) * tileSize;
    console.log(`[spawn] Creating player ${clientId.slice(0, 8)} at (${x.toFixed(0)}, ${y.toFixed(0)})`);
    game.spawn("player", {
      x,
      y,
      clientId,
      team: TEAM_HUMAN,
      score: 0
    });
  }
  function despawnPlayer(clientId) {
    const numericId = game.internClientId(clientId);
    const entity = game.getEntityByClientId(numericId);
    if (entity && !entity.destroyed) {
      aimAngleCache.delete(entity.eid);
      entity.destroy();
    }
  }
  async function initGame() {
    const res = await fetch("brains.json");
    const data = await res.json();
    config = data.game;
    tileSize = config.metadata.tileSize;
    mapWidth = config.map.width * tileSize;
    mapHeight = config.map.height * tileSize;
    playerRadius = config.entityTypes.player.human.width * tileSize;
    canvas = document.getElementById("game");
    canvas.width = Math.min(mapWidth, window.innerWidth - 40);
    canvas.height = Math.min(mapHeight, window.innerHeight - 40);
    WIDTH = canvas.width;
    HEIGHT = canvas.height;
    window.addEventListener("resize", () => {
      canvas.width = Math.min(mapWidth, window.innerWidth - 40);
      canvas.height = Math.min(mapHeight, window.innerHeight - 40);
      WIDTH = canvas.width;
      HEIGHT = canvas.height;
    });
    mouseX = WIDTH / 2;
    mouseY = HEIGHT / 2;
    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    });
    game = (0, import_modu_engine4.createGame)();
    physics = game.addPlugin(import_modu_engine4.Physics2DSystem, { gravity: { x: 0, y: 0 } });
    renderer = game.addPlugin(import_modu_engine4.Simple2DRenderer, canvas);
    input = game.addPlugin(import_modu_engine4.InputPlugin, canvas);
    window.game = game;
    defineEntities(game, tileSize, playerRadius);
    await loadSprites(config, spriteCache);
    document.getElementById("loading").style.display = "none";
    document.getElementById("ui").style.display = "block";
    input.action("move", {
      type: "vector",
      bindings: [() => {
        let x = 0;
        let y = 0;
        if (input.isKeyDown("w") || input.isKeyDown("arrowup"))
          y -= 1;
        if (input.isKeyDown("s") || input.isKeyDown("arrowdown"))
          y += 1;
        if (input.isKeyDown("a") || input.isKeyDown("arrowleft"))
          x -= 1;
        if (input.isKeyDown("d") || input.isKeyDown("arrowright"))
          x += 1;
        return { x, y };
      }]
    });
    input.action("aim", {
      type: "vector",
      bindings: [() => ({ x: mouseX, y: mouseY })]
    });
    cameraEntity = game.spawn("camera");
    const cam = cameraEntity.get(import_modu_engine4.Camera2D);
    cam.x = mapWidth / 2;
    cam.y = mapHeight / 2;
    cam.smoothing = 0.15;
    renderer.camera = cameraEntity;
    const phaseEl = document.getElementById("phase");
    const scoreEl = document.getElementById("score");
    const updateUI = createUIUpdater(game, phaseEl, scoreEl);
    setupSystems(game, config, tileSize, WIDTH, HEIGHT, updateUI);
    setupCollisions(game, physics, tileSize);
    const renderFn = createRenderer(
      game,
      renderer,
      ensureCameraEntity,
      canvas,
      config,
      tileSize,
      playerRadius,
      spriteCache,
      getLocalClientId
    );
    renderer.render = renderFn;
    game.connect("brains", {
      onRoomCreate() {
        createMap();
      },
      onConnect(clientId) {
        spawnPlayer(clientId);
      },
      onDisconnect(clientId) {
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
      onSnapshot(entities) {
        const validEids = new Set(entities.filter((e) => e.type === "player" && !e.destroyed).map((e) => e.eid));
        for (const eid of aimAngleCache.keys()) {
          if (!validEids.has(eid)) {
            aimAngleCache.delete(eid);
          }
        }
        const localId = getLocalClientId();
        if (localId !== null) {
          for (const entity of entities) {
            if (entity.type === "player" && !entity.destroyed) {
              const playerComp = entity.get(import_modu_engine4.Player);
              if (playerComp.clientId === localId) {
                const transform = entity.get(import_modu_engine4.Transform2D);
                const camEntity = ensureCameraEntity();
                const cam2 = camEntity.get(import_modu_engine4.Camera2D);
                cam2.x = transform.x;
                cam2.y = transform.y;
                break;
              }
            }
          }
        }
      }
    });
    (0, import_modu_engine4.enableDebugUI)(game);
    game.addSystem(() => {
      const stateEntity = getGameStateEntity(game);
      if (!stateEntity)
        return;
      const state = stateEntity.get(GamePhaseComponent);
      if (state.phase === PHASE_ENDED) {
        const ticksSinceEnd = state.gameTick - state.phaseStartTick;
        if (ticksSinceEnd >= 100) {
          const players = getSortedPlayers(game);
          if (players.length >= 2) {
            state.phase = 1;
            state.phaseStartTick = state.gameTick;
            state.sickInfectionTick = 0;
            state.outbreakTick = 0;
            const spawn = config.regions.spawn;
            const spawnCenterX = (spawn.x + spawn.width / 2) * tileSize;
            const spawnCenterY = (spawn.y + spawn.height / 2) * tileSize;
            for (let i = 0; i < players.length; i++) {
              const player = players[i];
              const teamComp = player.get(TeamComponent);
              teamComp.team = TEAM_HUMAN;
              teamComp.score = 0;
              const transform = player.get(import_modu_engine4.Transform2D);
              const body = player.get(import_modu_engine4.Body2D);
              const col = i % 4;
              const row = Math.floor(i / 4);
              const offsetX = (col - 1.5) * playerRadius * 3;
              const offsetY = (row - 0.5) * playerRadius * 3;
              transform.x = spawnCenterX + offsetX;
              transform.y = spawnCenterY + offsetY;
              if (body) {
                body.vx = 0;
                body.vy = 0;
              }
            }
            const furniture = [...game.query("furniture")];
            for (const f of furniture) {
              f.destroy();
            }
            config.initialEntities.forEach((e, configIndex) => {
              const type = config.entityTypes.furniture[e.type];
              if (!type)
                return;
              const w = (e.width || type.width) * tileSize;
              const h = (e.height || type.height) * tileSize;
              const x = e.x * tileSize;
              const y = e.y * tileSize;
              const spriteUrlId = game.internString("spriteUrl", type.sprite);
              const angleDegrees = e.angle || 0;
              const angleRadians = angleDegrees * Math.PI / 180;
              const area = w * h / (tileSize * tileSize);
              let mass = 2 + area * 0.5;
              if (["sofa", "couch", "bigTable", "bed", "tank"].includes(e.type)) {
                mass *= 2;
              } else if (["tv", "smallTable"].includes(e.type)) {
                mass *= 1.5;
              }
              const newFurniture = game.spawn("furniture", {
                x,
                y,
                angle: angleRadians,
                width: w,
                height: h,
                mass,
                angularVelocity: 0
              });
              const body = newFurniture.get(import_modu_engine4.Body2D);
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
            state.phase = PHASE_WAITING;
          }
        }
      }
    }, { phase: "update" });
    game.addSystem(() => {
      const activeClientIds = new Set(
        game.getClients().map((cid) => game.internClientId(cid))
      );
      for (const player of game.query("player")) {
        if (player.destroyed)
          continue;
        const playerComp = player.get(import_modu_engine4.Player);
        if (!activeClientIds.has(playerComp.clientId)) {
          aimAngleCache.delete(player.eid);
          player.destroy();
        }
      }
    }, { phase: "update" });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGame);
  } else {
    initGame();
  }
  return __toCommonJS(game_exports);
})();
//# sourceMappingURL=game.js.map
