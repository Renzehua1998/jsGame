/* 个人火车行程热力地图 —— 第四阶段：热力图渲染
 * 以路网中的「边」为统计单元：遍历所有行程的节点序列，统计每条边被走过的频次，
 * 再按频次动态设置颜色与线宽（频次越高越宽、越暖）。
 */
(function (global) {
  'use strict';

  function lerp(a, b, t) { return a + (b - a) * t; }

  // 暖色渐变：t=0 黄，t=1 红
  function warmColor(t) {
    t = Math.max(0, Math.min(1, t));
    var c1 = [255, 209, 102], c2 = [255, 59, 48];
    return 'rgb(' + Math.round(lerp(c1[0], c2[0], t)) + ',' +
      Math.round(lerp(c1[1], c2[1], t)) + ',' +
      Math.round(lerp(c1[2], c2[2], t)) + ')';
  }

  // 频次 -> 视觉样式
  function styleFor(freq, maxFreq) {
    if (freq <= 1) {
      return { color: '#4a90d9', width: 1.4, opacity: 0.9 };
    }
    var t = maxFreq > 2 ? (freq - 2) / (maxFreq - 2) : 0;
    return {
      color: warmColor(t),
      width: 1.8 + Math.min(freq - 2, 10) * 0.5,
      opacity: 0.95
    };
  }

  // 统计每条边的通过频次
  function countEdges(trips, nodeCount) {
    var counts = new Map(); // key = min*N+max -> freq
    for (var t = 0; t < trips.length; t++) {
      var nodes = trips[t].nodes;
      if (!nodes || nodes.length < 2) continue;
      for (var i = 0; i + 1 < nodes.length; i++) {
        var a = nodes[i], b = nodes[i + 1];
        if (a === b) continue;
        var key = a < b ? a * nodeCount + b : b * nodeCount + a;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    return counts;
  }

  function edgeCoords(key, nodes, nodeCount, coords) {
    var a = Math.floor(key / nodeCount);
    var b = key - a * nodeCount;
    coords.push([nodes[a][0], nodes[a][1]], [nodes[b][0], nodes[b][1]]);
  }

  function updateLegend(maxFreq, visible) {
    var el = document.getElementById('legend');
    if (!el) return;
    if (!visible) { el.hidden = true; return; }
    el.hidden = false;
    document.getElementById('legend-min').textContent = '1';
    document.getElementById('legend-max').textContent = maxFreq > 1 ? String(maxFreq) : '—';
  }

  function render(state) {
    var chart = state && state.chart;
    var graph = state && state.graph;
    if (!chart || !graph) return;

    var trips = global.TrainStorage ? global.TrainStorage.load() : [];
    var counts = countEdges(trips, graph.nodes.length);
    var nodes = graph.nodes;

    var maxFreq = 0;
    counts.forEach(function (v) { if (v > maxFreq) maxFreq = v; });

    // 按频次从低到高排序，保证高频后绘制、显示在最上层
    var keys = Array.from(counts.keys()).sort(function (k1, k2) {
      return counts.get(k1) - counts.get(k2);
    });

    var data = keys.map(function (key) {
      var freq = counts.get(key);
      var st = styleFor(freq, maxFreq);
      var coords = [];
      edgeCoords(key, nodes, nodeCountOf(nodes), coords);
      return {
        coords: coords,
        freq: freq,
        lineStyle: { color: st.color, width: st.width, opacity: st.opacity }
      };
    });

    chart.setOption({
      series: [{
        id: 'trip-heat',
        name: '行程热力',
        type: 'lines',
        coordinateSystem: 'geo',
        polyline: true,
        silent: true,
        zlevel: 3,
        lineStyle: { color: '#ff7a45', width: 2, opacity: 0.95 },
        data: data
      }]
    });

    updateLegend(maxFreq, data.length > 0);

    if (global.TrainHeatmap && global.TrainHeatmap.state) {
      global.TrainHeatmap.state.heatStats = {
        edgeTotal: data.length,
        maxFreq: maxFreq,
        trips: trips.length
      };
    }
  }

  function nodeCountOf(nodes) { return nodes.length; }

  global.TrainHeatmapRender = {
    render: render,
    countEdges: countEdges,
    styleFor: styleFor
  };
})(window);
