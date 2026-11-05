// Prism highlights every element with a language- class on the page as soon as it loads, unless told first that
// it's driven by hand. Only the code pane uses it, so this runs before Prism does.
Reflect.set(window, 'Prism', { manual: true, disableWorkerMessageHandler: true });
