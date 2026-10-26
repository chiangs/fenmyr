// Myra's icon names, and which icon of the current pack draws each one. The app only ever asks for the Myra name (icon('note')),
// so changing the icon pack means changing this file (or writing a new one) and running `npm run icons`: nothing in the app changes.
// Format: [myraName, packName, "extra search words"]. Names marked custom live in custom.js (Myra's own drawings, in both weights).
module.exports = {
  pack: { id: 'phosphor', name: 'Phosphor', package: '@phosphor-icons/core' },
  icons: [
    // the toolbar
    ['select', 'cursor', 'pointer arrow'],
    ['note', 'note', 'sticky card'],
    ['doc', 'file-text', 'document page'],
    ['checklist', 'list-checks', 'todo tasks'],
    ['title', 'text-t', 'heading big text'],
    ['collection', 'stack', 'group column pile'],
    ['canvas', 'frame-corners', 'board inside frame'],
    ['link', 'link', 'url web'],
    ['image', 'image', 'picture photo'],
    ['mic', 'microphone', 'voice memo audio record'],
    ['video', 'video-camera', 'film movie'],
    ['palette', 'palette', 'color paint swatch'],
    ['shapes', 'shapes', 'shape geometry'],
    ['stamp', 'stamp', 'sticker'],
    ['templates', 'layout', 'template layout'],
    ['pen', 'pen-nib', 'ink'],
    ['draw', 'pencil-simple-line', 'pencil sketch'],
    ['more', 'dots-three', 'menu overflow'],
    ['board-only', 'corners-out', 'just the board focus fullscreen'],
    ['missing', 'rectangle-dashed', 'placeholder unknown'],
  ],
};
