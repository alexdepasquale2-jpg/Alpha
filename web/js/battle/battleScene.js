// Watches a round resolve. No input affects the outcome — the only controls
// are playback speed and skip-to-result.

import { Scene } from '../core/scene.js';
import { Button } from '../ui/widgets.js';
import { COLORS, text, panel, fillRound, bar } from '../ui/theme.js';
import { drawMech } from '../render/sprites.js';
import { FxLayer } from '../render/fx.js';
import { state } from '../core/state.js';
import { UNITS } from '../data/units.js';
import { FieldView } from './fieldView.js';
import { step, run, result, SIM_HZ, MAX_TICKS } from './simulation.js';
import { buildRoundBattle, finishRound, assaultSummary } from './assault.js';

const SPEEDS = [1, 2, 4];

export class BattleScene extends Scene {
  constructor(game) {
    super(game);
    this.name = 'BattleScene';
    this.field = new FieldView();
    this.fx = new FxLayer();
    this.battle = null;
    this.speedIndex = 0;
    this.accumulator = 0;
    this.fxCursor = 0;
    this.outcome = null;
    this.settleTimer = 0;
    this.prevPositions = new Map();

    this.buttons = {
      speed: new Button({ label: '1×', kind: 'ghost', onTap: () => this._cycleSpeed() }),
      skip:  new Button({ label: 'Skip', kind: 'ghost', onTap: () => this._skip() }),
      done:  new Button({ label: 'Continue', kind: 'primary', onTap: () => this._continue() }),
    };
  }

  enter() {
    this.battle = buildRoundBattle({ collectFx: true });
    if (!this.battle) { this.game.scenes.pop(); return; }
    this.fx.clear();
    this.fxCursor = 0;
    this.outcome = null;
  }

  exit() {
    this.fx.clear();
  }

  _layout(view) {
    const top = view.safeTop + 56;
    const bottom = view.h - view.safeBottom - 62;
    this.field.layout({ x: 8, y: top, w: view.w - 16, h: bottom - top }, 'top');

    const pad = 10;
    const y = view.h - view.safeBottom - 54;
    if (this.outcome) {
      this.buttons.done.setRect(pad, y, view.w - pad * 2, 48);
    } else {
      const halfW = (view.w - pad * 3) / 2;
      this.buttons.speed.setRect(pad, y, halfW, 48);
      this.buttons.skip.setRect(pad * 2 + halfW, y, halfW, 48);
    }
  }

  _cycleSpeed() {
    this.speedIndex = (this.speedIndex + 1) % SPEEDS.length;
    this.buttons.speed.label = `${SPEEDS[this.speedIndex]}×`;
  }

  _skip() {
    if (!this.battle || this.outcome) return;
    run(this.battle);                       // fast-forward the remaining ticks
    this._captureOutcome();
  }

  _captureOutcome() {
    this.outcome = result(this.battle);
    this.resolution = finishRound(this.outcome);
  }

  async _continue() {
    const summary = assaultSummary();
    this.game.scenes.pop();
    // The deploy scene owns the tech / victory / defeat panels.
    const below = this.game.scenes.top;
    if (below?.onRoundResolved) below.onRoundResolved();
    else if (!summary) this.game.scenes.popTo('WorldScene');
    await this.game.save();
  }

  handleInput(input) {
    this._layout(this.game.view);
    const tap = input.tap;
    if (!tap) return false;
    if (this.outcome) return this.buttons.done.tryTap(tap);
    return this.buttons.speed.tryTap(tap) || this.buttons.skip.tryTap(tap);
  }

  update(dt) {
    for (const b of Object.values(this.buttons)) b.update(dt);
    this.fx.update(dt);

    if (!this.battle || this.outcome) {
      if (this.outcome) this.settleTimer += dt;
      return;
    }

    // Step the sim at its own fixed rate, independent of the render frame rate.
    const speed = SPEEDS[this.speedIndex];
    this.accumulator += dt * speed;
    let steps = 0;
    while (this.accumulator >= 1 / SIM_HZ && !this.battle.over && steps < 12) {
      this.accumulator -= 1 / SIM_HZ;
      this._rememberPositions();
      step(this.battle);
      steps++;
    }

    // Drain new sim events into the cosmetic layer.
    if (this.battle.fx && this.fxCursor < this.battle.fx.length) {
      const batch = this.battle.fx.slice(this.fxCursor);
      this.fxCursor = this.battle.fx.length;
      this.fx.ingest(batch, (fx, fy) => this.field.toScreen(fx, fy));
      // Keep the event log from growing unbounded in a long battle.
      if (this.battle.fx.length > 2000) {
        this.battle.fx.length = 0;
        this.fxCursor = 0;
      }
    }

    if (this.battle.over) this._captureOutcome();
  }

  _rememberPositions() {
    this.prevPositions.clear();
    for (const m of this.battle.models) {
      if (m.alive) this.prevPositions.set(m.id, { x: m.x, y: m.y });
    }
  }

  render(ctx, view, alpha) {
    this._layout(view);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, view.w, view.h);

    const summary = assaultSummary();
    this._renderHeader(ctx, view, summary);

    this.fx.applyShake(ctx);
    this.field.renderBackground(ctx, {
      biomeColor: summary?.biome.color ?? COLORS.green, showZones: false,
    });
    this._renderMines(ctx);
    this._renderModels(ctx, alpha);
    this.fx.render(ctx);
    ctx.restore();

    this._renderRoster(ctx, view);

    if (this.outcome) this._renderOutcome(ctx, view);
    else {
      this.buttons.speed.render(ctx);
      this.buttons.skip.render(ctx);
    }
  }

  _renderHeader(ctx, view, summary) {
    const top = view.safeTop;
    ctx.fillStyle = 'rgba(18,24,15,.95)';
    ctx.fillRect(0, 0, view.w, top + 56);

    const players = this.battle.models.filter((m) => m.alive && m.side === 'player').length;
    const enemies = this.battle.models.filter((m) => m.alive && m.side === 'enemy').length;

    text(ctx, `${enemies}`, 14, top + 18, { size: 15, color: COLORS.enemy });
    text(ctx, `${players}`, view.w - 14, top + 18, { size: 15, color: COLORS.green, align: 'right' });
    text(ctx, summary ? `Round ${summary.round}/${summary.maxRounds}` : 'Battle',
         view.w / 2, top + 18, { size: 14, color: COLORS.ink, align: 'center' });

    // Strength bar: who is winning right now, at a glance.
    const total = players + enemies || 1;
    const barW = view.w - 28;
    fillRound(ctx, 14, top + 34, barW, 8, 4, COLORS.enemy);
    fillRound(ctx, 14 + barW * (enemies / total), top + 34, barW * (players / total), 8, 4, COLORS.green);

    const secs = (this.battle.tick / SIM_HZ).toFixed(0);
    text(ctx, `${secs}s`, view.w / 2, top + 48, {
      size: 10, color: COLORS.inkFaint, align: 'center', weight: 500,
    });
  }

  _renderMines(ctx) {
    for (const mine of this.battle.mines) {
      const p = this.field.toScreen(mine.x, mine.y);
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(performance.now() / 240);
      ctx.fillStyle = mine.side === 'player' ? COLORS.green : COLORS.enemy;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  _renderModels(ctx, alpha) {
    // Sort by depth so nearer models overlap further ones correctly.
    const living = this.battle.models.filter((m) => m.alive);
    living.sort((a, b) => (a.flying === b.flying ? a.y - b.y : (a.flying ? 1 : -1)));

    const size = this.field.cell * 0.5;
    for (const m of living) {
      const prev = this.prevPositions.get(m.id);
      const fx = prev ? prev.x + (m.x - prev.x) * alpha : m.x;
      const fy = prev ? prev.y + (m.y - prev.y) * alpha : m.y;
      const p = this.field.toScreen(fx, fy);

      // Ground shadow anchors flyers to a position.
      if (m.flying) {
        ctx.fillStyle = 'rgba(0,0,0,.3)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 4, size * 0.28, size * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      const hpPct = m.hp / Math.max(1, m.maxHp);
      drawMech(ctx, m.unitId, p.x, p.y + (m.flying ? -size * 0.5 : size * 0.18), size, {
        team: m.side === 'player' ? 'ally' : 'enemy',
        facing: m.side === 'player' ? -1 : 1,
        hp: hpPct,
        shielded: m.shield > 0,
      });

      if (hpPct < 0.999) {
        const w = size * 0.8;
        bar(ctx, p.x - w / 2, p.y - size * 1.15, w, 2.5, hpPct, {
          fill: m.side === 'player' ? COLORS.green : COLORS.enemy,
          back: 'rgba(0,0,0,.6)', r: 1,
        });
      }
    }
  }

  /**
   * Live squad readout in the band below the field. The battle takes no input,
   * so the only thing this screen owes the player is a clear picture of what is
   * left on each side and how badly it is hurt.
   */
  _renderRoster(ctx, view) {
    const top = this.field.bottom + 10;
    const available = (view.h - view.safeBottom - 62) - top;
    if (available < 44) return;

    const byUnit = { player: new Map(), enemy: new Map() };
    for (const m of this.battle.models) {
      if (!m.alive || m.isSeedling) continue;
      const bucket = byUnit[m.side];
      const entry = bucket.get(m.unitId) ?? { count: 0, hp: 0, max: 0 };
      entry.count++;
      entry.hp += m.hp;
      entry.max += m.maxHp;
      bucket.set(m.unitId, entry);
    }

    const colW = (view.w - 24) / 2;
    const sides = [
      { side: 'enemy', x: 12, color: COLORS.enemy, label: 'THEM', align: 'left' },
      { side: 'player', x: 12 + colW, color: COLORS.green, label: 'YOU', align: 'left' },
    ];

    for (const col of sides) {
      text(ctx, col.label, col.x, top, { size: 9, color: col.color, weight: 700 });
      let y = top + 16;
      const rows = [...byUnit[col.side].entries()].sort((a, b) => b[1].count - a[1].count);
      for (const [unitId, entry] of rows) {
        if (y + 16 > top + available) break;
        const unit = UNITS[unitId];
        text(ctx, `${unit?.name ?? unitId} ×${entry.count}`, col.x, y, {
          size: 11, color: COLORS.ink, weight: 500, maxWidth: colW - 46,
        });
        bar(ctx, col.x + colW - 44, y - 3, 34, 4, entry.hp / Math.max(1, entry.max), {
          fill: col.color, r: 2,
        });
        y += 16;
      }
      if (!rows.length) {
        text(ctx, 'wiped out', col.x, y, { size: 11, color: COLORS.inkFaint, weight: 500 });
      }
    }
  }

  _renderOutcome(ctx, view) {
    const o = this.outcome;
    const won = o.winner === 'player';
    const fade = Math.min(1, this.settleTimer * 2.5);

    ctx.fillStyle = `rgba(6,10,5,${0.72 * fade})`;
    ctx.fillRect(0, 0, view.w, view.h);

    const w = Math.min(view.w - 32, 420);
    const x = (view.w - w) / 2;
    const h = 210;
    const y = view.h / 2 - h / 2 - 30;
    panel(ctx, x, y, w, h);

    text(ctx, won ? 'ROUND WON' : o.winner === 'draw' ? 'MUTUAL DESTRUCTION' : 'ROUND LOST',
         x + w / 2, y + 30, {
      size: 20, color: won ? COLORS.green : COLORS.rust, align: 'center', weight: 800,
    });

    const lines = [
      `${o.stats.playerKills} enemy models destroyed`,
      `${o.stats.enemyKills} of yours lost`,
      `${o.seconds}s`,
    ];
    if (o.homesteadDamage > 0) lines.push(`Homestead took ${o.homesteadDamage} damage`);
    lines.forEach((line, i) => {
      text(ctx, line, x + w / 2, y + 66 + i * 22, {
        size: 13, color: COLORS.ink, align: 'center', weight: 500,
      });
    });

    // Which of your squads made it back.
    const survivors = Object.entries(o.survivors.player);
    if (survivors.length) {
      const label = survivors.map(([squadId, count]) => {
        const squad = state.army.squads.find((s) => String(s.id) === String(squadId));
        return squad ? `${UNITS[squad.unitId].name} ×${count}` : null;
      }).filter(Boolean).slice(0, 3).join(', ');
      text(ctx, label, x + w / 2, y + h - 22, {
        size: 11, color: COLORS.inkDim, align: 'center', weight: 500, maxWidth: w - 24,
      });
    }

    this.buttons.done.render(ctx);
  }

  back() {
    if (this.outcome) { this._continue(); return true; }
    this._skip();
    return true;
  }
}

export { MAX_TICKS };
