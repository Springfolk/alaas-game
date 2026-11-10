// The journal's work log: each job, where it is done and what the save has counted of it (`save.work`, written
// by Work.count). Plain data: the journal (src/ui/ui.js) draws it.
const L = (sah, en, ru) => ({ sah, en, ru });

export const WORKS = [
  {
    id: 'split', name: L('Мас хайытыы', 'Splitting firewood', 'Колка дров'), entry: 'ottuk-mas',
    where: L('Кыстаммыт мас аттыгар: төҥүргэс, сүгэ, чурбааннар.', 'By the woodpile: the block, the axe, the rounds.', 'У поленницы: колода, топор, чурбаки.'),
    done: (w) => w.rounds > 0,
    stat: (w) => L(`${w.rounds || 0} чурбаан · ${w.billets || 0} оттук мас · ${w.stacked || 0} кыстанна`,
      `${w.rounds || 0} rounds · ${w.billets || 0} billets · ${w.stacked || 0} stacked`,
      `чурбаков: ${w.rounds || 0} · поленьев: ${w.billets || 0} · сложено: ${w.stacked || 0}`),
  },
  {
    id: 'fish', name: L('Туу', 'The fish trap', 'Верша'), entry: 'tuu',
    where: L('Күөл чычааһыгар: быһыт, туу, тымтай.', 'In the lake shallows: the weir, the trap, the carrier.', 'На мелководье озера: запруда, верша, короб.'),
    done: (w) => w.mundu > 0,
    stat: (w) => L(`${w.mundu || 0} мунду`, `${w.mundu || 0} мунду caught`, `поймано мунду: ${w.mundu || 0}`),
  },
  {
    id: 'hay', name: L('От охсуу', 'Mowing', 'Покос'), entry: 'hay-making',
    where: L('Ходуһа күрүөтүн аттыгар: баҕанаҕа ыйаммыт саха хотуура.', 'By the meadow fence: the Sakha scythe hung on its post.', 'У изгороди покоса: якутская коса на столбе.'),
    done: (w) => w.mown > 0,
    stat: (w) => L(`${Math.round(w.mown || 0)} м² от охсулунна · ${w.blows || 0} охсуу`, `${Math.round(w.mown || 0)} m² mown · ${w.blows || 0} blows`, `скошено ${Math.round(w.mown || 0)} м² · ударов: ${w.blows || 0}`),
  },
  {
    id: 'forge', name: L('Уус кыһата', 'At the forge', 'У горна'), entry: 'blacksmith',
    where: L('Кыһаҕа: күөрт, кытарбыт тимир, кыстык, өтүйэ.', 'In the smithy: the bellows, the glowing iron, the anvil, the hammer.', 'В кузне: мехи, раскалённое железо, наковальня, молот.'),
    done: (w) => w.hammer > 0,
    stat: (w) => L(`${w.hammer || 0} охсуу · ${w.blades || 0} быһах тимирэ`, `${w.hammer || 0} hammer blows · ${w.blades || 0} blades forged`, `ударов молота: ${w.hammer || 0} · клинков: ${w.blades || 0}`),
  },
  {
    id: 'kymys', name: L('Кымыһы хамнатыы', 'Churning kymys', 'Взбивание кумыса'), entry: 'kymys',
    where: L('Ураһаҕа: симиир, хамнатар.', 'In the uraha: the leather sack and its dasher.', 'В урасе: кожаный симиир и мутовка.'),
    done: (w) => w.churn > 0,
    stat: (w) => L(`${w.churn || 0} охсуу · ${w.kymys || 0} төгүл күүгэннирдэ`, `${w.churn || 0} strokes · foamed ${w.kymys || 0} times`, `ударов: ${w.churn || 0} · запенился раз: ${w.kymys || 0}`),
  },
];
