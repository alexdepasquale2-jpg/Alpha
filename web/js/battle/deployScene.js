// Deployment: buy, reinforce, and place squads before a round resolves. This
// is where the whole game is decided — the battle itself takes no input.

import { Scene } from '../core/scene.js';
import { Button, ScrollList, Card } from '../ui/widgets.js';
import { COLORS, text, panel, fillRound, strokeRound, bar, wrapText } from '../ui/theme.js';
import { drawMech } from '../render/sprites.js';
import { toast } from '../ui/toast.js';
import { state } from '../core/state.js';
import { UNITS, squadCost } from '../data/units.js';
import { TECH, researchEffects } from '../data/tech.js';
import { BIOMES } from '../data/territories.js';
import { FieldView, FIELD_W } from './fieldView.js';
import {
  assaultSummary, playerSquadsForSim, placeSquad, cellOccupant, buyUnit,
  reinforce, sellSquad, isPlayerCell, pickTech, skipTech, claimVictory,
  retreat, autoDeployUndeployed, PLAYER_ROWS, availableGold,
} from './assault.js';

const TRAY_H = 168;

export class DeployScene extends Scene {
  constructor(game) {
    super(game);
    this.name = 'DeployScene';
    this.field = new FieldView();
    this.tray = 'army';          // 'army' | 'shop'
    this.list = new ScrollList({ rowHeight: 62 });
    this.card = new Card();
    this.selectedSquadId = null;
    this.dragging = null;        // { squadId, x, y }
    this.inspect = null;

    this.buttons = {
      fight:   new Button({ label: 'Fight', icon: '⚔️', kind: 'primary', onTap: () => this._fight() }),
      army:    new Button({ label: 'Army', onTap: () => this._setTray('army') }),
      shop:    new Button({ label: 'Shop', onTap: () => this._setTray('shop') }),
      retreat: new Button({ label: 'Retreat', kind: 'danger', onTap: () => this._confirmRetreat() }),
      auto:    new Button({ label: 'Auto-place', kind: 'ghost', onTap: () => this._autoPlace() }),
    };
  }

  enter() {
    this._refreshList();
    const summary = assaultSummary();
    if (summary?.phase === 'tech') this._showTechOffer();
    if (summary?.phase === 'victory') this._showVictory();
    if (summary?.phase === 'defeat') this._showDefeat();
  }

  onResize() { /* laid out per frame */ }

  get assault() { return state.world.currentAssault; }

  _layout(view) {
    const top = view.safeTop + 90;
    const trayY = view.h - view.safeBottom - TRAY_H;
    this.field.layout({ x: 8, y: top, w: view.w - 16, h: trayY - top - 56 });

    const pad = 8;
    const btnY = trayY - 50;
    const thirdW = (view.w - pad * 4) / 3;
    this.buttons.retreat.setRect(pad, btnY, thirdW, 44);
    this.buttons.auto.setRect(pad * 2 + thirdW, btnY, thirdW, 44);
    this.buttons.fight.setRect(pad * 3 + thirdW * 2, btnY, thirdW, 44);

    const tabW = (view.w - pad * 3) / 2;
    this.buttons.army.setRect(pad, trayY + 6, tabW, 40);
    this.buttons.shop.setRect(pad * 2 + tabW, trayY + 6, tabW, 40);
    this.list.setRect(pad, trayY + 52, view.w - pad * 2, TRAY_H - 58);
    this.trayY = trayY;
  }

  _setTray(which) {
    this.tray = which;
    this._refreshList();
  }

  _refreshList() {
    if (!this.assault) return;
    if (this.tray === 'army') {
      this.list.rowHeight = 62;
      this.list.setItems(state.army.squads.map((squad) => ({ kind: 'squad', squad })));
    } else {
      this.list.rowHeight = 62;
      this.list.setItems(
        state.army.unlockedUnits
          .map((id) => UNITS[id])
          .filter(Boolean)
          .sort((a, b) => a.cost - b.cost)
          .map((unit) => ({ kind: 'unit', unit })),
      );
    }
  }

  /* ---- input ------------------------------------------------------------ */

  handleInput(input) {
    const view = this.game.view;
    this._layout(view);

    // The tech offer is modal: nothing else accepts input until it's resolved.
    if (this.techOffer) {
      const tap = input.takeTap();
      return tap ? this._tapTechCard(tap, view) : true;
    }
    if (this.card.visible) return this.card.handleInput(input, view);
    if (!this.assault) return false;

    // Drag a selected squad onto the field.
    if (input.drag && this.selectedSquadId != null) {
      this.dragging = { squadId: this.selectedSquadId, x: input.drag.x, y: input.drag.y };
    }
    const dropped = input.takeDragEnd();
    if (dropped && this.dragging) {
      const cell = this.field.toCell(dropped.x, dropped.y);
      if (cell && isPlayerCell(cell.x, cell.y)) {
        placeSquad(this.dragging.squadId, cell.x, cell.y);
      }
      this.dragging = null;
      return true;
    }
    if (!input.pointer.down) this.dragging = null;

    const picked = this.list.handleInput(input);
    if (picked) { this._onListPick(picked); return true; }

    const tap = input.tap;
    if (!tap) {
      const held = input.takeLongPress();
      if (held) this._onLongPress(held);
      return false;
    }

    for (const key of ['fight', 'army', 'shop', 'retreat', 'auto']) {
      if (this.buttons[key].tryTap(tap)) return true;
    }

    if (this.field.contains(tap.x, tap.y)) {
      const cell = this.field.toCell(tap.x, tap.y);
      if (!cell) return true;
      if (isPlayerCell(cell.x, cell.y)) {
        if (this.selectedSquadId != null) {
          placeSquad(this.selectedSquadId, cell.x, cell.y);
          this.selectedSquadId = null;
        } else {
          const occupant = cellOccupant(cell.x, cell.y);
          this.selectedSquadId = occupant?.id ?? null;
        }
      } else {
        this._inspectEnemyCell(cell);
      }
      return true;
    }
    return false;
  }

  _onLongPress(point) {
    if (!this.field.contains(point.x, point.y)) return;
    const cell = this.field.toCell(point.x, point.y);
    if (!cell) return;
    const occupant = isPlayerCell(cell.x, cell.y) ? cellOccupant(cell.x, cell.y) : null;
    if (occupant) this._showSquadCard(occupant);
    else this._inspectEnemyCell(cell);
  }

  _inspectEnemyCell(cell) {
    const squad = this.assault.enemySquads.find((s) => s.x === cell.x && s.y === cell.y);
    if (!squad) return;
    const unit = UNITS[squad.unitId];
    this.card.show({
      title: `Enemy ${unit.name} ×${squad.count}`,
      body: `${unit.role} · ${unit.hp} hp · ${unit.dps} dps · ${unit.range} range\n\n${unit.counteredBy}`,
      buttons: [{ label: 'Close', kind: 'ghost', onTap: () => this.card.hide() }],
    });
  }

  _onListPick(entry) {
    if (entry.kind === 'unit') {
      const res = buyUnit(entry.unit.id);
      if (!res.ok) { toast(res.reason, 'bad'); return; }
      toast(`${entry.unit.name} squad deployed.`, 'gold');
      this._setTray('army');
      this.selectedSquadId = res.squad.id;
    } else {
      this._showSquadCard(entry.squad);
    }
  }

  _showSquadCard(squad) {
    const unit = UNITS[squad.unitId];
    const atMax = squad.count >= unit.maxSize;
    const buttons = [
      { label: 'Close', kind: 'ghost', onTap: () => this.card.hide() },
      {
        label: atMax ? 'Full' : `+1 (${unit.reinforceCost}g)`,
        kind: 'primary',
        onTap: () => {
          const res = reinforce(squad.id, 1);
          if (!res.ok) toast(res.reason, 'bad');
          else { toast(`${unit.name} reinforced.`, 'gold'); this._refreshList(); }
          this.card.hide();
        },
      },
      {
        label: 'Sell',
        kind: 'danger',
        onTap: () => {
          const res = sellSquad(squad.id);
          if (res.ok) toast(`Sold for ${res.refund}g.`);
          this.selectedSquadId = null;
          this._refreshList();
          this.card.hide();
        },
      },
    ];
    const vet = squad.veterancy ? `\nVeterancy ${'★'.repeat(squad.veterancy)}` : '';
    const hurt = (squad.hpPct ?? 1) < 1 ? `\nAt ${Math.round((squad.hpPct ?? 1) * 100)}% strength` : '';
    this.card.show({
      title: `${unit.name} ×${squad.count}/${unit.maxSize}`,
      body: `${unit.role} · ${unit.hp} hp · ${unit.dps} dps · range ${unit.range}${vet}${hurt}\n${unit.counters}`,
      buttons,
    });
  }

  _autoPlace() {
    autoDeployUndeployed();
    toast('Squads placed.');
  }

  async _fight() {
    if (!playerSquadsForSim().length) {
      toast('Deploy at least one squad first.', 'bad');
      return;
    }
    const { BattleScene } = await import('./battleScene.js');
    this.game.scenes.push(new BattleScene(this.game));
  }

  _confirmRetreat() {
    const endless = !!this.assault?.endless;
    this.card.show({
      title: endless ? 'Stand down?' : 'Fall back?',
      body: endless
        ? 'You bank the full run and keep your score.'
        : 'You keep your army and half the salvage.\nThe parcel stays in enemy hands.',
      buttons: [
        { label: 'Stay', kind: 'ghost', onTap: () => this.card.hide() },
        {
          label: endless ? 'Stand down' : 'Retreat', kind: 'danger',
          onTap: async () => {
            this.card.hide();
            if (endless) {
              const { bankEndlessRun } = await import('../map/endless.js');
              const summary = bankEndlessRun();
              toast(`Held ${summary.wave} wave(s) — banked ${summary.gold}g.`, 'gold');
            } else {
              const res = retreat();
              toast(`Fell back from ${res.territory.name}.`, 'bad');
            }
            await this.game.save();
            this.game.scenes.popTo('FarmScene');
          },
        },
      ],
    });
  }

  /* ---- ladder phases ----------------------------------------------------- */

  /** Called by BattleScene when it pops back after a round. */
  onRoundResolved() {
    const summary = assaultSummary();
    if (!summary) { this.game.scenes.popTo('FarmScene'); return; }
    this._refreshList();
    this.selectedSquadId = null;
    if (summary.phase === 'tech') this._showTechOffer();
    else if (summary.phase === 'victory') this._showVictory();
    else if (summary.phase === 'defeat') this._showDefeat();
  }

  _showTechOffer() {
    const offer = this.assault.techOffer.map((id) => TECH[id]).filter(Boolean);
    if (!offer.length) { skipTech(); return; }
    this.techOffer = offer;
    this.phase = 'tech';
  }

  _showVictory() {
    const claimed = claimVictory();
    const g = claimed.granted;
    const lines = [];
    if (g.gold) lines.push(`+${g.gold}g`);
    if (g.rows) lines.push(`+${g.rows} row(s) of ${BIOMES[claimed.territory.biome].name} farmland`);
    for (const cropId of g.crops) lines.push(`New seed: ${cropId}`);
    for (const unitId of g.units) lines.push(`New chassis: ${UNITS[unitId].name}`);
    const items = Object.entries(g.items).map(([k, v]) => `${v} ${k}`).join(', ');
    if (items) lines.push(`Salvage: ${items}`);
    if (g.biome) lines.push(`${BIOMES[g.biome].name} is now open.`);
    if (g.endless) lines.push('Endless defence unlocked.');

    this.card.show({
      title: `${claimed.territory.name} is yours`,
      body: lines.join('\n') || 'The parcel is taken.',
      buttons: [{
        label: 'Home', kind: 'primary',
        onTap: async () => {
          this.card.hide();
          await this.game.save();
          this.game.scenes.popTo('FarmScene');
        },
      }],
    });
  }

  async _showDefeat() {
    // Endless runs pay out on defeat rather than losing everything.
    if (this.assault.endless) {
      const { bankEndlessRun } = await import('../map/endless.js');
      const summary = bankEndlessRun();
      this.card.show({
        title: `${summary.wave} wave(s) held`,
        body: `Score ${summary.score} (best ${summary.bestScore})\n`
            + `Banked ${summary.gold}g and every scrap they left behind.`,
        buttons: [{
          label: 'Home', kind: 'primary',
          onTap: async () => {
            this.card.hide();
            await this.game.save();
            this.game.scenes.popTo('FarmScene');
          },
        }],
      });
      return;
    }

    const res = retreat();
    this.card.show({
      title: 'The homestead is breached',
      body: `You held ${res.wins} round(s).\nThe army pulls back. Regroup, replant, return.`,
      buttons: [{
        label: 'Home', kind: 'primary',
        onTap: async () => {
          this.card.hide();
          await this.game.save();
          this.game.scenes.popTo('FarmScene');
        },
      }],
    });
  }

  _tapTechCard(tap, view) {
    const cards = this.techOffer ?? [];
    const pad = 12;
    const w = Math.min(view.w - pad * 2, 420);
    const x = (view.w - w) / 2;
    const h = 92;
    let y = view.h / 2 - (cards.length * (h + 10)) / 2;
    for (const card of cards) {
      if (tap.x >= x && tap.x <= x + w && tap.y >= y && tap.y <= y + h) {
        pickTech(card.id);
        toast(`${card.name} adopted.`, 'gold');
        this.techOffer = null;
        this.phase = null;
        this._refreshList();
        return true;
      }
      y += h + 10;
    }
    // Tapping below the stack skips.
    if (tap.y > y) {
      skipTech();
      this.techOffer = null;
      this.phase = null;
      return true;
    }
    return false;
  }

  update(dt) {
    for (const b of Object.values(this.buttons)) b.update(dt);
  }

  /* ---- render ------------------------------------------------------------ */

  render(ctx, view) {
    this._layout(view);
    const assault = this.assault;
    if (!assault) return;
    const summary = assaultSummary();

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, view.w, view.h);

    this._renderHeader(ctx, view, summary);
    this.field.renderBackground(ctx, { biomeColor: summary.biome.color });
    this._renderEnemy(ctx);
    this._renderPlayer(ctx);
    this._renderTray(ctx, view);

    for (const key of ['fight', 'retreat', 'auto']) this.buttons[key].render(ctx);

    if (this.dragging) this._renderDragGhost(ctx);
    if (this.techOffer) this._renderTechOffer(ctx, view);
    this.card.render(ctx, view);
  }

  _renderHeader(ctx, view, s) {
    const top = view.safeTop;
    ctx.fillStyle = 'rgba(18,24,15,.95)';
    ctx.fillRect(0, 0, view.w, top + 86);
    ctx.fillStyle = COLORS.panelEdge;
    ctx.fillRect(0, top + 85, view.w, 1);

    text(ctx, s.territory.name, 14, top + 18, { size: 15, color: s.biome.color });
    text(ctx, `Round ${s.round}/${s.maxRounds}  ·  ${s.styleName}`, 14, top + 38, {
      size: 12, color: COLORS.inkDim, weight: 500,
    });
    text(ctx, `${s.gold.toLocaleString()}g`, view.w - 14, top + 18, {
      size: 17, color: COLORS.gold, align: 'right',
    });
    // Spelled out so it is obvious the shop is reaching into the farm's money,
    // not just a per-battle allowance.
    text(ctx, `${s.stipend} stipend + ${s.farmGold.toLocaleString()} farm`, view.w - 14, top + 76, {
      size: 9, color: COLORS.inkFaint, align: 'right', weight: 500,
    });

    // Homestead HP — the real loss condition.
    const barW = Math.min(150, view.w * 0.42);
    bar(ctx, view.w - 14 - barW, top + 34, barW, 9, s.homesteadHp / s.homesteadHpMax, {
      fill: s.homesteadHp / s.homesteadHpMax > 0.35 ? COLORS.green : COLORS.rust,
      edge: COLORS.panelEdge,
    });
    text(ctx, `homestead ${s.homesteadHp}`, view.w - 14, top + 58, {
      size: 10, color: COLORS.inkDim, align: 'right', weight: 500,
    });

    const wins = '●'.repeat(s.wins) + '○'.repeat(Math.max(0, s.maxRounds - s.wins));
    text(ctx, wins, 14, top + 58, { size: 12, color: COLORS.gold, weight: 500 });
  }

  _renderEnemy(ctx) {
    for (const squad of this.assault.enemySquads) {
      const r = this.field.cellRect(squad.x, squad.y);
      drawMech(ctx, squad.unitId, r.x + r.w / 2, r.y + r.h * 0.82, r.h * 0.62, {
        team: 'enemy', facing: 1, count: squad.count,
      });
      text(ctx, `×${squad.count}`, r.x + r.w - 4, r.y + 10, {
        size: 10, color: COLORS.enemy, align: 'right', weight: 700,
      });
    }
  }

  _renderPlayer(ctx) {
    const assault = this.assault;

    // Empty deploy cells get a faint marker so the zone reads as placeable.
    for (const y of PLAYER_ROWS) {
      for (let x = 0; x < FIELD_W; x++) {
        if (!cellOccupant(x, y)) {
          const r = this.field.cellRect(x, y);
          ctx.strokeStyle = 'rgba(127,191,90,.18)';
          ctx.lineWidth = 1;
          ctx.strokeRect(r.x + 6, r.y + 6, r.w - 12, r.h - 12);
        }
      }
    }

    for (const squad of state.army.squads) {
      const pos = assault.deployment[squad.id];
      if (!pos) continue;
      const r = this.field.cellRect(pos.x, pos.y);
      const selected = squad.id === this.selectedSquadId;

      if (selected) {
        fillRound(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, 6, 'rgba(127,191,90,.2)');
        strokeRound(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, 6, COLORS.green, 2);
      }

      drawMech(ctx, squad.unitId, r.x + r.w / 2, r.y + r.h * 0.82, r.h * 0.62, {
        team: 'ally', facing: -1, count: squad.count, hp: squad.hpPct ?? 1,
      });
      text(ctx, `×${squad.count}`, r.x + r.w - 4, r.y + 10, {
        size: 10, color: COLORS.green, align: 'right', weight: 700,
      });
      if ((squad.hpPct ?? 1) < 1) {
        bar(ctx, r.x + 4, r.y + r.h - 6, r.w - 8, 3, squad.hpPct, { fill: COLORS.rust, r: 1 });
      }
      if (squad.veterancy) {
        text(ctx, '★'.repeat(squad.veterancy), r.x + 4, r.y + 10, {
          size: 9, color: COLORS.gold, weight: 700,
        });
      }
    }
  }

  _renderDragGhost(ctx) {
    const squad = state.army.squads.find((s) => s.id === this.dragging.squadId);
    if (!squad) return;
    ctx.globalAlpha = 0.75;
    drawMech(ctx, squad.unitId, this.dragging.x, this.dragging.y + 16, this.field.cell * 0.62, {
      team: 'ally', facing: -1, count: squad.count,
    });
    ctx.globalAlpha = 1;

    const cell = this.field.toCell(this.dragging.x, this.dragging.y);
    if (cell && isPlayerCell(cell.x, cell.y)) this.field.renderCellHint(ctx, cell.x, cell.y);
  }

  _renderTray(ctx, view) {
    const y = this.trayY;
    ctx.fillStyle = 'rgba(14,19,9,.97)';
    ctx.fillRect(0, y, view.w, view.h - y);
    ctx.fillStyle = COLORS.panelEdge;
    ctx.fillRect(0, y, view.w, 1);

    this.buttons.army.kind = this.tray === 'army' ? 'primary' : 'ghost';
    this.buttons.shop.kind = this.tray === 'shop' ? 'primary' : 'ghost';
    this.buttons.army.render(ctx);
    this.buttons.shop.render(ctx);

    if (!this.list.items.length) {
      text(ctx, this.tray === 'army' ? 'No squads. Buy some in the Shop.' : 'Nothing unlocked yet.',
           view.w / 2, y + 108, { size: 12, color: COLORS.inkFaint, align: 'center', weight: 500 });
      return;
    }

    this.list.render(ctx, (c, entry, x, ry, w, h) => {
      fillRound(c, x, ry, w, h, 10, COLORS.panelDeep);
      if (entry.kind === 'unit') {
        const unit = entry.unit;
        const affordable = availableGold() >= unit.cost;
        c.globalAlpha = affordable ? 1 : 0.45;
        drawMech(c, unit.id, x + 28, ry + h - 10, h * 0.66, { team: 'ally', facing: -1 });
        text(c, unit.name, x + 56, ry + 16, { size: 14, color: COLORS.ink });
        text(c, `${unit.role} · ${unit.hp}hp · ${unit.dps}dps · rng ${unit.range}`,
             x + 56, ry + 34, { size: 10, color: COLORS.inkDim, weight: 500 });
        text(c, `×${unit.size} squad`, x + 56, ry + 50, { size: 10, color: COLORS.inkFaint, weight: 500 });
        text(c, `${unit.cost}g`, x + w - 12, ry + h / 2, {
          size: 15, color: affordable ? COLORS.gold : COLORS.inkFaint, align: 'right',
        });
        c.globalAlpha = 1;
      } else {
        const squad = entry.squad;
        const unit = UNITS[squad.unitId];
        const deployed = !!this.assault.deployment[squad.id];
        if (squad.id === this.selectedSquadId) strokeRound(c, x, ry, w, h, 10, COLORS.green, 2);
        drawMech(c, unit.id, x + 28, ry + h - 10, h * 0.66, {
          team: 'ally', facing: -1, count: squad.count, hp: squad.hpPct ?? 1,
        });
        text(c, `${unit.name} ×${squad.count}`, x + 56, ry + 16, { size: 14, color: COLORS.ink });
        text(c, deployed ? 'deployed' : 'in reserve', x + 56, ry + 34, {
          size: 10, color: deployed ? COLORS.green : COLORS.rust, weight: 600,
        });
        if (squad.veterancy) {
          text(c, '★'.repeat(squad.veterancy), x + 56, ry + 50, {
            size: 10, color: COLORS.gold, weight: 700,
          });
        }
        const cost = unit.reinforceCost;
        text(c, `+1: ${cost}g`, x + w - 12, ry + h / 2, {
          size: 12,
          color: availableGold() >= cost && squad.count < unit.maxSize ? COLORS.gold : COLORS.inkFaint,
          align: 'right',
        });
      }
    });
  }

  _renderTechOffer(ctx, view) {
    ctx.fillStyle = 'rgba(6,10,5,.86)';
    ctx.fillRect(0, 0, view.w, view.h);

    text(ctx, 'FIELD RESEARCH', view.w / 2, view.h / 2 - (this.techOffer.length * 51) - 44, {
      size: 13, color: COLORS.gold, align: 'center',
    });
    text(ctx, 'Pick one. It lasts the season.', view.w / 2,
         view.h / 2 - (this.techOffer.length * 51) - 24, {
      size: 11, color: COLORS.inkDim, align: 'center', weight: 500,
    });

    const pad = 12;
    const w = Math.min(view.w - pad * 2, 420);
    const x = (view.w - w) / 2;
    const h = 92;
    let y = view.h / 2 - (this.techOffer.length * (h + 10)) / 2;

    for (const card of this.techOffer) {
      const unit = UNITS[card.unitId];
      panel(ctx, x, y, w, h, { fill: COLORS.panelDeep });
      drawMech(ctx, card.unitId, x + 34, y + h - 16, h * 0.5, { team: 'ally', facing: -1 });
      text(ctx, card.name, x + 68, y + 22, { size: 15, color: COLORS.gold });
      text(ctx, unit?.name ?? '', x + w - 14, y + 22, {
        size: 11, color: COLORS.inkDim, align: 'right', weight: 500,
      });
      wrapText(ctx, card.desc, x + 68, y + 46, w - 82, 16, { size: 12, weight: 500, color: COLORS.ink });
      y += h + 10;
    }

    text(ctx, 'tap below to skip', view.w / 2, y + 18, {
      size: 11, color: COLORS.inkFaint, align: 'center', weight: 500,
    });
  }

  back() {
    if (this.card.visible) { this.card.hide(); return true; }
    if (this.techOffer) return true;   // must choose or skip via the panel
    this._confirmRetreat();
    return true;
  }
}
