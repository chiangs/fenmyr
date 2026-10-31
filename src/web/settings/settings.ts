// @ts-nocheck

// ---------- settings: Myra's color and greeting, her helpers, how the board looks ----------
// Myra's colors: a cloudberry as it ripens, plus a couple of playful ones. B body, S bead shine, D seams and shade
export const MYRA_COLORS = {
  golden: { B: '#f6a63c', S: '#ffe0a0', D: '#de8526' },
  honey: { B: '#ffc74a', S: '#fff1bd', D: '#e39d1d' },
  amber: { B: '#e88a24', S: '#ffd08a', D: '#b8621a' },
  blush: { B: '#ff9d7a', S: '#ffe1d3', D: '#e0684a' },
  unripe: { B: '#e2553c', S: '#ffb5a3', D: '#b33a25' },
  moss: { B: '#8fc65a', S: '#e4f4c4', D: '#5c9a35', L: '#2f9e72', l: '#1f6e50' },
  frost: { B: '#9cc7ea', S: '#e3f1fc', D: '#5f97c9' },
  night: { B: '#4a4f7a', S: '#8d93c9', D: '#2b2e4f' },
};
export let settings;
export function init25() {
  settings = Object.assign(
    {
      defaultFont: '',
      iconStyle: 'regular',
      winButtons: false,
      webAccess: false,
      caelestia: true,
      autoUpdate: true,
      panelH: {},
      myraName: '',
      myraCalm: 'lively',
      myraChar: true,
      tbSize: 'm',
      dblNote: true,
      wLayers: true,
      wColors: true,
      wDesign: true,
      wTray: true,
      myra: 'golden',
      greet: true,
      grid: true,
      tilt: true,
      motion: true,
      keys: true,
      theme: 'system',
      chat: 'normal',
      emoji: true,
      noteColor: 'random',
      snap: false,
      ai: true,
      mobbin: true,
      higgs: true,
      chatKeep: 'board',
      chatMax: '60',
      cursor: '#f6b45e',
      fancyCursor: true,
      colors: { light: {}, dark: {} },
    },
    (() => {
      try {
        return JSON.parse(localStorage.getItem('fenmyr:settings') || '{}');
      } catch (e) {
        return {};
      }
    })(),
  );
}
