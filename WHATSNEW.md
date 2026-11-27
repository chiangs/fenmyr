# What's new in Fenmyr

Each update gets short lines here. Fenmyr shows the new ones in Settings when an update is ready.
Write them for people, not for code: one line each, saying what changed and why it helps.

## December 2026 · 1.1.0-beta.1

- Turn a board into a prototype: Myra builds a working React and Tailwind app from its cards through Claude Code, and every build can be undone.
- A prototype board shows the board, a live preview at phone, tablet or desktop width, the code and Myra's chat side by side.
- Point at anything in the preview to open the line of code that draws it, and the code links back to the cards it came from.
- Controls above the preview change a prototype's values as you watch, and the camera puts a picture of the preview on the board, tied to the commit it shows.
- Each prototype board has its own rules and design cards, which every build reads. On an older prototype board, Myra offers to add them.
- Each build shows what it read, what was left out to fit, which files it changed, and whether the preview runs without errors.
- The git bar commits, pushes and pulls a prototype, and Myra explains each step in plain words and asks first.
- Link a project to a GitHub repo or put it on a new one, and set up git and the GitHub sign-in in Settings → Connections.
- Start a prototype from a wireframe screen, from Templates, or by asking Myra.
- Myra sees shows what goes with your next message, and + Add hands her pictures, text files or vault notes.
- The Board chip shows how much room your board takes in Myra's next message, and a reply says when the board had to be trimmed to fit.
- After a reply, see what Myra changed, show it on the board, and undo the whole reply at once. The notes and pages she read are links.
- Before she changes more than ten cards, or removes any, Myra draws her plan on the board in dashed lines and waits for your yes. Skip plans turns that off until Fenmyr closes.
- While Myra works, the send button turns into Stop, and Ctrl+. stops her too, along with a prototype's builds.
- Choose Myra's model and effort from the pill under her input. Default keeps your own Claude Code settings.
- Expand Myra's input, keep a draft on each board, and paste long text as a chip she reads as a file.
- Myra's chat opens with ideas drawn from your board, and she makes boards, folders and projects from plain words, or with /project, /folder, /board and /template.
- Writing meant to be kept, such as a plan or a summary, goes on the board as a doc.
- Myra has a look for each kind of work, with a prop that stays while she works, and reacts to what just happened.
- The tools sit in a panel at the top right, and the bottom bar is centred, with zoom and Ask Myra.
- The selection bar floats over what you select, and F10 reaches it from the keyboard.
- Press W and pick a device for a wireframe screen, and the Pieces picker opens beside a selected screen. The Wireframe panel is gone.
- New keys: Alt+T for Templates, Alt+C for Canvas, O for Colour and Alt+I for Icon. Settings → Layout shows each tool's key.
- The selection bar tells Fill, Colour and Stroke apart, and adds No stroke and Default.
- Find matches every word a card shows, labels and formatted notes included.
- Dragging, zooming and editing are about a third faster on big boards, and a big board no longer fails to reach Myra.
- Four new themes: Midsummer and Clear for light, and Polar Night and Lantern for dark. Choose one for each mode in Settings → Appearance.
- Clear and Lantern hold AAA contrast, outline the cards, sit them straight, print each note's colour name and thicken the focus ring. Settings → Appearance → Accessibility switches each of the last three.
- Follow Caelestia also takes the text, accent, focus and card colours from your desktop.
- Settings has seven tabs: General, Appearance, Layout, Board, Myra, Connections and About. Helpers and Vaults are now under Connections, and Grid shape is one setting, with None.
- Every tooltip has the same look.
- Export a board, a folder or a whole project as a zip, and open it on another computer.
- + Project asks how its first board starts: blank, the example board or a template.
- An overdue note gets its own icon and the word Overdue, and a collection's header can show how many cards it holds.
- Cards are named by their colour for screen readers.
- A card made by a newer Fenmyr is kept as it is when this one saves the board, so a board from a newer version stays whole.
- Only Fenmyr's own window can use the microphone, clipboard and notifications, and a prototype's preview runs on its own locked-down page.
- An install from the code chooses Stable, Beta or Every change in Settings → About, which also shows the commit Fenmyr was built from.
- On a Mac, shortcuts read as ⌘, and installing from the code builds Fenmyr on your Mac.

## October 2026 · 1.0.0

- Meet Myra, a small cloudberry who helps on your boards.
- Press W or the Wireframe button for a screen. Select it and choose Pieces to add parts. The Wireframe panel's tools now sit in the bar.
- Type **/** in Myra's chat to see what she can do without thinking, such as `/find`, `/tag`, `/tidy` and `/fit`.
- **Ctrl+F** finds things on the board, with a bar to change the words and step through matches.
- Paste a picture into a note, and it lands on the board as its own connected card.
- Cards that go to Unsorted together come back together, with their connectors.
- Set a timer with `/timer 25 write the intro` or plain words. Myra warns you at two minutes and celebrates when it ends.
- Ask Myra to move with `/animate` or plain words. She also perches by the chat box while you talk.
- Tell Myra your birthday, and she celebrates on the day.
- Nordic card colours, warm amber shadows, squircle corners and crisp card edges.
- New fonts: Figtree, with Shantell Sans for handwritten touches.
- Your cursor and its name tag wear Myra's colour.
- Fenmyr follows your Caelestia colours and light or dark mode, and updates itself when you quit.
- New icons everywhere, with a plain or Duotone bottom bar (Settings → General → Icon style).
- Myra can search the web and read public pages once you switch it on (Settings → Helpers).
- Two new starter boards, OKRs and opportunities, and Product kickoff.
- A new first board shows ideas ripening into a plan. You can skip it at setup or add it later from Settings.
- Connect an Obsidian vault read-only, choose what each project or board may read, and add notes as cards with Alt+N. Off-limits folders and #private notes are never read.
- Ask Myra about your notes once you switch on "read with AI" for a vault. She tells you which notes she read.
- Tags on notes: type #word or use the bar. Tags stay apart from your words, and Myra uses them.
- Saved chats: New chat keeps the conversation, and History brings back any of the last 10.
- Connectors take a colour and a weight, and the next one you draw starts the same way.
- Kanban: columns you can name, with counts and limits, from the template picker.
- Save a selection or board as your own template, and choose whether it adds to a board or opens a new one.
- Set a default font for board text and docs (Settings → Board → Default font).
- Ctrl+, opens Settings. Window buttons stay off unless you want them.
- A bigger wireframe panel with groups that fold, a search box and many new elements.
- Myra has a dry wit. How much shows depends on Settings → Myra → How chatty she is.
- With emojis off, Myra never uses them.
- Give a note a due date in the bar or by asking Myra. A chip shows on the note, and Myra reminds you, even for notes on other boards.
- `/due` shows what is overdue and coming up, and Myra mentions what's due when you first open Fenmyr each day.
- Drag a board between two rows to order it. The order is kept for each folder.
- Pickers from the toolbar close when you click elsewhere, and Esc closes toolbar menus.
- Search and text fields have an × to clear them, and the Wireframe panel's search stays in view while you scroll.
- While a note is selected, each tag has an × to remove it and + tag adds one. Undo brings a removed tag back.
- Ask Myra for your unfinished tasks from a connected Obsidian vault (“take my open tasks about Christmas and put them on a kanban”): she now collects the `- [ ]` and `- [/]` tasks from the folders you allowed, keeps their sub-tasks as a checklist, reads `📅 2026-12-20` and `due::` dates into the card's due date, and tells you how many she used. Checklists can have due dates too.
- A new starter board, Workshop planning: Define, Design, Prepare, Run and Follow up laid out side by side, with checklists, the backward timeline, the run of show, the risks and an action log as kanbans, optional modules and a version log. Set due dates on milestones and I’ll remind you.
- Settings → Vaults now explains the three steps (connect, give access, allow AI reading), shows what reads each vault, and has a Give access… button that lists your projects and boards, so you no longer need the right-click menu to find it.
- Deleting a project, folder or board now asks in a wider box with the name on a red Delete button, and says on its own line that it can’t be undone.
- Deleting the board you are on now works every time, even right after an edit: the next board in the list opens (or the one above it, if it was the last), and the deleted board stays gone. If it was your last board, a fresh one takes its place.
- Notes keep their formatting. Format words with Ctrl+B, Ctrl+I, Ctrl+U or Ctrl+Shift+X, or type `**word**`, and start a list by typing - or 1. and a space (Tab nests it, three levels deep). Notes can hold links too: press Ctrl+K while you type, and click a link to open it in your browser. Lists and emphasis pasted from web pages, Obsidian, Markdown files and PDFs stay too, through undo, copies and reopening. Notes you wrote before look as they always did.
- Formatted notes work with the keyboard and screen readers. While you type in a note, F10 moves to the bar's formatting buttons and Esc goes back. Each button says its name and whether it is on, and Enter opens a link in a note. Links in notes are easier to read on every note colour.
- In quick capture (Ctrl+K), Shift+Enter puts your idea on the board so you can write it out first. When you finish, it goes to Unsorted, with a button to keep it on the board instead.
- Write longer messages to Myra: Enter starts a new line and Ctrl+Enter sends. Her box grows to six lines, then scrolls and shows how many lines there are. Type / for her commands in groups: Enter runs the highlighted one, or fills it in when it needs more words from you. Tab fills it in, and Esc closes just the list.
- Right-click a picture to download it, copy it into another app, or replace it with a file or a copied picture. It keeps its place on the board.
