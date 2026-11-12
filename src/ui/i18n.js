// Interface strings in Sakha, English and Russian (written by hand), and the controls list.
export const LANGS = ['sah', 'en', 'ru'];
export const LANG_NAMES = { sah: 'Сахалыы', en: 'English', ru: 'Русский' };

export const T = {
  subtitle: { sah: 'Киин Саха сирин алааһыгар сайылык', en: 'a summer homestead in Central Yakutia', ru: 'летняя усадьба в алаасе Центральной Якутии' },
  loading: { sah: 'бэлэмнэнии…', en: 'loading…', ru: 'загрузка…' },
  preparing: { sah: 'бэлэмнэнии…', en: 'preparing…', ru: 'подготовка…' },
  clickToWalk: { sah: 'хаамарга баттаа', en: 'click to walk', ru: 'нажмите, чтобы начать' },
  tapToWalk: { sah: 'хаамарга баттаа', en: 'tap to walk', ru: 'нажмите, чтобы начать' }, // a phone
  paused: { sah: 'Тохтобул', en: 'Paused', ru: 'Пауза' },
  clickToReturn: { sah: 'Салгыырга баттаа', en: 'Click to continue', ru: 'Нажмите, чтобы продолжить' },
  settings: { sah: 'Туруоруулар', en: 'Settings', ru: 'Настройки' },
  controls: { sah: 'Салайыы', en: 'Controls', ru: 'Управление' },
  language: { sah: 'Тыл', en: 'Language', ru: 'Язык' },
  sens: { sah: 'Көрүү түргэнэ', en: 'Look speed', ru: 'Скорость обзора' },
  fov: { sah: 'Көрүү киэҥэ', en: 'Field of view', ru: 'Угол обзора' },
  volume: { sah: 'Дорҕоон', en: 'Volume', ru: 'Громкость' },
  quality: { sah: 'Хаачыстыба', en: 'Quality', ru: 'Качество' },
  qAuto: { sah: 'Авто', en: 'Auto', ru: 'Авто' },
  qMobile: { sah: 'Телефон', en: 'Phone', ru: 'Телефон' },
  qHigh: { sah: 'Үрдүк', en: 'High', ru: 'Высокое' },
  qMedium: { sah: 'Орто', en: 'Medium', ru: 'Среднее' },
  qLow: { sah: 'Намыһах', en: 'Low', ru: 'Низкое' },
  qCustom: { sah: 'Бэйэҥ', en: 'Custom', ru: 'Своё' },
  vMore: { sah: 'Сиһилии', en: 'Advanced', ru: 'Дополнительно' },
  vRes: { sah: 'Чуолкайа', en: 'Resolution', ru: 'Разрешение' },
  vResHint: { sah: 'Аҕыйах пиксел — түргэн, сымнаҕас хартыына', en: 'Fewer pixels: faster, softer picture', ru: 'Меньше пикселей — быстрее, мягче картинка' },
  vDynres: { sah: 'Уларыйар чуолкайа', en: 'Adaptive resolution', ru: 'Адаптивное разрешение' },
  vDynresHint: { sah: 'Хартыына хойутаатаҕына чуолкайа кыратык түһэр', en: 'Drops pixels for a moment when frames run late', ru: 'Ненадолго снижает разрешение, когда кадры опаздывают' },
  vFps: { sah: 'Кадр түргэнэ', en: 'Frame rate cap', ru: 'Предел частоты кадров' },
  vFpsHint: { sah: '60 — налыын, 30 — компьютеры харыстыыр', en: '60 is smoother, 30 spares the computer', ru: '60 — плавнее, 30 бережёт компьютер' },
  vShadow: { sah: 'Күлүк чуолкайа', en: 'Shadow detail', ru: 'Детализация теней' },
  vShadowHint: { sah: 'Чуолкай күлүк видеопамяты ылар', en: 'Sharper shadows take video memory', ru: 'Чёткие тени занимают видеопамять' },
  vShadowFar: { sah: 'Күлүк ырааҕа', en: 'Shadow distance', ru: 'Дальность теней' },
  vShadowFarHint: { sah: 'Хас ыраахха диэри күлүк түһэр', en: 'How far from you things cast shadows', ru: 'Как далеко от вас предметы отбрасывают тень' },
  vAo: { sah: 'Муннук күлүгэ', en: 'Ambient occlusion', ru: 'Затенение углов (AO)' },
  vAoHint: { sah: 'Муннукка уонна мал анныгар сымнаҕас күлүк', en: 'Soft shade in corners and under things', ru: 'Мягкая тень в углах и под предметами' },
  vAa: { sah: 'Кырыы сымнатыыта', en: 'Anti-aliasing', ru: 'Сглаживание' },
  vAaHint: { sah: 'TRAA — ордук сымнаҕас, FXAA — чэпчэки', en: 'TRAA is smoothest, FXAA is lighter', ru: 'TRAA — глаже, FXAA — легче' },
  vAaTaa: { sah: 'TRAA', en: 'Temporal (TRAA)', ru: 'Временное (TRAA)' },
  vAaFxaa: { sah: 'FXAA', en: 'Fast (FXAA)', ru: 'Быстрое (FXAA)' },
  vGrass: { sah: 'От хойуута', en: 'Grass density', ru: 'Густота травы' },
  vGrassHint: { sah: 'Чугастааҕы от уонна сибэккилэр', en: 'Blades of grass and flowers near you', ru: 'Травинки и цветы рядом с вами' },
  vDistance: { sah: 'Мас ырааҕа', en: 'Draw distance', ru: 'Дальность прорисовки' },
  vDistanceHint: { sah: 'Мастар хас ыраахха диэри толору көстөллөр', en: 'How far trees are drawn in full', ru: 'Как далеко деревья видны целиком' },
  vGlow: { sah: 'Сандаарыы', en: 'Glow', ru: 'Свечение' },
  vGlowHint: { sah: 'Уот уонна сырдык халлаан тула сандаарыы', en: 'Light bleeding round fire and bright sky', ru: 'Ореол вокруг огня и яркого неба' },
  vMirror: { sah: 'Күөлгэ көстүү', en: 'Lake reflection', ru: 'Отражение в озере' },
  vMirrorHint: { sah: 'Кытыл ууга көстөр; суох буоллаҕына — халлаан эрэ', en: 'The shore mirrored in the water; off: only the sky', ru: 'Берег в воде; без него — только небо' },
  vOn: { sah: 'Баар', en: 'On', ru: 'Вкл' },
  vOff: { sah: 'Суох', en: 'Off', ru: 'Выкл' },
  vNear: { sah: 'Чугас', en: 'Near', ru: 'Близко' },
  vFar: { sah: 'Ыраах', en: 'Far', ru: 'Далеко' },
  vFull: { sah: 'Толору', en: 'Full', ru: 'Полностью' },
  vMetres: { sah: 'м', en: 'm', ru: 'м' },
  qReload: { sah: 'Саҥалыы киирдэххэ үлэлиир', en: 'Applies after reload', ru: 'Применится после перезагрузки' },
  reload: { sah: 'Саҥалыы киир', en: 'Reload', ru: 'Перезагрузить' },
  invertY: { sah: 'Үөһэ-аллара тиэрт', en: 'Invert Y', ru: 'Инверсия по вертикали' },
  resume: { sah: 'Салгыы', en: 'Continue', ru: 'Продолжить' },
  exit: { sah: 'Таҕыс', en: 'Exit', ru: 'Выйти' },
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
    en: 'Alaas is free and open source. Every text, model and line of code is on GitHub: if you spot a mistake or want to improve something, open a ticket or a pull request there.',
    ru: 'Алаас — бесплатная игра с открытым кодом. Все тексты, модели и код лежат на GitHub: если вы нашли ошибку или хотите что-то улучшить, создайте там тикет или pull request.',
  },
  licence: {
    sah: 'Куод — MIT. Тиэкистэр уонна бырайыак бэйэтин текстуралара — CC BY-SA 4.0. Атын ааптардар хаартыскалара, текстуралара, тыастара уонна шрифтара бэйэлэрин лицензияларынан («Ааптардар» диэни көр). Springfolk аата уонна логотиба бу лицензияларга киирбэттэр.',
    en: 'Code: MIT. Texts and the project’s own textures: CC BY-SA 4.0. Photos, textures, sounds and fonts by others keep their own licences (see Credits). The Springfolk name and logo are not covered by these licences.',
    ru: 'Код — MIT. Тексты и собственные текстуры проекта — CC BY-SA 4.0. Чужие фотографии, текстуры, звуки и шрифты распространяются под своими лицензиями (см. «Авторы и источники»). Название и логотип Springfolk под эти лицензии не подпадают.',
  },
};

// what each control does: `keys` on a keyboard and mouse, `touch` the phone control (drawn by `glyph`, src/ui/icons.js)
export const CONTROLS = [
  { id: 'walk', keys: ['W', 'A', 'S', 'D'], touch: 'stick', label: { sah: 'Хаамыы', en: 'Walk', ru: 'Ходьба' } },
  { id: 'look', keys: ['mouse'], touch: 'drag', label: { sah: 'Эргиччи көрүү', en: 'Look around', ru: 'Осмотреться' } },
  { id: 'run', keys: ['Shift'], touch: 'rim', label: { sah: 'Сүүрүү', en: 'Run', ru: 'Бег' } },
  { id: 'jump', keys: ['Space'], touch: 'jump', label: { sah: 'Ыстаныы', en: 'Jump / vault', ru: 'Прыжок / перелезть' } },
  { id: 'crouch', keys: ['C'], touch: 'crouch', label: { sah: 'Бөкчөйүү', en: 'Crouch', ru: 'Присесть' } },
  { id: 'do', keys: ['mouseL'], touch: 'hand', label: { sah: 'Оҥор', en: 'Do, use', ru: 'Сделать, применить' } },
  { id: 'put', keys: ['mouseR'], touch: 'put', label: { sah: 'Уур', en: 'Set down, put back', ru: 'Положить, убрать' } },
  { id: 'read', keys: ['E'], touch: 'eye', label: { sah: 'Чугастык көр', en: 'Look closer', ru: 'Рассмотреть' } },
  { id: 'journal', keys: ['J'], touch: 'book', label: { sah: 'Бэлиэтээһин', en: 'Journal', ru: 'Дневник' } },
  { id: 'lang', keys: ['L'], label: { sah: 'Тыл', en: 'Language', ru: 'Язык' } },
  { id: 'fps', keys: ['F3'], label: { sah: 'Кадр түргэнэ', en: 'Frame rate', ru: 'Частота кадров' } },
  { id: 'pause', keys: ['P'], touch: 'pause', label: { sah: 'Тохтобул', en: 'Pause / settings', ru: 'Пауза / настройки' } }, // Esc pauses too, but drops the pointer lock (main.js)
];
export const control = (id) => CONTROLS.find((c) => c.id === id);

export const tr = (o, lang) => o?.[lang] || o?.en || '';

// First visit: the language from the browser's list. Sakha anywhere in it wins; then the first language:
// Russian for ru / be / uk, English for everything else.
export function detectLang(list = navigator.languages?.length ? navigator.languages : [navigator.language || '']) {
  const base = list.map((l) => String(l).toLowerCase().split(/[-_]/)[0]);
  if (base.includes('sah')) return 'sah';
  return ['ru', 'be', 'uk'].includes(base[0]) ? 'ru' : 'en';
}
