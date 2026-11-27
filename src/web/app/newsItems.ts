// What's new in Fenmyr: one card per version (each item: [icon name, title, a line about it]). It imports nothing, so
// the bridge can name the newest version when it runs in a browser.
export type NewsItem = [icon: string, title: string, line: string];
export const NEWS: Record<string, NewsItem[]> = {
  '1.0.0': [
    [
      'myra-tool',
      'Hello, I’m Myra',
      'I’m a cloudberry who lives in your boards, and I help you sort, plan and build ✦',
    ],
    [
      'palette',
      'Nordic colours',
      'Snow, Cloudberry, Lingonberry, Moss, Fjord, Heather and Birch for your cards, with warm amber shadows.',
    ],
  ],
  '1.1.0-beta.1': [
    [
      'code',
      'Prototypes',
      'Turn a board into a working app. Myra builds it from your cards, with a live preview, the code and git beside it.',
    ],
    [
      'myra-chat',
      'Myra shows her work',
      'See what she reads, say yes to her plans, stop her with Ctrl+., and undo a whole reply at once.',
    ],
    [
      'squares-four',
      'A new layout',
      'The tools sit at the top right, the bottom bar is centred, and a bar floats over whatever you select.',
    ],
    [
      'cloud-sun',
      'Six themes',
      'Midsummer, Clear, Polar Night and Lantern join Default. Clear and Lantern are made for accessibility.',
    ],
  ],
};
