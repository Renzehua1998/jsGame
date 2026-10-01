/* 个人火车行程热力地图 —— 第二阶段：路网拓扑化与最短路径
 * 纯前端实现，不依赖任何外部图库：
 *   - 将铁路 GeoJSON 的 LineString / MultiLineString 顶点吸附为图节点，相邻顶点连边
 *   - 边权为 Haversine 实际距离（米）
 *   - Dijkstra（二叉堆）计算最短路径
 *   - 站点名 -> 车站坐标 -> 最近路网节点 的模糊匹配与吸附
 */
(function (global) {
  'use strict';

  var EARTH_R = 6371008.8;

  function toRad(d) { return d * Math.PI / 180; }

  // [lon, lat] -> 米
  function haversine(a, b) {
    var dLat = toRad(b[1] - a[1]);
    var dLon = toRad(b[0] - a[0]);
    var lat1 = toRad(a[1]), lat2 = toRad(b[1]);
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  // ---------------- 最小堆 ----------------
  function MinHeap() { this.a = []; }
  MinHeap.prototype.push = function (item) {
    var a = this.a; a.push(item);
    var i = a.length - 1;
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      var t = a[p]; a[p] = a[i]; a[i] = t; i = p;
    }
  };
  MinHeap.prototype.pop = function () {
    var a = this.a;
    if (a.length === 0) return null;
    var top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; var i = 0, n = a.length;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, m = i;
        if (l < n && a[l][0] < a[m][0]) m = l;
        if (r < n && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        var t = a[m]; a[m] = a[i]; a[i] = t; i = m;
      }
    }
    return top;
  };
  MinHeap.prototype.size = function () { return this.a.length; };

  // ---------------- 图构建 ----------------
  // 节点吸附容差（度），约 220m；同一容差内的顶点合并为同一节点
  var SNAP_TOL = 0.002;

  function Graph(snapTol) {
    this.nodes = [];          // Array<[lon, lat]>
    this.cells = new Map();   // cellKey -> Array<nodeId>
    this.adj = null;          // CSR: { start:Int32Array, to:Int32Array, w:Float64Array }
    this.edgeCount = 0;
    this.snapTol = snapTol || SNAP_TOL;
  }

  function cellKey(cx, cy) { return cx + ',' + cy; }

  Graph.prototype.snapNode = function (lon, lat) {
    var tol = this.snapTol, tol2 = tol * tol;
    var cx = Math.floor(lon / tol), cy = Math.floor(lat / tol);
    var best = -1, bestD = tol2, nodes = this.nodes;
    for (var dx = -1; dx <= 1; dx++) {
      for (var dy = -1; dy <= 1; dy++) {
        var arr = this.cells.get(cellKey(cx + dx, cy + dy));
        if (!arr) continue;
        for (var k = 0; k < arr.length; k++) {
          var id = arr[k];
          var ddx = nodes[id][0] - lon, ddy = nodes[id][1] - lat;
          var d = ddx * ddx + ddy * ddy;
          if (d < bestD) { bestD = d; best = id; }
        }
      }
    }
    if (best !== -1) return best;
    var id2 = nodes.length;
    nodes.push([lon, lat]);
    var ck = cellKey(cx, cy);
    var bucket = this.cells.get(ck);
    if (!bucket) { bucket = []; this.cells.set(ck, bucket); }
    bucket.push(id2);
    return id2;
  };

  Graph.prototype.addEdge = function (i, j, w, from, to, ws) {
    from.push(i); to.push(j); ws.push(w);
  };

  Graph.prototype.buildCSR = function (from, to, ws) {
    var n = this.nodes.length, m = from.length;
    var deg = new Int32Array(n);
    for (var e = 0; e < m; e++) { deg[from[e]]++; deg[to[e]]++; }
    var start = new Int32Array(n + 1);
    for (var i = 0; i < n; i++) start[i + 1] = start[i] + deg[i];
    var cursor = start.slice(0, n);
    var adjTo = new Int32Array(start[n]);
    var adjW = new Float64Array(start[n]);
    for (var e2 = 0; e2 < m; e2++) {
      var a = from[e2], b = to[e2], w = ws[e2];
      adjTo[cursor[a]] = b; adjW[cursor[a]] = w; cursor[a]++;
      adjTo[cursor[b]] = a; adjW[cursor[b]] = w; cursor[b]++;
    }
    this.adj = { start: start, to: adjTo, w: adjW };
    this.edgeCount = m;
  };

  // 计算连通分量，标记主分量（节点最多者），用于车站吸附兜底
  Graph.prototype.computeComponents = function () {
    var n = this.nodes.length, adj = this.adj;
    var comp = new Int32Array(n); comp.fill(-1);
    var sizes = [], cid = 0;
    for (var s = 0; s < n; s++) {
      if (comp[s] !== -1) continue;
      var size = 0, stack = [s]; comp[s] = cid;
      while (stack.length) {
        var u = stack.pop(); size++;
        for (var e = adj.start[u]; e < adj.start[u + 1]; e++) {
          var v = adj.to[e];
          if (comp[v] === -1) { comp[v] = cid; stack.push(v); }
        }
      }
      sizes.push(size); cid++;
    }
    var main = 0;
    for (var i = 1; i < sizes.length; i++) if (sizes[i] > sizes[main]) main = i;
    this.componentOf = comp;
    this.componentSizes = sizes;
    this.mainComponent = main;
  };

  function buildGraph(railway, opts) {
    opts = opts || {};
    var g = new Graph(opts.snapTol);
    var from = [], to = [], ws = [];
    var features = railway.features || railway;
    for (var fi = 0; fi < features.length; fi++) {
      var geom = features[fi].geometry;
      if (!geom) continue;
      var rings;
      if (geom.type === 'LineString') rings = [geom.coordinates];
      else if (geom.type === 'MultiLineString') rings = geom.coordinates;
      else continue;
      for (var ri = 0; ri < rings.length; ri++) {
        var ring = rings[ri];
        var prev = -1;
        for (var pi = 0; pi < ring.length; pi++) {
          var c = ring[pi];
          var id = g.snapNode(c[0], c[1]);
          if (prev !== -1 && prev !== id) {
            var w = haversine(g.nodes[prev], g.nodes[id]);
            if (w > 0) g.addEdge(prev, id, w, from, to, ws);
          }
          prev = id;
        }
      }
    }
    g.buildCSR(from, to, ws);
    g.computeComponents();
    return g;
  }

  Graph.prototype.nearestNode = function (lon, lat, mainOnly) {
    var nodes = this.nodes, best = -1, bestD = Infinity;
    var comp = this.componentOf, main = this.mainComponent;
    for (var i = 0; i < nodes.length; i++) {
      if (mainOnly && comp && comp[i] !== main) continue;
      var dx = nodes[i][0] - lon, dy = nodes[i][1] - lat;
      var d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return { node: best, distance: haversine([lon, lat], nodes[best]) };
  };

  // ---------------- Dijkstra ----------------
  Graph.prototype.shortestPath = function (src, dst) {
    var n = this.nodes.length;
    var dist = new Float64Array(n); dist.fill(Infinity);
    var prev = new Int32Array(n); prev.fill(-1);
    var done = new Uint8Array(n);
    var heap = new MinHeap();
    dist[src] = 0; heap.push([0, src]);
    var adj = this.adj;
    while (heap.size()) {
      var top = heap.pop();
      var d = top[0], u = top[1];
      if (done[u]) continue;
      done[u] = 1;
      if (u === dst) break;
      for (var e = adj.start[u]; e < adj.start[u + 1]; e++) {
        var v = adj.to[e];
        if (done[v]) continue;
        var nd = d + adj.w[e];
        if (nd < dist[v]) { dist[v] = nd; prev[v] = u; heap.push([nd, v]); }
      }
    }
    if (dist[dst] === Infinity) return null;
    var path = [];
    for (var cur = dst; cur !== -1; cur = prev[cur]) path.push(cur);
    path.reverse();
    return { nodes: path, distance: dist[dst] };
  };

  // ---------------- 车站模糊匹配 ----------------
  function StationIndex(stations) {
    this.list = [];
    this.byName = new Map();
    var feats = (stations && stations.features) || [];
    for (var i = 0; i < feats.length; i++) {
      var f = feats[i];
      if (!f.geometry || f.geometry.type !== 'Point') continue;
      var rec = {
        name: (f.properties && f.properties.name) || '',
        lonlat: f.geometry.coordinates,
        lines: (f.properties && f.properties.line_names) || []
      };
      this.list.push(rec);
      if (!this.byName.has(rec.name)) this.byName.set(rec.name, rec);
    }
    this.names = this.list.map(function (r) { return r.name; });
  }

  StationIndex.prototype.find = function (query) {
    if (!query) return null;
    var q = String(query).trim();
    if (this.byName.has(q)) return { station: this.byName.get(q), match: 'exact' };
    // 去空格 / 去“站”后缀再匹配
    var q2 = q.replace(/\s+/g, '').replace(/站$/, '');
    var contains = [];
    for (var i = 0; i < this.list.length; i++) {
      var name = this.list[i].name;
      var n2 = name.replace(/站$/, '');
      if (name === q2 || n2 === q2) return { station: this.list[i], match: 'normalized' };
      if (name.indexOf(q) !== -1 || (q2 && n2.indexOf(q2) !== -1)) contains.push(this.list[i]);
    }
    if (contains.length) {
      contains.sort(function (a, b) { return a.name.length - b.name.length; });
      return { station: contains[0], match: 'contains' };
    }
    return null;
  };

  StationIndex.prototype.search = function (query, limit) {
    var q = String(query || '').trim();
    limit = limit || 10;
    if (!q) return [];
    var out = [];
    for (var i = 0; i < this.list.length && out.length < limit; i++) {
      if (this.list[i].name.indexOf(q) !== -1) out.push(this.list[i]);
    }
    return out;
  };

  // ---------------- 门面 ----------------
  var coordRe = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

  function Router(graph, stationIndex) {
    this.graph = graph;
    this.stations = stationIndex;
  }

  // 输入可为 "站名" 或 "lon,lat"
  Router.prototype.resolve = function (input) {
    var m = coordRe.exec(input || '');
    if (m) {
      var lon = parseFloat(m[1]), lat = parseFloat(m[2]);
      return { lonlat: [lon, lat], label: input, source: 'coord', station: null };
    }
    var hit = this.stations.find(input);
    if (!hit) return null;
    return {
      lonlat: hit.station.lonlat,
      label: hit.station.name,
      source: hit.match,
      station: hit.station
    };
  };

  Router.prototype.route = function (startInput, endInput) {
    return this.routeVia(startInput, endInput, []);
  };

  // 按顺序经过若干「途径站」的最短路径：
  //   start -> via[0] -> via[1] -> ... -> end 逐段求最短路后拼接
  Router.prototype.routeVia = function (startInput, endInput, viaInputs) {
    var chain = [startInput].concat(viaInputs || [], [endInput]);
    var resolved = chain.map(function (s) { return this.resolve(s); }, this);
    for (var i = 0; i < resolved.length; i++) {
      if (!resolved[i]) {
        var which = i === 0 ? '起点' : (i === resolved.length - 1 ? '终点' : '途径站');
        throw new Error(which + '无法识别：' + chain[i]);
      }
    }
    var snapped = resolved.map(function (r) {
      return this.graph.nearestNode(r.lonlat[0], r.lonlat[1], true);
    }, this);

    var nodeIds = [], total = 0;
    for (var k = 0; k + 1 < resolved.length; k++) {
      var sp = this.graph.shortestPath(snapped[k].node, snapped[k + 1].node);
      if (!sp) {
        throw new Error('未找到连通路径：' + resolved[k].label + ' → ' + resolved[k + 1].label);
      }
      var seg = sp.nodes;
      if (k > 0) seg = seg.slice(1); // 去掉与上一段重复的衔接节点
      nodeIds = nodeIds.concat(seg);
      total += sp.distance;
    }

    var coords = nodeIds.map(function (id) {
      return [this.graph.nodes[id][0], this.graph.nodes[id][1]];
    }, this);

    return {
      start: resolved[0],
      end: resolved[resolved.length - 1],
      vias: resolved.slice(1, -1),
      viaLabels: resolved.slice(1, -1).map(function (r) { return r.label; }),
      snapStart: { lonlat: this.graph.nodes[snapped[0].node], distance: snapped[0].distance },
      snapEnd: {
        lonlat: this.graph.nodes[snapped[snapped.length - 1].node],
        distance: snapped[snapped.length - 1].distance
      },
      distance: total,
      coords: coords,
      nodeIds: nodeIds
    };
  };

  global.TrainRouting = {
    haversine: haversine,
    buildGraph: buildGraph,
    Graph: Graph,
    StationIndex: StationIndex,
    Router: Router
  };
})(typeof window !== 'undefined' ? window : globalThis);
