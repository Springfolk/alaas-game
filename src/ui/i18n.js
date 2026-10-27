// Interface strings in Sakha, English and Russian (written by hand), and the controls list.
export const LANGS = ['sah', 'en', 'ru'];
export const LANG_NAMES = { sah: 'Сахалыы', en: 'English', ru: 'Русский' };

export const T = {
  subtitle: { sah: 'Киин Саха сирин алааһыгар сайылык', en: 'a summer homestead in Central Yakutia', ru: 'летняя усадьба в аласе Центральной Якутии' },
  loading: { sah: 'бэлэмнэнии…', en: 'loading…', ru: 'загрузка…' },
  preparing: { sah: 'бэлэмнэнии…', en: 'preparing…', ru: 'подготовка…' },
  clickToWalk: { sah: 'хаамарга баттаа', en: 'click to walk', ru: 'нажмите, чтобы начать' },
  paused: { sah: 'Тохтобул', en: 'Paused', ru: 'Пауза' },
  clickToReturn: { sah: 'Салгыырга баттаа', en: 'Click to continue', ru: 'Нажмите, чтобы продолжить' },
  settings: { sah: 'Туруоруулар', en: 'Settings', ru: 'Настройки' },
  controls: { sah: 'Салайыы', en: 'Controls', ru: 'Управление' },
  language: { sah: 'Тыл', en: 'Language', ru: 'Язык' },
  sens: { sah: 'Көрүү түргэнэ', en: 'Mouse sensitivity', ru: 'Чувствительность мыши' },
  fov: { sah: 'Көрүү киэҥэ', en: 'Field of view', ru: 'Угол обзора' },
  volume: { sah: 'Дорҕоон', en: 'Volume', ru: 'Громкость' },
  quality: { sah: 'Хаачыстыба', en: 'Quality', ru: 'Качество' },
  qAuto: { sah: 'Авто', en: 'Auto', ru: 'Авто' },
  qMobile: { sah: 'Телефон', en: 'Phone', ru: 'Телефон' },
  qHigh: { sah: 'Үрдүк', en: 'High', ru: 'Высокое' },
  qMedium: { sah: 'Орто', en: 'Medium', ru: 'Среднее' },
  qLow: { sah: 'Намыһах', en: 'Low', ru: 'Низкое' },
  qReload: { sah: 'Саҥалыы киирдэххэ үлэлиир', en: 'Applies after reload', ru: 'Применится после перезагрузки' },
  reload: { sah: 'Саҥалыы киир', en: 'Reload', ru: 'Перезагрузить' },
  invertY: { sah: 'Үөһэ-аллара тиэрт', en: 'Invert Y', ru: 'Инверсия по вертикали' },
  showHints: { sah: 'Салайыыны көрдөр', en: 'Show controls on screen', ru: 'Подсказки на экране' },
  resume: { sah: 'Салгыы', en: 'Continue', ru: 'Продолжить' },
  gView: { sah: 'Көрүү', en: 'View', ru: 'Обзор' },
  gSound: { sah: 'Дорҕоон', en: 'Sound', ru: 'Звук' },
  gGraphics: { sah: 'Хартыына', en: 'Graphics', ru: 'Графика' },
  motion: { sah: 'Камера хамсааһына', en: 'Camera motion', ru: 'Движение камеры' },
  smooth: { sah: 'Көрүү намчыта', en: 'Look smoothing', ru: 'Плавность обзора' },
  battery: { sah: 'Батарейканы харыстааһын', en: 'Battery saver', ru: 'Экономия батареи' },
  readMore: { sah: 'Сиһилии', en: 'Read more', ru: 'Подробнее' },
  about: { sah: 'Оонньуу туһунан', en: 'About', ru: 'Об игре' },
  openSource: { sah: 'Аһаҕас куод — GitHub', en: 'Open source on GitHub', ru: 'Открытый код на GitHub' },
  credits: { sah: 'Ааптардар', en: 'Credits', ru: 'Авторы и источники' },
  issue: { sah: 'Алҕаһы буллуҥ дуо? GitHub-ка суруй', en: 'Found a mistake? Open a ticket on GitHub', ru: 'Нашли ошибку? Сообщите на GitHub' },
  aboutText: {
    sah: 'Алаас — босхо, аһаҕас куодтаах оонньуу. Тиэкистэрэ, моделлара уонна куода бары GitHub-ка сыталлар. Алҕаһы буллаххына эбэтэр тугу эмит көннөрүөххүн баҕарар буоллаххына, онно суруй.',
    en: 'Алаас is free and open source. Every text, model and line of code is on GitHub: if you spot a mistake or want to improve something, open a ticket or a pull request there.',
    ru: 'Алаас — бесплатная игра с открытым кодом. Все тексты, модели и код лежат на GitHub: если вы нашли ошибку или хотите что-то улучшить, создайте там тикет или pull request.',
  },
  licence: {
    sah: 'Куод — MIT. Тиэкистэр уонна бырайыак бэйэтин текстуралара — CC BY-SA 4.0. Атын ааптардар хаартыскалара, текстуралара, тыастара уонна шрифтара бэйэлэрин лицензияларынан («Ааптардар» диэни көр). Springfolk аата уонна логотиба бу лицензияларга киирбэттэр.',
    en: 'Code: MIT. Texts and the project’s own textures: CC BY-SA 4.0. Photos, textures, sounds and fonts by others keep their own licences (see Credits). The Springfolk name and logo are not covered by these licences.',
    ru: 'Код — MIT. Тексты и собственные текстуры проекта — CC BY-SA 4.0. Чужие фотографии, текстуры, звуки и шрифты распространяются под своими лицензиями (см. «Авторы и источники»). Название и логотип Springfolk под эти лицензии не подпадают.',
  },
};

// [keys, label]
export const CONTROLS = [
  ['W A S D', { sah: 'Хаамыы', en: 'Walk', ru: 'Ходьба' }],
  [{ sah: 'Мышь', en: 'Mouse', ru: 'Мышь' }, { sah: 'Эргиччи көрүү', en: 'Look around', ru: 'Осмотреться' }],
  ['Shift', { sah: 'Сүүрүү', en: 'Run', ru: 'Бег' }],
  ['Space', { sah: 'Ыстаныы', en: 'Jump / vault', ru: 'Прыжок / перелезть' }],
  ['C', { sah: 'Бөкчөйүү', en: 'Crouch', ru: 'Присесть' }],
  ['E', { sah: 'Чугастык көр / оҥор', en: 'Look closer / do', ru: 'Рассмотреть / сделать' }],
  ['1 2 3', { sah: 'Талыы', en: 'Choose', ru: 'Выбор' }],
  ['J', { sah: 'Бэлиэтээһин', en: 'Journal', ru: 'Дневник' }],
  ['L', { sah: 'Тыл', en: 'Language', ru: 'Язык' }],
  ['H', { sah: 'Салайыы', en: 'Controls', ru: 'Управление' }],
  ['F3', { sah: 'Кадр түргэнэ', en: 'Frame rate', ru: 'Частота кадров' }],
  ['P', { sah: 'Тохтобул', en: 'Pause / settings', ru: 'Пауза / настройки' }], // Esc pauses too, but drops the pointer lock (main.js)
];

export const tr = (o, lang) => o?.[lang] || o?.en || '';

// First visit: the language from the browser's list. Sakha anywhere in it wins; then the first language:
// Russian for ru / be / uk, English for everything else.
export function detectLang(list = navigator.languages?.length ? navigator.languages : [navigator.language || '']) {
  const base = list.map((l) => String(l).toLowerCase().split(/[-_]/)[0]);
  if (base.includes('sah')) return 'sah';
  return ['ru', 'be', 'uk'].includes(base[0]) ? 'ru' : 'en';
}
