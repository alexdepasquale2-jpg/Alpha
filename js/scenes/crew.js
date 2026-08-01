/* ============================================================================
 * scenes/crew.js — the crew screen.
 *
 * Left  : the strike squad slots + the auto-equipped loadout (best weapon and
 *         vehicle in the stash) and the resulting combat rating.
 * Right : the full roster — every agent, where it is, and one-tap assignment
 *         to the squad or to an outpost.
 * ========================================================================== */
(function () {
  'use strict';
  const U = CM.util, A = CM.art, h = CM.ui.h, S = CM.state, ITEMS = CM.ITEMS, BLD = CM.BUILDINGS;

  const Crew = CM.Scene.extend(function Crew() {
    CM.Scene.call(this, 'crew');
  });

  Crew.prototype.enter = function () {
    const self = this;
    this.add(this.backButton('base'));

    this.cols = h('div', {
      style: { position: 'absolute', inset: 'calc(var(--hud-h) + 30px) clamp(8px,3vw,40px) calc(var(--bar-h) + 6px)',
               display: 'flex', gap: '12px', flexWrap: 'wrap', overflow: 'hidden' }
    });
    this.add(this.cols);

    const bar = h('div.actionbar');
    bar.appendChild(CM.ui.actionBtn('RECRUIT', 'STASH', '', () => CM.game.go('merge')));
    bar.appendChild(CM.ui.actionBtn('DEPLOY', 'HIT MISSION', 'red', () => CM.game.go('mission')));
    bar.appendChild(CM.ui.actionBtn('RETURN', 'BASE', 'ghost', () => CM.game.go('base')));
    this.add(bar);

    this.listen('inv', () => self.rebuild());
    this.listen('state', () => self.rebuild());
    this.rebuild();
  };

  Crew.prototype.rebuild = function () {
    const self = this;
    CM.ui.clear(this.cols);

    /* ------------------------------------------------------ left column */
    const left = h('div.panel', {
      style: { flex: '1 1 260px', minWidth: '240px', maxWidth: '420px', padding: '12px',
               overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }
    });

    left.appendChild(h('div.panel-title', { text: 'STRIKE SQUAD  ' + S.s.squad.length + '/' + S.squadSlots() }));

    const slots = h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } });
    for (let i = 0; i < S.squadSlots(); i++) {
      const id = S.s.squad[i];
      const it = id ? S.itemById(id) : null;
      if (it) {
        slots.appendChild(h('div.slot.gold', {
          title: ITEMS.name(it) + ' — tap to remove',
          onclick: () => { CM.ui.result(S.toggleSquad(it.id)); self.rebuild(); }
        }, [
          h('img', { src: A.itemIconURL('agent', it.tier, 96) }),
          h('span.tag', { text: 'T' + it.tier })
        ]));
      } else {
        slots.appendChild(h('div.slot', { style: { opacity: .4, borderStyle: 'dashed' }, text: '+' }));
      }
    }
    left.appendChild(slots);

    /* auto-equipped loadout */
    const wpn = S.bestOf('weapon'), veh = S.bestOf('vehicle');
    left.appendChild(h('div.panel-title', { text: 'LOADOUT (AUTO — BEST OWNED)' }));
    const gear = h('div', { style: { display: 'flex', gap: '8px' } });
    [['weapon', wpn], ['vehicle', veh]].forEach((pair) => {
      const kind = pair[0], it = pair[1];
      gear.appendChild(h('div.slot' + (kind === 'weapon' ? '.cyan' : '.gold'), {
        title: it ? ITEMS.name(it) : 'none — craft one in the stash'
      }, it ? [h('img', { src: A.itemIconURL(kind, it.tier, 96) }), h('span.tag', { text: 'T' + it.tier })]
            : [h('span', { text: '—', style: { color: '#556' } })]));
    });
    left.appendChild(gear);

    /* rating readout */
    const m = S.mult();
    const agents = S.squadItems();
    let hp = 0, atk = 0;
    agents.forEach((a) => { const p = ITEMS.power(a); hp += p.hp; atk += p.atk; });
    if (veh) hp += ITEMS.power(veh).hp;
    if (wpn) atk += ITEMS.power(wpn).atk;
    hp = Math.round(hp * m.toughness); atk = Math.round(atk * m.damage);

    left.appendChild(h('div', {
      style: { fontSize: '11px', lineHeight: '1.9', color: '#9fb0d4' },
      html: 'Squad HP <b style="color:#49ff9b">' + U.fmt(hp) + '</b><br>' +
            'Damage / round <b style="color:#ff8f8f">' + U.fmt(atk) + '</b><br>' +
            'Tech bonuses <b>×' + U.fmt(m.damage, 2) + ' dmg</b>, <b>×' + U.fmt(m.toughness, 2) + ' tough</b><br>' +
            'Loot multiplier <b style="color:#ffb020">×' + U.fmt(m.loot, 2) + '</b>'
    }));

    if (!S.s.squad.length)
      left.appendChild(h('div.tiny', { text: 'NO SQUAD SET — YOUR STRONGEST AGENTS AUTO-DEPLOY' }));

    /* ----------------------------------------------------- right column */
    const right = h('div.panel.magenta', {
      style: { flex: '2 1 340px', minWidth: '260px', padding: '12px', overflowY: 'auto',
               display: 'flex', flexDirection: 'column', gap: '8px' }
    });
    const roster = S.s.inv.filter((i) => i.kind === 'agent').sort((a, b) => b.tier - a.tier);
    right.appendChild(h('div.panel-title', { text: 'ROSTER  ' + roster.length + ' AGENTS' }));

    if (!roster.length) {
      right.appendChild(h('p', { text: 'No agents yet. Craft one in the STASH, then merge duplicates to climb the chain.',
        style: { fontSize: '11px', color: '#7d8bb0' } }));
    }

    roster.forEach((it) => {
      const inSquad = S.s.squad.indexOf(it.id) >= 0;
      const station = it.at ? S.s.buildings.find((b) => b.id === it.at) : null;
      const where = station ? 'stationed at ' + BLD.byId(station.type).name + ' L' + station.level
                            : inSquad ? 'in the strike squad' : 'idle';
      const p = ITEMS.power(it);
      const actions = h('div', { style: { display: 'flex', gap: '6px', flexShrink: 0 } }, [
        h('button.btn.sm' + (inSquad ? '.gold' : ''), {
          text: inSquad ? 'UNSQUAD' : 'SQUAD',
          onclick: (e) => { e.stopPropagation(); CM.ui.result(S.toggleSquad(it.id)); self.rebuild(); }
        }),
        h('button.btn.sm' + (station ? '.green' : '.ghost'), {
          text: station ? 'RECALL' : 'STATION',
          onclick: (e) => {
            e.stopPropagation();
            if (station) { S.unassign(it.id); CM.ui.toast('RECALLED', 'good'); self.rebuild(); }
            else self.stationPicker(it);
          }
        })
      ]);
      const row = CM.ui.itemRow(it, where + ' · ' + U.fmt(p.hp) + ' hp · ' + U.fmt(p.atk) + ' dmg', actions);
      if (inSquad || station) row.classList.add('on');
      right.appendChild(row);
    });

    this.cols.appendChild(left);
    this.cols.appendChild(right);
  };

  /** Choose which outpost to station an agent at. */
  Crew.prototype.stationPicker = function (it) {
    const self = this;
    const list = h('div.list');
    if (!S.s.buildings.length) list.appendChild(h('p', { text: 'No outposts yet — build one on the base grid first.' }));
    S.s.buildings.slice().sort((a, b) => b.level - a.level).forEach((b) => {
      const def = BLD.byId(b.type);
      const occupied = b.crew ? S.itemById(b.crew) : null;
      const row = h('div.row-item', null, [
        h('img', { src: A.glyphURL(def.glyph, def.color, 64) }),
        h('div.grow', null, [
          h('div.nm', { text: def.name + ' · L' + b.level + '  (' + (b.col + 1) + '-' + (b.row + 1) + ')' }),
          h('div.sub', { text: occupied ? 'currently: ' + ITEMS.name(occupied) : 'empty · output ×' + U.fmt(S.buildingBonus(b), 2) })
        ]),
        h('button.btn.sm', { text: 'ASSIGN' })
      ]);
      row.addEventListener('click', () => {
        CM.ui.result(S.stationCrew(it.id, b.id));
        const root = document.getElementById('modal-root');
        CM.ui.clear(root); root.classList.remove('active');
        self.rebuild();
      });
      list.appendChild(row);
    });
    CM.ui.modal({ title: 'STATION ' + ITEMS.name(it), bodyEl: list, buttons: [{ label: 'CANCEL', cls: 'ghost' }] });
  };

  Crew.prototype.renderBack = function (ctx, w, hgt) {
    ctx.drawImage(A.skyline(w, hgt, 20260801), 0, 0);
    ctx.fillStyle = 'rgba(4,6,14,.66)';
    ctx.fillRect(0, 0, w, hgt);
  };

  CM.scenes = CM.scenes || {};
  CM.scenes.crew = new Crew();
})();
