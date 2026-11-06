<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="description" content="Every source file in Fenmyr as a circle and every import as a line: how the code is organised and what depends on what.">
<title>Fenmyr code map</title>
<style>{{css}}</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <div>
      <h1>Fenmyr code map</h1>
      <div class="sub" id="sub"></div>
    </div>
    <dl class="stats" id="stats"></dl>
    <a class="tool repo" href="https://github.com/chiangs/fenmyr" target="_blank" rel="noopener noreferrer" aria-label="Fenmyr on GitHub (opens in a new tab)" title="Fenmyr on GitHub"><svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M208.31,75.68A59.78,59.78,0,0,0,202.93,28,8,8,0,0,0,196,24a59.75,59.75,0,0,0-48,24H124A59.75,59.75,0,0,0,76,24a8,8,0,0,0-6.93,4,59.78,59.78,0,0,0-5.38,47.68A58.14,58.14,0,0,0,56,104v8a56.06,56.06,0,0,0,48.44,55.47A39.8,39.8,0,0,0,96,192v8H72a24,24,0,0,1-24-24A40,40,0,0,0,8,136a8,8,0,0,0,0,16,24,24,0,0,1,24,24,40,40,0,0,0,40,40H96v16a8,8,0,0,0,16,0V192a24,24,0,0,1,48,0v40a8,8,0,0,0,16,0V192a39.8,39.8,0,0,0-8.44-24.53A56.06,56.06,0,0,0,216,112v-8A58.14,58.14,0,0,0,208.31,75.68ZM200,112a40,40,0,0,1-40,40H112a40,40,0,0,1-40-40v-8a41.74,41.74,0,0,1,6.9-22.48A8,8,0,0,0,80,73.83a43.81,43.81,0,0,1,.79-33.58,43.88,43.88,0,0,1,32.32,20.06A8,8,0,0,0,119.82,64h32.35a8,8,0,0,0,6.74-3.69,43.87,43.87,0,0,1,32.32-20.06A43.81,43.81,0,0,1,192,73.83a8.09,8.09,0,0,0,1,7.65A41.72,41.72,0,0,1,200,104Z"/></svg></a>
  </header>

  <div class="grid">
    <section class="stage" id="stage" aria-label="Import graph of the Fenmyr source files">
      <div class="bar">
        <div class="seg" role="group" aria-label="View">
          <button type="button" id="vFiles" aria-pressed="true">Files</button>
          <button type="button" id="vAreas" aria-pressed="false">Areas</button>
        </div>
        <button type="button" class="tool" id="fit">Fit</button>
      </div>
      <svg id="svg" role="img" aria-label="Graph: each circle is a source file, each line an import. Larger circles have more connections.">
        <g id="world">
          <g id="gClusters"></g>
          <g id="gEdges"></g>
          <g id="gNodes"></g>
          <g id="gLabels"></g>
        </g>
      </svg>
      <div class="tip" id="tip" hidden></div>
      <div class="hint">
        <span>Circle size = number of connections</span>
        <span><i class="k-out"></i>imports</span>
        <span><i class="k-in"></i>imported by</span>
        <span>Scroll to zoom, drag to pan, drag a circle to move it</span>
      </div>
    </section>

    <aside class="side">
      <div class="sec">
        <input class="search" id="q" type="search" placeholder="Find a file, such as history or tags" aria-label="Find a file" autocomplete="off" spellcheck="false">
        <div class="checks">
          <label><input type="checkbox" id="cTests"> Tests</label>
          <label><input type="checkbox" id="cTools"> Tools and scripts</label>
          <label><input type="checkbox" id="cTypes" checked> Type-only imports</label>
          <label id="lNames"><input type="checkbox" id="cNames" checked> File names</label>
          <label id="lCycle"><input type="checkbox" id="cCycle"> Mark the import cycle</label>
        </div>
      </div>
      <div class="sec" id="detail"></div>
      <div class="sec"><h2 id="topH">Most connected files</h2><div class="rows" id="top"></div></div>
      <div class="sec"><h2>Areas <span class="aside">(click to focus)</span></h2><div class="chips" id="legend"></div></div>
      <div class="sec"><h2>What the graph shows</h2><ul class="facts" id="facts"></ul></div>
      <div class="sec"><h2>For tools</h2><p class="what sm"><a href="code-map.json">code-map.json</a> has the full graph and <a href="code-map.md">code-map.md</a> is a short index to read. Both are rebuilt on every merge to main.</p></div>
    </aside>
  </div>
</div>
<script type="application/json" id="code-map-data">{{data}}</script>
<script>{{script}}</script>
</body>
</html>
