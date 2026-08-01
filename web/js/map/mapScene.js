// The campaign map. Parcels sit on a hand-placed layout; owned ones connect to
// their neighbours, available ones pulse, locked ones stay dark.

import { Scene } from '../core/scene.js';
import { Button, Card } from '../ui/widgets.js';
import { COLORS, text, panel, fillRound, strokeRound, wrapText, bar } from '../ui/theme.js';
import { drawMechSilhouette } from '../render/sprites.js';
import { toast } from '../ui/toast.js';
import { state } from '../core/state.js';
import { UNITS } from '../data/units.js';
import { CROPS } from '../data/crops.js';
import { researchEffects } from '../data/tech.js';
import {
  TERRITORIES, TERRITORY_IDS, BIOMES, isAvailable, isOwned, ownedCount,
} from '../data/territories.js';
import { STYLES } from '../battle/ai.js';
import { startAssault } from '../battle/assault.js';

const NODE_R = 22;

export class MapScene extends Scene {
  constructor(game) {
    super(game);
    this.name = 'MapScene';
    this.card = new Card();
    this.selected = null;
    this.time = 0;
    this.buttons = {
      back:    new Button({ label: 'Back to farm', kind: 'ghost', onTap: () => this.game.scenes.pop() }),
      endless: new Button({ label: 'Endless Defence', kind: 'gold', onTap: () => this._startEndless() }),
    };
  }

  async enter() {
    // Resume an assault that was interrupted mid-ladder. The endless parcel is
    // synthetic and has to be re-registered after a reload before its ladder
    // can look itself up.
    const assault = state.world.currentAssault;
    if (!assault) return;
    if (assault.endless) {
      const { ensureEndlessTerritory } = await import('./endless.js');
      ensureEndlessTerritory();
    }
    await this._openDeploy();
  }

  _layout(view) {
    const top = view.safeTop + 64;
    const bottom = view.h - view.safeBottom - 62;
    this.mapRect = { x: 12, y: top, w: view.w - 24, h: bottom - top };

    const pad = 10;
    const y = view.h - view.safeBottom - 54;
    if (state.world.endless.unlocked) {
      const halfW = (view.w - pad * 3) / 2;
      this.buttons.back.setRect(pad, y, halfW, 48);
      this.buttons.endless.setRect(pad * 2 + halfW, y, halfW, 48);
    } else {
      this.buttons.back.setRect(pad, y, view.w - pad * 2, 48);
    }
  }

  _nodePos(territory) {
    const r = this.mapRect;
    return {
      x: r.x + territory.pos.x * r.w,
      y: r.y + territory.pos.y * r.h,
    };
  }

  handleInput(input) {
    const view = this.game.view;
    this._layout(view);
    if (this.card.visible) return this.card.handleInput(input, view);

    const tap = input.tap;
    if (!tap) return false;
    if (this.buttons.back.tryTap(tap)) return true;
    if (state.world.endless.unlocked && this.buttons.endless.tryTap(tap)) return true;

    for (const id of TERRITORY_IDS) {
      const territory = TERRITORIES[id];
      const p = this._nodePos(territory);
      if (Math.hypot(tap.x - p.x, tap.y - p.y) <= NODE_R + 10) {
        this._openParcel(territory);
        return true;
      }
    }
    return false;
  }

  _openParcel(territory) {
    const world = state.world;
    const owned = isOwned(territory.id, world);
    const available = isAvailable(territory.id, world);

    if (owned) {
      this.card.show({
        title: territory.name,
        body: `${BIOMES[territory.biome].name} — yours.\n${territory.desc}`,
        buttons: [{ label: 'Close', kind: 'ghost', onTap: () => this.card.hide() }],
      });
      return;
    }

    if (!available) {
      const missing = territory.requires
        .filter((r) => !isOwned(r, world))
        .map((r) => TERRITORIES[r]?.name ?? r);
      this.card.show({
        title: `${territory.name} — locked`,
        body: `Take ${missing.join(' and ')} first.`,
        buttons: [{ label: 'Close', kind: 'ghost', onTap: () => this.card.hide() }],
      });
      return;
    }

    const research = researchEffects(state.army.research);
    const style = STYLES[territory.enemyStyle] ?? STYLES.mixed;
    const reward = territory.reward ?? {};
    const rewardLines = [];
    if (reward.rows) rewardLines.push(`${reward.rows} row(s) of farmland`);
    if (reward.gold) rewardLines.push(`${reward.gold}g`);
    for (const c of reward.crops ?? []) rewardLines.push(`${CROPS[c]?.name ?? c} seeds`);
    for (const u of reward.units ?? []) rewardLines.push(UNITS[u]?.name ?? u);

    const intel = research.scouting
      ? `\nDefenders: ${style.name} — ${style.desc}`
      : '\nDefenders: unknown. (Research Scout Balloons to see this.)';

    const body = [
      territory.desc,
      `${territory.rounds} rounds to take it.${intel}`,
      `Reward: ${rewardLines.join(', ')}`,
      `\nCosts the rest of the day.`,
    ].join('\n');

    this.card.show({
      title: territory.name,
      body,
      buttons: [
        { label: 'Not today', kind: 'ghost', onTap: () => this.card.hide() },
        { label: 'March', kind: 'primary', onTap: () => this._march(territory) },
      ],
    });
  }

  async _march(territory) {
    this.card.hide();
    const res = startAssault(territory.id);
    if (!res.ok) { toast(res.reason, 'bad'); return; }
    await this._openDeploy();
  }

  async _openDeploy() {
    const { DeployScene } = await import('../battle/deployScene.js');
    this.game.scenes.push(new DeployScene(this.game));
  }

  async _startEndless() {
    const { startEndlessWave } = await import('./endless.js');
    const res = startEndlessWave();
    if (!res.ok) { toast(res.reason, 'bad'); return; }
    await this._openDeploy();
  }

  update(dt) {
    this.time += dt;
    for (const b of Object.values(this.buttons)) b.update(dt);
  }

  render(ctx, view) {
    this._layout(view);
    const world = state.world;

    const grad = ctx.createLinearGradient(0, 0, 0, view.h);
    grad.addColorStop(0, '#1a2430');
    grad.addColorStop(1, '#12180f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, view.w, view.h);

    this._renderBiomeWashes(ctx);
    this._renderLinks(ctx, world);
    this._renderNodes(ctx, world);
    this._renderHeader(ctx, view, world);

    this.buttons.back.render(ctx);
    if (world.endless.unlocked) this.buttons.endless.render(ctx);
    this.card.render(ctx, view);
  }

  _renderBiomeWashes(ctx) {
    // A soft tint behind each biome's cluster, so the map reads as four regions.
    const clusters = {};
    for (const id of TERRITORY_IDS) {
      const t = TERRITORIES[id];
      (clusters[t.biome] ??= []).push(this._nodePos(t));
    }
    for (const [biome, points] of Object.entries(clusters)) {
      const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
      const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
      const radius = Math.max(...points.map((p) => Math.hypot(p.x - cx, p.y - cy))) + 60;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      const unlocked = state.world.biomesUnlocked.includes(biome);
      g.addColorStop(0, `${BIOMES[biome].color}${unlocked ? '2a' : '10'}`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _renderLinks(ctx, world) {
    ctx.lineWidth = 2;
    for (const id of TERRITORY_IDS) {
      const territory = TERRITORIES[id];
      const to = this._nodePos(territory);
      for (const reqId of territory.requires) {
        const from = this._nodePos(TERRITORIES[reqId]);
        const open = isOwned(reqId, world);
        ctx.strokeStyle = open ? 'rgba(216,180,90,.5)' : 'rgba(232,226,207,.12)';
        ctx.setLineDash(open ? [] : [4, 6]);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  }

  _renderNodes(ctx, world) {
    for (const id of TERRITORY_IDS) {
      const territory = TERRITORIES[id];
      const p = this._nodePos(territory);
      const owned = isOwned(id, world);
      const available = isAvailable(id, world);
      const biome = BIOMES[territory.biome];

      if (available) {
        // Pulse to draw the eye to what you can actually do next.
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 2.4);
        ctx.globalAlpha = 0.25 + pulse * 0.3;
        ctx.fillStyle = biome.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, NODE_R + 8 + pulse * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = owned ? biome.color : available ? '#2c3a24' : '#1a2016';
      ctx.beginPath();
      ctx.arc(p.x, p.y, NODE_R, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = owned ? COLORS.gold : available ? biome.color : 'rgba(232,226,207,.18)';
      ctx.lineWidth = territory.final ? 3 : 2;
      ctx.stroke();

      if (owned) {
        text(ctx, '✓', p.x, p.y, { size: 18, color: '#12180f', align: 'center', weight: 800 });
      } else if (available) {
        drawMechSilhouette(ctx, 'harvester', p.x, p.y + 12, 20, biome.color);
      } else {
        text(ctx, '🔒', p.x, p.y, { size: 14, color: COLORS.inkFaint, align: 'center' });
      }

      const labelColor = owned ? COLORS.gold : available ? COLORS.ink : COLORS.inkFaint;
      text(ctx, territory.name, p.x, p.y + NODE_R + 14, {
        size: 10, color: labelColor, align: 'center', weight: 600, maxWidth: 110,
      });
    }
  }

  _renderHeader(ctx, view, world) {
    const top = view.safeTop;
    ctx.fillStyle = 'rgba(18,24,15,.92)';
    ctx.fillRect(0, 0, view.w, top + 64);
    ctx.fillStyle = COLORS.panelEdge;
    ctx.fillRect(0, top + 63, view.w, 1);

    text(ctx, 'THE HOLDINGS', 14, top + 20, { size: 15, color: COLORS.gold });
    const owned = ownedCount(world);
    text(ctx, `${owned}/${TERRITORY_IDS.length} parcels`, 14, top + 42, {
      size: 12, color: COLORS.inkDim, weight: 500,
    });

    const biomeNames = world.biomesUnlocked.map((b) => BIOMES[b]?.name ?? b).join(' · ');
    text(ctx, biomeNames, view.w - 14, top + 20, {
      size: 11, color: COLORS.inkDim, align: 'right', weight: 500, maxWidth: view.w * 0.5,
    });
    text(ctx, `${state.meta.gold.toLocaleString()}g`, view.w - 14, top + 42, {
      size: 14, color: COLORS.gold, align: 'right',
    });
  }

  back() {
    if (this.card.visible) { this.card.hide(); return true; }
    return false;
  }
}
