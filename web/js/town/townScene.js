// Coldbrook: six shopfronts, six people, and whatever the calendar has laid on.

import { Scene } from '../core/scene.js';
import { Button, ScrollList, Card } from '../ui/widgets.js';
import { COLORS, text, panel, fillRound, strokeRound, bar, wrapText } from '../ui/theme.js';
import { drawHeart, drawMech, drawCrop, drawAnimal } from '../render/sprites.js';
import { toast } from '../ui/toast.js';
import {
  state, spendGold, addItem, removeItem, itemCount, addGold, seasonName,
} from '../core/state.js';
import { CROPS, plantableCrops, cropsForBiome } from '../data/crops.js';
import { ITEMS, getItem, seedId, sellValue, itemName } from '../data/items.js';
import { UNITS } from '../data/units.js';
import { RESEARCH, RESEARCH_IDS, researchEffects } from '../data/tech.js';
import { NPCS, NPC_IDS } from '../data/npcs.js';
import { ANIMALS, buyAnimal, canHouse, animalCapacity, animalCount } from '../farm/livestock.js';
import {
  roster, giveGift, talkTo, hearts, canGift, priceMultipliers,
} from './relationships.js';
import { todaysFestival, attend, describeToday, activeMarketDiscount } from './festivals.js';

const SHOPS = [
  { id: 'seed',    npc: 'bram',  label: 'Seed Stall',  icon: '🌱' },
  { id: 'mech',    npc: 'mora',  label: 'Chassis Yard', icon: '🔧' },
  { id: 'ranch',   npc: 'wren',  label: 'Ranch',       icon: '🐄' },
  { id: 'forge',   npc: 'ilse',  label: 'Forge',       icon: '🔨' },
  { id: 'salvage', npc: 'sable', label: 'Salvager',    icon: '⚙️' },
  { id: 'board',   npc: 'odell', label: 'Town Hall',   icon: '📜' },
];

export class TownScene extends Scene {
  constructor(game) {
    super(game);
    this.name = 'TownScene';
    this.view = 'square';       // 'square' | 'shop' | 'people' | 'gift'
    this.shopId = null;
    this.giftTarget = null;
    this.list = new ScrollList({ rowHeight: 62 });
    this.card = new Card();

    this.buttons = {
      back:   new Button({ label: 'Back', kind: 'ghost', onTap: () => this._back() }),
      people: new Button({ label: 'Townsfolk', onTap: () => this._open('people') }),
      farm:   new Button({ label: 'To the farm', kind: 'primary', onTap: () => this.game.scenes.pop() }),
    };
  }

  enter() {
    const festival = todaysFestival();
    if (festival) this._showFestival(festival);
  }

  _layout(view) {
    const pad = 10;
    const y = view.h - view.safeBottom - 54;
    if (this.view === 'square') {
      const halfW = (view.w - pad * 3) / 2;
      this.buttons.people.setRect(pad, y, halfW, 48);
      this.buttons.farm.setRect(pad * 2 + halfW, y, halfW, 48);
    } else {
      this.buttons.back.setRect(pad, y, view.w - pad * 2, 48);
    }
    this.contentRect = {
      x: pad, y: view.safeTop + 74,
      w: view.w - pad * 2, h: y - view.safeTop - 84,
    };
    this.list.setRect(this.contentRect.x, this.contentRect.y + 34,
                      this.contentRect.w, this.contentRect.h - 40);
  }

  /* ---- navigation -------------------------------------------------------- */

  _open(which, shopId = null) {
    this.view = which;
    this.shopId = shopId;
    this._refresh();
  }

  _back() {
    if (this.view === 'gift') { this._open('people'); return; }
    this._open('square');
  }

  _refresh() {
    if (this.view === 'people') {
      this.list.rowHeight = 74;
      this.list.setItems(roster());
    } else if (this.view === 'gift') {
      this.list.rowHeight = 56;
      this.list.setItems(this._giftableItems());
    } else if (this.view === 'shop') {
      this.list.rowHeight = 66;
      this.list.setItems(this._shopStock(this.shopId));
    }
  }

  /* ---- stock ------------------------------------------------------------- */

  _shopStock(shopId) {
    switch (shopId) {
      case 'seed': {
        const discount = priceMultipliers.seed() * activeMarketDiscount('seed');
        const biomes = state.world.biomesUnlocked;
        const all = biomes.flatMap((b) => cropsForBiome(b));
        return all.map((crop) => ({
          kind: 'seed', crop,
          price: Math.max(1, Math.round(crop.seedCost * discount)),
          inSeason: crop.seasons.includes(state.meta.season),
          held: itemCount(seedId(crop.id)),
        })).sort((a, b) => (b.inSeason - a.inSeason) || (a.price - b.price));
      }

      case 'mech': {
        const discount = priceMultipliers.mech();
        return state.army.unlockedUnits
          .map((id) => UNITS[id])
          .filter(Boolean)
          .sort((a, b) => a.cost - b.cost)
          .map((unit) => ({ kind: 'info', unit, price: Math.round(unit.cost * discount) }));
      }

      case 'ranch': {
        const discount = priceMultipliers.ranch();
        return Object.values(ANIMALS).map((animal) => ({
          kind: 'animal', animal,
          price: Math.round(animal.price * discount),
          room: canHouse(animal.id),
        }));
      }

      case 'forge': {
        const discount = priceMultipliers.tool();
        const rows = [
          { kind: 'upgrade', id: 'can', label: 'Watering Can', level: state.farm.wateringCan.level,
            price: Math.round(400 * Math.pow(2.1, state.farm.wateringCan.level - 1) * discount),
            desc: '+8 watering can capacity.' },
          { kind: 'building', id: 'coop', label: 'Coop', level: state.farm.buildings.coop,
            price: Math.round(2200 * Math.pow(1.8, state.farm.buildings.coop) * discount),
            desc: 'Houses 4 chickens.' },
          { kind: 'building', id: 'barn', label: 'Barn', level: state.farm.buildings.barn,
            price: Math.round(4800 * Math.pow(1.8, state.farm.buildings.barn) * discount),
            desc: 'Houses 4 cows or sheep.' },
        ];
        return rows;
      }

      case 'salvage': {
        const consumables = ['fertilizer', 'ration', 'repairKit'].map((id) => ({
          kind: 'buy', item: ITEMS[id], price: ITEMS[id].price,
        }));
        const sellables = ['scrap', 'alloy', 'core'].map((id) => ({
          kind: 'sell', item: ITEMS[id], price: ITEMS[id].price, held: itemCount(id),
        })).filter((row) => row.held > 0);
        return [...consumables, ...sellables];
      }

      case 'board':
        return RESEARCH_IDS.map((id) => {
          const node = RESEARCH[id];
          const owned = state.army.research.includes(id);
          const itemsOk = Object.entries(node.items ?? {})
            .every(([itemId, qty]) => itemCount(itemId) >= qty);
          return { kind: 'research', node, owned, affordable: state.meta.gold >= node.gold && itemsOk };
        });

      default:
        return [];
    }
  }

  _giftableItems() {
    return Object.entries(state.farm.inventory)
      .filter(([itemId, qty]) => qty > 0 && !itemId.startsWith('seed:'))
      .map(([itemId, qty]) => ({ itemId, qty, item: getItem(itemId) }))
      .filter((row) => row.item);
  }

  /* ---- input ------------------------------------------------------------- */

  handleInput(input) {
    const view = this.game.view;
    this._layout(view);
    if (this.card.visible) return this.card.handleInput(input, view);

    if (this.view !== 'square') {
      const picked = this.list.handleInput(input);
      if (picked) { this._onPick(picked); return true; }
      return this.buttons.back.tryTap(input.tap);
    }

    const tap = input.tap;
    if (!tap) return false;
    if (this.buttons.people.tryTap(tap) || this.buttons.farm.tryTap(tap)) return true;

    const hit = this._shopAt(tap, view);
    if (hit) { this._open('shop', hit.id); return true; }
    return false;
  }

  _shopCards(view) {
    const r = this.contentRect;
    const cols = 2;
    const gap = 10;
    const w = (r.w - gap) / cols;
    // Cards stay a readable size rather than stretching to fill the screen;
    // the block of six is then centred in whatever room is left.
    const h = Math.max(96, Math.min(148, (r.h - gap * 2) / 3));
    const top = r.y + Math.max(0, (r.h - (h * 3 + gap * 2)) / 2);
    return SHOPS.map((shop, i) => ({
      shop,
      x: r.x + (i % cols) * (w + gap),
      y: top + Math.floor(i / cols) * (h + gap),
      w, h,
    }));
  }

  _shopAt(tap, view) {
    for (const card of this._shopCards(view)) {
      if (tap.x >= card.x && tap.x <= card.x + card.w
       && tap.y >= card.y && tap.y <= card.y + card.h) return card.shop;
    }
    return null;
  }

  _onPick(entry) {
    if (this.view === 'people') { this._openPerson(entry); return; }
    if (this.view === 'gift') { this._doGift(entry); return; }

    switch (entry.kind) {
      case 'seed': this._buySeed(entry); break;
      case 'animal': this._buyAnimal(entry); break;
      case 'upgrade': this._buyUpgrade(entry); break;
      case 'building': this._buyBuilding(entry); break;
      case 'buy': this._buyItem(entry); break;
      case 'sell': this._sellItem(entry); break;
      case 'research': this._buyResearch(entry); break;
      case 'info': this._showUnitInfo(entry.unit); break;
      default: break;
    }
  }

  /* ---- transactions ------------------------------------------------------ */

  _buySeed(entry) {
    if (!spendGold(entry.price, 'seed')) { toast('Not enough gold.', 'bad'); return; }
    addItem(seedId(entry.crop.id), 1);
    toast(`Bought ${entry.crop.name} seed.`, 'gold', 1200);
    this._refresh();
  }

  _buyAnimal(entry) {
    if (!entry.room) { toast(`Build a ${entry.animal.building} first.`, 'bad'); return; }
    if (!spendGold(entry.price, 'animal')) { toast('Not enough gold.', 'bad'); return; }
    const res = buyAnimal(entry.animal.id);
    if (!res.ok) { addGold(entry.price, 'refund'); toast(res.reason, 'bad'); return; }
    toast(`${entry.animal.name} added to the farm.`, 'gold');
    this._refresh();
  }

  _buyUpgrade(entry) {
    if (!spendGold(entry.price, 'tool')) { toast('Not enough gold.', 'bad'); return; }
    const can = state.farm.wateringCan;
    can.level++;
    can.capacity += 8;
    can.water = can.capacity;
    toast(`Watering can holds ${can.capacity} now.`, 'gold');
    this._refresh();
  }

  _buyBuilding(entry) {
    if (!spendGold(entry.price, 'building')) { toast('Not enough gold.', 'bad'); return; }
    state.farm.buildings[entry.id] = (state.farm.buildings[entry.id] ?? 0) + 1;
    toast(`${entry.label} built.`, 'gold');

    // Redeem any animals gifted before there was room for them.
    const pending = state.farm.pendingAnimals ?? [];
    for (let i = pending.length - 1; i >= 0; i--) {
      if (canHouse(pending[i])) {
        buyAnimal(pending[i]);
        toast(`${ANIMALS[pending[i]].name} moved in.`, 'gold');
        pending.splice(i, 1);
      }
    }
    this._refresh();
  }

  _buyItem(entry) {
    if (!spendGold(entry.price, 'item')) { toast('Not enough gold.', 'bad'); return; }
    addItem(entry.item.id, 1);
    toast(`Bought ${entry.item.name}.`, 'gold', 1200);
    this._refresh();
  }

  _sellItem(entry) {
    if (!removeItem(entry.item.id, 1)) { toast('None left.', 'bad'); return; }
    addGold(entry.price, 'sale');
    toast(`Sold ${entry.item.name} for ${entry.price}g.`, 'gold', 1200);
    this._refresh();
  }

  _buyResearch(entry) {
    const node = entry.node;
    if (entry.owned) { toast('Already researched.', 'bad'); return; }
    for (const [itemId, qty] of Object.entries(node.items ?? {})) {
      if (itemCount(itemId) < qty) {
        toast(`Needs ${qty} ${itemName(itemId)}.`, 'bad');
        return;
      }
    }
    if (!spendGold(node.gold, 'research')) { toast('Not enough gold.', 'bad'); return; }
    for (const [itemId, qty] of Object.entries(node.items ?? {})) removeItem(itemId, qty);
    state.army.research.push(node.id);
    toast(`${node.name} researched.`, 'gold', 3000);
    this._refresh();
  }

  _showUnitInfo(unit) {
    this.card.show({
      title: unit.name,
      body: `${unit.role} · ${unit.cost}g for ×${unit.size}\n`
          + `${unit.hp} hp · ${unit.dps} dps · range ${unit.range} · armour ${unit.armor}\n\n`
          + `${unit.desc}\n\nStrong vs: ${unit.counters}\nWeak to: ${unit.counteredBy}`,
      buttons: [{ label: 'Close', kind: 'ghost', onTap: () => this.card.hide() }],
    });
  }

  /* ---- people ------------------------------------------------------------ */

  _openPerson(entry) {
    const res = talkTo(entry.id);
    const npc = entry.npc;
    const next = entry.nextReward;
    const body = `"${res.line}"\n\n`
      + `${'❤'.repeat(entry.hearts)}${'·'.repeat(10 - entry.hearts)}  ${entry.hearts}/10\n`
      + (next ? `At ${entry.hearts + 1} hearts: ${next.text}` : 'You could not be closer.');

    this.card.show({
      title: `${npc.name} — ${npc.role}`,
      body,
      buttons: [
        { label: 'Close', kind: 'ghost', onTap: () => this.card.hide() },
        {
          label: canGift(entry.id) ? 'Give a gift' : 'Gifted today',
          kind: 'primary',
          onTap: () => {
            this.card.hide();
            if (!canGift(entry.id)) { toast(`${npc.name} has had a gift today.`, 'bad'); return; }
            this.giftTarget = entry.id;
            this._open('gift');
          },
        },
      ],
    });
  }

  _doGift(entry) {
    const res = giveGift(this.giftTarget, entry.itemId);
    if (!res.ok) { toast(res.reason, 'bad'); return; }
    const npc = NPCS[this.giftTarget];
    const face = { loved: '💖', liked: '🙂', neutral: '😐', disliked: '😒' }[res.reaction];
    this.card.show({
      title: `${npc.name} ${face}`,
      body: `"${res.line}"\n\n${res.points > 0 ? '+' : ''}${res.points} affection`,
      buttons: [{
        label: 'Close', kind: 'primary',
        onTap: () => { this.card.hide(); this._open('people'); },
      }],
    });
  }

  /* ---- festival ---------------------------------------------------------- */

  _showFestival(festival) {
    const buttons = [{ label: 'Skip it', kind: 'ghost', onTap: () => this.card.hide() }];

    if (festival.kind === 'judging') {
      buttons.push({
        label: 'Enter best crop', kind: 'primary',
        onTap: () => { this.card.hide(); this._enterJudging(festival); },
      });
    } else if (festival.kind === 'arena') {
      buttons.push({
        label: 'Fight', kind: 'primary',
        onTap: async () => { this.card.hide(); await this._startArena(festival); },
      });
    } else {
      buttons.push({
        label: 'Attend', kind: 'primary',
        onTap: () => {
          const res = attend(festival.id);
          this.card.hide();
          if (!res.ok) toast(res.reason, 'bad');
        },
      });
    }

    this.card.show({ title: festival.name, body: `${festival.desc}\n\n${festival.blurb}`, buttons });
  }

  _enterJudging(festival) {
    // Pick the most valuable crop on hand automatically — nobody enters their
    // second-best turnip.
    const best = Object.entries(state.farm.inventory)
      .filter(([itemId, qty]) => qty > 0 && CROPS[itemId])
      .sort((a, b) => sellValue(b[0]) - sellValue(a[0]))[0];

    if (!best) { toast('You have no crops on hand to enter.', 'bad'); return; }
    const res = attend(festival.id, best[0]);
    if (!res.ok) toast(res.reason, 'bad');
    else {
      this.card.show({
        title: `${festival.name} — judged`,
        body: res.lines.join('\n'),
        buttons: [{ label: 'Close', kind: 'primary', onTap: () => this.card.hide() }],
      });
    }
  }

  async _startArena(festival) {
    const { arenaConfig } = await import('./festivals.js');
    const { TERRITORIES } = await import('../data/territories.js');
    const { startAssault } = await import('../battle/assault.js');

    const config = arenaConfig(festival.id);
    TERRITORIES[config.id] = config;

    const res = startAssault(config.id);
    if (!res.ok) { toast(res.reason, 'bad'); return; }
    // The arena loans you its budget outright.
    res.assault.gold = festival.effect.budget;

    const { DeployScene } = await import('../battle/deployScene.js');
    this.game.scenes.push(new DeployScene(this.game));
  }

  update(dt) {
    for (const b of Object.values(this.buttons)) b.update(dt);
  }

  /* ---- render ------------------------------------------------------------ */

  render(ctx, view) {
    this._layout(view);

    const grad = ctx.createLinearGradient(0, 0, 0, view.h);
    grad.addColorStop(0, '#26302c');
    grad.addColorStop(1, '#141a12');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, view.w, view.h);

    this._renderHeader(ctx, view);

    if (this.view === 'square') this._renderSquare(ctx, view);
    else if (this.view === 'people') this._renderPeople(ctx);
    else if (this.view === 'gift') this._renderGift(ctx);
    else this._renderShop(ctx);

    if (this.view === 'square') {
      this.buttons.people.render(ctx);
      this.buttons.farm.render(ctx);
    } else {
      this.buttons.back.render(ctx);
    }
    this.card.render(ctx, view);
  }

  _renderHeader(ctx, view) {
    const top = view.safeTop;
    ctx.fillStyle = 'rgba(18,24,15,.94)';
    ctx.fillRect(0, 0, view.w, top + 64);
    ctx.fillStyle = COLORS.panelEdge;
    ctx.fillRect(0, top + 63, view.w, 1);

    const title = this.view === 'square' ? 'COLDBROOK'
      : this.view === 'people' ? 'TOWNSFOLK'
      : this.view === 'gift' ? `A GIFT FOR ${NPCS[this.giftTarget]?.name.toUpperCase()}`
      : (SHOPS.find((s) => s.id === this.shopId)?.label ?? '').toUpperCase();

    text(ctx, title, 14, top + 20, { size: 15, color: COLORS.gold });
    text(ctx, `${seasonName()} ${state.meta.day}, Y${state.meta.year}`, 14, top + 42, {
      size: 12, color: COLORS.inkDim, weight: 500,
    });
    text(ctx, `${state.meta.gold.toLocaleString()}g`, view.w - 14, top + 26, {
      size: 17, color: COLORS.gold, align: 'right',
    });

    const festival = describeToday();
    if (festival && this.view === 'square') {
      text(ctx, `🎪 ${festival}`, view.w - 14, top + 48, {
        size: 10, color: COLORS.green, align: 'right', weight: 600, maxWidth: view.w - 120,
      });
    }
  }

  _renderSquare(ctx, view) {
    for (const card of this._shopCards(view)) {
      const npc = NPCS[card.shop.npc];
      const h = hearts(card.shop.npc);
      panel(ctx, card.x, card.y, card.w, card.h, { fill: COLORS.panelDeep });
      text(ctx, card.shop.icon, card.x + card.w / 2, card.y + 30, { size: 26, align: 'center' });
      text(ctx, card.shop.label, card.x + card.w / 2, card.y + 60, {
        size: 13, color: COLORS.ink, align: 'center', maxWidth: card.w - 12,
      });
      text(ctx, npc.name, card.x + card.w / 2, card.y + 78, {
        size: 11, color: npc.color, align: 'center', weight: 500,
      });
      text(ctx, npc.role, card.x + card.w / 2, card.y + 95, {
        size: 10, color: COLORS.inkFaint, align: 'center', weight: 500,
      });
      if (canGift(card.shop.npc)) {
        text(ctx, '🎁 gift ready', card.x + card.w / 2, card.y + card.h - 33, {
          size: 10, color: COLORS.gold, align: 'center', weight: 600,
        });
      }
      for (let i = 0; i < 5; i++) {
        drawHeart(ctx, card.x + card.w / 2 - 26 + i * 13, card.y + card.h - 14, 11, i < Math.ceil(h / 2));
      }
    }
  }

  _renderPeople(ctx) {
    this.list.render(ctx, (c, entry, x, y, w, h) => {
      const npc = entry.npc;
      fillRound(c, x, y, w, h, 10, COLORS.panelDeep);
      if (entry.giftable) strokeRound(c, x, y, w, h, 10, COLORS.gold, 1);

      text(c, npc.icon, x + 20, y + h / 2, { size: 22, align: 'center' });
      text(c, npc.name, x + 44, y + 18, { size: 15, color: npc.color });
      text(c, npc.role, x + 44, y + 36, { size: 11, color: COLORS.inkDim, weight: 500 });

      for (let i = 0; i < 10; i++) {
        drawHeart(c, x + 46 + i * 13, y + 56, 11, i < entry.hearts);
      }
      bar(c, x + w - 76, y + 52, 62, 5, entry.progress, { fill: COLORS.gold, r: 2 });

      if (entry.nextReward) {
        text(c, entry.nextReward.text, x + 44, y + h - 4, {
          size: 9, color: COLORS.inkFaint, weight: 500, maxWidth: w - 130,
        });
      }
      if (entry.giftable) {
        text(c, '🎁', x + w - 20, y + 20, { size: 15, align: 'center' });
      }
    });
  }

  _renderGift(ctx) {
    const npcId = this.giftTarget;
    const npc = NPCS[npcId];
    text(ctx, `Loves: ${npc.loves.map(itemName).join(', ')}`,
         this.contentRect.x, this.contentRect.y + 12, {
      size: 11, color: COLORS.gold, weight: 500, maxWidth: this.contentRect.w,
    });

    if (!this.list.items.length) {
      text(ctx, 'Nothing in your pack to give.', this.contentRect.x + this.contentRect.w / 2,
           this.contentRect.y + 80, { size: 13, color: COLORS.inkFaint, align: 'center', weight: 500 });
      return;
    }

    this.list.render(ctx, (c, entry, x, y, w, h) => {
      fillRound(c, x, y, w, h, 10, COLORS.panelDeep);
      const loved = npc.loves.includes(entry.itemId);
      const liked = npc.likes.includes(entry.itemId);
      const disliked = npc.dislikes.includes(entry.itemId);
      text(c, `${entry.item.icon ?? '•'} ${entry.item.name}`, x + 12, y + h / 2 - 8, {
        size: 14, color: COLORS.ink,
      });
      text(c, `×${entry.qty}`, x + 12, y + h / 2 + 12, {
        size: 11, color: COLORS.inkDim, weight: 500,
      });
      const tag = loved ? 'loves it' : liked ? 'likes it' : disliked ? 'dislikes it' : '';
      if (tag) {
        text(c, tag, x + w - 12, y + h / 2, {
          size: 11, align: 'right', weight: 600,
          color: loved ? COLORS.gold : liked ? COLORS.green : COLORS.rust,
        });
      }
    });
  }

  _renderShop(ctx) {
    const shop = SHOPS.find((s) => s.id === this.shopId);
    const npc = NPCS[shop.npc];
    text(ctx, `"${npc.desc}"`, this.contentRect.x, this.contentRect.y + 12, {
      size: 11, color: COLORS.inkDim, weight: 500, maxWidth: this.contentRect.w,
    });

    if (!this.list.items.length) {
      text(ctx, 'Nothing in stock.', this.contentRect.x + this.contentRect.w / 2,
           this.contentRect.y + 80, { size: 13, color: COLORS.inkFaint, align: 'center', weight: 500 });
      return;
    }

    this.list.render(ctx, (c, entry, x, y, w, h) => {
      fillRound(c, x, y, w, h, 10, COLORS.panelDeep);
      const gold = state.meta.gold;

      switch (entry.kind) {
        case 'seed': {
          const crop = entry.crop;
          c.globalAlpha = entry.inSeason ? 1 : 0.45;
          drawCrop(c, crop.art, x + 24, y + h - 10, 32, crop.stages - 1, crop.stages, crop.color);
          text(c, crop.name, x + 48, y + 18, { size: 14, color: COLORS.ink });
          text(c, entry.inSeason ? `${crop.growDays}d · sells ${crop.sellPrice}g`
                                 : `out of season (${crop.seasons.map((s) => seasonName(s)).join('/')})`,
               x + 48, y + 36, { size: 10, color: COLORS.inkDim, weight: 500 });
          if (entry.held) {
            text(c, `have ${entry.held}`, x + 48, y + 52, { size: 10, color: COLORS.green, weight: 500 });
          }
          text(c, `${entry.price}g`, x + w - 12, y + h / 2, {
            size: 15, color: gold >= entry.price ? COLORS.gold : COLORS.inkFaint, align: 'right',
          });
          c.globalAlpha = 1;
          break;
        }
        case 'animal': {
          drawAnimal(c, entry.animal.kind, x + 28, y + h - 12, 34);
          text(c, entry.animal.name, x + 56, y + 18, { size: 14, color: COLORS.ink });
          text(c, entry.animal.desc, x + 56, y + 38, {
            size: 10, color: COLORS.inkDim, weight: 500, maxWidth: w - 130,
          });
          const cap = animalCapacity()[entry.animal.building];
          text(c, `${animalCount(entry.animal.building)}/${cap} housed`, x + 56, y + 54, {
            size: 10, color: entry.room ? COLORS.green : COLORS.rust, weight: 600,
          });
          text(c, `${entry.price}g`, x + w - 12, y + h / 2, {
            size: 15, color: gold >= entry.price && entry.room ? COLORS.gold : COLORS.inkFaint,
            align: 'right',
          });
          break;
        }
        case 'info': {
          drawMech(c, entry.unit.id, x + 28, y + h - 10, h * 0.6, { team: 'ally', facing: -1 });
          text(c, entry.unit.name, x + 56, y + 18, { size: 14, color: COLORS.ink });
          text(c, `${entry.unit.role} · ${entry.unit.hp}hp · ${entry.unit.dps}dps`, x + 56, y + 38, {
            size: 10, color: COLORS.inkDim, weight: 500,
          });
          text(c, 'tap for details', x + 56, y + 54, { size: 9, color: COLORS.inkFaint, weight: 500 });
          text(c, `${entry.price}g`, x + w - 12, y + h / 2, {
            size: 14, color: COLORS.gold, align: 'right',
          });
          text(c, 'in battle', x + w - 12, y + h / 2 + 16, {
            size: 9, color: COLORS.inkFaint, align: 'right', weight: 500,
          });
          break;
        }
        case 'upgrade':
        case 'building': {
          text(c, `${entry.label} ${entry.level > 0 ? `(lv ${entry.level})` : ''}`, x + 12, y + 20, {
            size: 14, color: COLORS.ink,
          });
          text(c, entry.desc, x + 12, y + 40, {
            size: 10, color: COLORS.inkDim, weight: 500, maxWidth: w - 110,
          });
          text(c, `${entry.price}g`, x + w - 12, y + h / 2, {
            size: 15, color: gold >= entry.price ? COLORS.gold : COLORS.inkFaint, align: 'right',
          });
          break;
        }
        case 'buy':
        case 'sell': {
          const selling = entry.kind === 'sell';
          text(c, `${entry.item.icon} ${entry.item.name}`, x + 12, y + 20, {
            size: 14, color: COLORS.ink,
          });
          text(c, selling ? `you have ${entry.held}` : (entry.item.desc ?? ''), x + 12, y + 40, {
            size: 10, color: COLORS.inkDim, weight: 500, maxWidth: w - 110,
          });
          text(c, `${selling ? '+' : ''}${entry.price}g`, x + w - 12, y + h / 2, {
            size: 15, color: selling ? COLORS.green : (gold >= entry.price ? COLORS.gold : COLORS.inkFaint),
            align: 'right',
          });
          break;
        }
        case 'research': {
          const node = entry.node;
          c.globalAlpha = entry.owned ? 0.5 : 1;
          text(c, node.name, x + 12, y + 18, {
            size: 14, color: entry.owned ? COLORS.green : COLORS.ink,
          });
          text(c, node.desc, x + 12, y + 38, {
            size: 10, color: COLORS.inkDim, weight: 500, maxWidth: w - 110,
          });
          const items = Object.entries(node.items ?? {})
            .map(([id, q]) => `${q} ${itemName(id)}`).join(', ');
          text(c, items, x + 12, y + 54, { size: 9, color: COLORS.inkFaint, weight: 500 });
          text(c, entry.owned ? '✓ known' : `${node.gold}g`, x + w - 12, y + h / 2, {
            size: 14, align: 'right',
            color: entry.owned ? COLORS.green : entry.affordable ? COLORS.gold : COLORS.inkFaint,
          });
          c.globalAlpha = 1;
          break;
        }
        default:
          break;
      }
    });
  }

  back() {
    if (this.card.visible) { this.card.hide(); return true; }
    if (this.view !== 'square') { this._back(); return true; }
    return false;
  }
}
