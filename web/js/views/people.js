// People you make for: measurements, preferences, allergies, birthdays.
// Hats, garments and gifts all start from somebody's numbers.

import { h, mount, btn, field, input, numberInput, textarea, modal, toast, empty, confirmDialog } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as store from '../core/store.js';
import { go } from '../core/router.js';
import { dateInput, parseDateInput, daysUntil } from '../core/util.js';
import { HEADS } from '../crochet/calc.js';
import { avatar, statusChip, unitLabel } from './common.js';

// Measurements are stored in inches and shown in the user's units.
export const MEASUREMENTS = [
  ['head', 'Head circumference'],
  ['neck', 'Neck'],
  ['chest', 'Chest / bust'],
  ['waist', 'Waist'],
  ['hips', 'Hips'],
  ['arm', 'Arm length'],
  ['wrist', 'Wrist'],
  ['hand', 'Hand circumference'],
  ['foot', 'Foot length'],
];

const cmMode = () => store.settings().units === 'cm';
const show = (inches) => (inches ? Number((cmMode() ? inches * 2.54 : inches).toFixed(1)) : null);
const store_ = (v) => (v ? (cmMode() ? v / 2.54 : v) : null);

/** Next birthday as a timestamp this year or next. */
export function nextBirthday(t) {
  if (!t) return null;
  const b = new Date(t);
  const now = new Date();
  let next = new Date(now.getFullYear(), b.getMonth(), b.getDate(), 12);
  if (daysUntil(next.getTime()) < 0) next = new Date(now.getFullYear() + 1, b.getMonth(), b.getDate(), 12);
  return next.getTime();
}

export function peopleTab(root) {
  const content = h('div');
  root.append(content);
  const draw = () => {
    const people = store.all('people').sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const projects = store.all('projects');
    const soon = people.filter((p) => p.birthday && daysUntil(nextBirthday(p.birthday)) <= 60).sort((a, b) => nextBirthday(a.birthday) - nextBirthday(b.birthday));
    mount(content,
      h('div.row.wrap', { style: { marginBottom: '14px' } },
        h('p.soft.grow', { style: { margin: 0 } }, 'The people you make for, with the measurements that matter: head for hats, chest for sweaters, foot for socks.'),
        btn('Add a person', () => personModal(), { kind: 'primary', ico: 'plus' })),
      soon.length ? h('div.note', { style: { marginBottom: '14px' } }, icon('calendar'), h('span', soon.map((p) => {
        const d = daysUntil(nextBirthday(p.birthday));
        return `${p.name}’s birthday ${d === 0 ? 'is today' : `in ${d} days`}`;
      }).join(' · '))) : null,
      people.length ? h('div.grid', people.map((p) => {
        const made = projects.filter((x) => x.recipient && x.recipient.trim().toLowerCase() === (p.name || '').trim().toLowerCase());
        const known = MEASUREMENTS.filter(([k]) => p.m?.[k]);
        return h('div.card.link', { onClick: () => personModal(p), role: 'button', tabindex: 0 },
          h('div.row', avatar(p.name, p.color || '#5c7a57'), h('div.grow', h('h3', p.name), h('div.muted', { style: { fontSize: '13px' } }, p.relation || '—'))),
          p.avoid ? h('div.note.warn', { style: { marginTop: '10px', fontSize: '13px' } }, icon('alert'), h('span', `Avoid: ${p.avoid}`)) : null,
          known.length ? h('div.chips', { style: { marginTop: '10px' } }, known.slice(0, 5).map(([k, label]) => h('span.chip', `${label.split(' ')[0]} ${show(p.m[k])} ${unitLabel()}`))) : h('p.muted', { style: { fontSize: '13px', marginTop: '10px' } }, 'No measurements yet'),
          made.length ? h('div.muted', { style: { fontSize: '12.5px', marginTop: '10px' } }, `Made for them: ${made.map((x) => x.name).join(', ')}`) : null);
      })) : empty('users', 'Nobody here yet', 'Add the people you crochet for and keep their sizes handy: hats, mittens and sweaters that actually fit.', btn('Add a person', () => personModal(), { kind: 'primary', ico: 'plus' })));
  };
  draw();
  return store.on('people', draw);
}

export async function personModal(person = null) {
  const p = person ? structuredClone(person) : { name: '', m: {}, color: '#5c7a57' };
  p.m = p.m || {};
  const u = unitLabel();
  const projects = person ? store.all('projects').filter((x) => x.recipient && x.recipient.trim().toLowerCase() === person.name.trim().toLowerCase()) : [];
  const res = await modal({
    title: person ? person.name : 'Add a person',
    wide: true,
    body: h('div.stack',
      h('div.fields.wide',
        field('Name', input({ value: p.name, maxlength: 60, onInput: (e) => { p.name = e.target.value; } })),
        field('Who they are', input({ value: p.relation || '', placeholder: 'Niece, customer, me…', onInput: (e) => { p.relation = e.target.value; } })),
        field('Birthday', input({ type: 'date', value: dateInput(p.birthday), onChange: (e) => { p.birthday = parseDateInput(e.target.value); } }))),
      h('div.field-label', `Measurements (${u})`),
      h('div.fields', MEASUREMENTS.map(([k, label]) => field(label, numberInput(show(p.m[k]), (v) => { p.m[k] = store_(v); }, { min: 0, step: 0.25 }), k === 'head' ? `Adult average ${cmMode() ? '56' : '22'} ${u}` : null))),
      h('div.fields.wide',
        field('Favorite colors', input({ value: p.likes || '', placeholder: 'Mustard, forest green, nothing pink', onInput: (e) => { p.likes = e.target.value; } })),
        field('Avoid', input({ value: p.avoid || '', placeholder: 'Wool (itchy), mohair, bright white', onInput: (e) => { p.avoid = e.target.value; } }))),
      field('Notes', textarea(p.notes, (v) => { p.notes = v; }, { rows: 2 })),
      projects.length ? h('div', h('div.field-label', { style: { marginBottom: '6px' } }, 'Made for them'), h('div.list', projects.map((x) => h('a.list-row', { href: `#/plan/projects/${x.id}` }, statusChip(x.status), h('div.grow', x.name))))) : null),
    actions: [
      person ? { label: 'Delete', kind: 'danger', value: 'delete', ico: 'trash' } : null,
      person && p.m.head ? { label: 'Design a hat', kind: 'ghost', value: 'hat', ico: 'sparkle' } : null,
      { label: 'Cancel', kind: 'ghost', value: null },
      { label: 'Save', kind: 'primary', value: 'save' },
    ].filter(Boolean),
  });
  if (res === 'save' || res === 'hat') {
    if (!p.name.trim()) {
      toast('Give them a name first.');
      return null;
    }
    const saved = await store.put('people', p);
    if (res === 'hat') go(`/imagine/hats?person=${saved.id}`);
    return saved;
  }
  if (res === 'delete' && (await confirmDialog(`Remove ${person.name}?`, 'Their measurements will be deleted. Projects made for them are kept.', { ok: 'Remove', danger: true }))) {
    await store.remove('people', person.id);
  }
  return null;
}

/** Hat size presets plus anyone with a head measurement. */
export function headOptions() {
  const people = store.all('people').filter((p) => p.m?.head);
  return [...people.map((p) => [`person:${p.id}`, `${p.name} (${show(p.m.head)} ${unitLabel()})`]), ...HEADS.map((x) => [x.name, x.name])];
}
