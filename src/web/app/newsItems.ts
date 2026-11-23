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
};
