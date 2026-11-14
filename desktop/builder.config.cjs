// electron-builder: installers into desktop/out/, the version taken from the game's package.json.
// Unsigned: macOS gets an ad-hoc signature (first launch through right-click → Open), Windows shows SmartScreen.
const { version } = require('../package.json');

module.exports = {
  appId: 'co.springfolk.alaas',
  productName: 'Alaas',
  copyright: '© Springfolk. Code MIT, content CC BY-SA 4.0.',
  extraMetadata: { version },
  directories: { output: 'out', buildResources: '.' },
  files: ['main.js', 'package.json'],
  extraResources: [{ from: '../dist', to: 'dist', filter: ['**/*', '!viewer.html', '!sw.js', '!offline.json', '!**/.DS_Store'] }],
  icon: 'icon.png',
  electronLanguages: ['en', 'ru'],
  artifactName: 'Alaas-${version}-${os}-${arch}.${ext}',
  mac: { target: [{ target: 'dmg', arch: ['arm64', 'x64'] }], category: 'public.app-category.education', identity: '-', hardenedRuntime: false },
  win: { target: [{ target: 'nsis', arch: ['x64'] }] },
  nsis: { oneClick: true, perMachine: false },
  linux: { target: [{ target: 'AppImage', arch: ['x64'] }], category: 'Education' },
};
