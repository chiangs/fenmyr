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
