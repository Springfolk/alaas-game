// The journal's work log: each job, the thing it is done at (`find`, among the interactables), its glyph and what
// the save has counted of it (`made`: [glyph, count, unit]; `save.work`, written by Work.count). Plain data: the
// journal (src/ui/journal.js) draws it.
const L = (sah, en, ru) => ({ sah, en, ru });

export const WORKS = [
  {
    id: 'split', name: L('Мас хайытыы', 'Splitting firewood', 'Колка дров'), entry: 'ottuk-mas',
    find: (i) => i.rounds, icon: 'axe',
    done: (w) => w.rounds > 0,
    made: (w) => [['round', w.rounds || 0], ['log', w.billets || 0], ['stack', w.stacked || 0]],
  },
  {
    id: 'fish', name: L('Туу', 'The fish trap', 'Верша'), entry: 'tuu',
    find: (i) => i.gap, icon: 'trap',
    done: (w) => w.mundu > 0,
    made: (w) => [['fish', w.mundu || 0]],
  },
  {
    id: 'hay', name: L('От охсуу', 'Mowing', 'Покос'), entry: 'hay-making',
    find: (i) => i.thing?.kind === 'scythe' || /scythe post/.test(i.label?.en || ''), icon: 'scythe',
    done: (w) => w.mown > 0,
    made: (w) => [['scythe', Math.round(w.mown || 0), ' m²']],
  },
  {
    id: 'tuos', name: L('Туос үлэтэ: тордуйа', 'Birch-bark work: a torduya', 'Работа с берестой: тордуйа'), entry: 'birch-bark',
    find: (i) => i.bark, icon: 'fold',
    done: (w) => w.torduya > 0,
    made: (w) => [['fold', w.torduya || 0], ['berry', w.berries || 0]],
  },
  {
    id: 'gather', name: L('Хаппыт мас хомуйуу', 'Gathering dry wood', 'Сбор сушняка'), entry: 'ottuk-mas',
    find: (i) => i.drywood !== undefined, icon: 'log',
    done: (w) => w.drywood > 0,
    made: (w) => [['log', w.drywood || 0]],
  },
  {
    id: 'forge', name: L('Уус кыһата', 'At the forge', 'У горна'), entry: 'blacksmith',
    find: (i) => i.act?.id === 'forge', icon: 'hammer',
    done: (w) => w.hammer > 0,
    made: (w) => [['hammer', w.hammer || 0], ['check', w.blades || 0]],
  },
  {
    id: 'kymys', name: L('Кымыһы хамнатыы', 'Churning kymys', 'Взбивание кумыса'), entry: 'kymys',
    find: (i) => i.act?.id === 'churn', icon: 'churn',
    done: (w) => w.churn > 0,
    made: (w) => [['churn', w.churn || 0], ['cup', w.kymys || 0]],
  },
];
