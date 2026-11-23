// The desktop app needs its 'native' class before the first paint, or that frame has no room for the window buttons, so this
// loads first in the head and not with the page's own script at the end of the body.
if (window.fenmyrHost) document.documentElement.classList.add('native', window.fenmyrHost.platform || 'linux');
