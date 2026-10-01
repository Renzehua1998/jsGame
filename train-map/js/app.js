/* 个人火车行程热力地图 —— 第一阶段：底图 + 铁路网渲染 */
(function () {
  'use strict';

  var CONFIG = {
    chinaUrl: 'data/china-provinces.geojson',
    railwayUrl: 'data/railway.simplified.geojson',
    stationsUrl: 'data/stations.geojson'
  };

  var state = {
    chart: null,
    china: null,
    railway: null,
    stations: null,
    graph: null,
    stationIndex: null,
    router: null
  };

  function $(id) { return document.getElementById(id); }

  function setStatus(text, isError) {
    var el = $('status');
    if (!el) return;
    if (text === null) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.classList.toggle('error', !!isError);
    el.textContent = text;
  }

  function loadJSON(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error(url + ' 加载失败: HTTP ' + res.status);
      return res.json();
    });
  }

  // 数据加载：优先使用内联全局（build-static 产物，支持 file:// 双击）
  var DATA_URL_KEY = { china: 'chinaUrl', railway: 'railwayUrl', stations: 'stationsUrl' };
  function loadData(key) {
    var D = window.__TRAIN_DATA__;
    if (D && D[key]) return Promise.resolve(D[key]);
    return loadJSON(CONFIG[DATA_URL_KEY[key]]);
  }

  function collectRings(geojson) {
    var rings = [];
    var verts = 0;
    geojson.features.forEach(function (f) {
      var g = f.geometry;
      if (!g) return;
      if (g.type === 'LineString') { rings.push(g.coordinates); verts += g.coordinates.length; }
      else if (g.type === 'MultiLineString') {
        g.coordinates.forEach(function (r) { rings.push(r); verts += r.length; });
      }
    });
    return { rings: rings, verts: verts };
  }

  function buildOption(china, railway) {
    echarts.registerMap('china', china);

    var collected = collectRings(railway);
    var lineData = collected.rings.map(function (coords) {
      return { coords: coords };
    });

    window.__RAILWAY_STATS__ = {
      features: railway.features.length,
      rings: collected.rings.length,
      verts: collected.verts
    };

    return {
      backgroundColor: '#0d1117',
      geo: {
        map: 'china',
        roam: true,
        zoom: 1.15,
        center: [104, 36],
        silent: false,
        label: { show: false },
        itemStyle: {
          areaColor: '#131a26',
          borderColor: '#2a3446',
          borderWidth: 0.8
        },
        emphasis: {
          disabled: true
        },
        select: { disabled: true }
      },
      series: [
        {
          name: '铁路网',
          type: 'lines',
          coordinateSystem: 'geo',
          polyline: true,
          silent: true,
          zlevel: 2,
          lineStyle: {
            color: 'rgba(120, 150, 190, 0.55)',
            width: 0.6,
            opacity: 0.9
          },
          data: lineData
        }
      ]
    };
  }

  function updateStats() {
    var s = window.__RAILWAY_STATS__;
    if (!s) return;
    var text = '线路 ' + s.features + ' 条 · 顶点 ' + s.verts.toLocaleString();
    if (state.graph) {
      text += ' · 路网节点 ' + state.graph.nodes.length.toLocaleString() +
              ' · 边 ' + state.graph.edgeCount.toLocaleString();
    }
    $('stats').textContent = text;
  }

  /* ---------------- 第三阶段：交互与本地存储 ---------------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function idGen() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function setFormMsg(text, ok) {
    var el = $('form-msg');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('ok', !!ok);
    el.classList.toggle('err', !!text && !ok);
  }

  function populateStationList() {
    if (!state.stationIndex) return;
    var dl = $('station-list');
    var names = state.stationIndex.names;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < names.length; i++) {
      var o = document.createElement('option');
      o.value = names[i];
      frag.appendChild(o);
    }
    dl.innerHTML = '';
    dl.appendChild(frag);
  }

  function tripRoute(r) {
    var mids = (r.via || []).filter(Boolean);
    return [r.start_station || '?']
      .concat(mids, [r.end_station || '?'])
      .join(' → ');
  }

  function parseVia(str) {
    if (!str) return [];
    return String(str).split(/[,，、;；|]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  var editing = { id: null };

  function setEditing(rec) {
    if (rec) {
      editing.id = rec.id;
      $('f-date').value = rec.date || '';
      $('f-train').value = rec.train_no || '';
      $('f-start').value = rec.start_station || '';
      $('f-end').value = rec.end_station || '';
      $('f-duration').value = rec.duration || '';
      $('f-via').value = (rec.via || []).join('，');
      $('edit-bar').hidden = false;
      $('edit-label').textContent = tripRoute(rec);
      $('f-submit').textContent = '保存修改';
      setFormMsg('修改起终点 / 途径站后点击「保存修改」将重新计算路径');
    } else {
      editing.id = null;
      $('edit-bar').hidden = true;
      $('f-submit').textContent = '添加行程';
    }
  }

  function clearRouteFields() {
    $('f-start').value = '';
    $('f-end').value = '';
    $('f-train').value = '';
    $('f-duration').value = '';
    $('f-via').value = '';
  }

  function renderTrips() {
    var list = TrainStorage.load();
    $('trip-count').textContent = list.length;
    var ul = $('trip-list');
    ul.innerHTML = '';
    for (var i = list.length - 1; i >= 0; i--) {
      var r = list[i];
      var li = document.createElement('li');
      li.className = 'trip-item';
      var meta = [];
      if (r.date) meta.push(r.date);
      if (r.train_no) meta.push(r.train_no);
      if (r.duration) meta.push(r.duration);
      if (r.distance) meta.push((r.distance / 1000).toFixed(0) + ' km');
      li.innerHTML =
        '<div class="trip-main">' +
          '<span class="trip-route">' + esc(tripRoute(r)) + '</span>' +
          '<span class="trip-meta">' + esc(meta.join(' · ')) + '</span>' +
        '</div>' +
        '<div class="trip-actions">' +
          '<button class="trip-edit" title="编辑途径" data-id="' + esc(r.id) + '">✎</button>' +
          '<button class="trip-del" title="删除" data-id="' + esc(r.id) + '">×</button>' +
        '</div>';
      ul.appendChild(li);
    }
    Array.prototype.forEach.call(ul.querySelectorAll('.trip-del'), function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        if (editing.id === id) setEditing(null);
        TrainStorage.remove(id);
        renderTrips();
        refreshHeat();
      });
    });
    Array.prototype.forEach.call(ul.querySelectorAll('.trip-edit'), function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        var rec = TrainStorage.load().filter(function (x) { return x.id === id; })[0];
        if (rec) setEditing(rec);
      });
    });
  }

  function refreshHeat() {
    if (global_heat()) global_heat().render(state);
  }
  function global_heat() { return window.TrainHeatmapRender; }

  function handleSubmit(e) {
    e.preventDefault();
    if (!state.router) { setFormMsg('路网尚未就绪，请稍候…'); return; }
    var date = $('f-date').value;
    var train = $('f-train').value.trim();
    var start = $('f-start').value.trim();
    var end = $('f-end').value.trim();
    var duration = $('f-duration').value.trim();
    var vias = parseVia($('f-via').value);
    if (!date) { setFormMsg('请选择日期'); return; }
    if (!start || !end) { setFormMsg('请填写起点与终点'); return; }
    try {
      var r = state.router.routeVia(start, end, vias);
      var rec = {
        id: editing.id || idGen(),
        date: date,
        train_no: train,
        start_station: r.start.label,
        end_station: r.end.label,
        via: r.viaLabels,
        duration: duration,
        distance: Math.round(r.distance),
        nodes: r.nodeIds,
        createdAt: new Date().toISOString()
      };
      var viaText = r.viaLabels.length ? ('（途经 ' + r.viaLabels.join('、') + '）') : '';
      if (editing.id) {
        var list = TrainStorage.load();
        var idx = -1;
        for (var i = 0; i < list.length; i++) if (list[i].id === editing.id) { idx = i; break; }
        if (idx >= 0) {
          rec.createdAt = list[idx].createdAt || rec.createdAt;
          list[idx] = rec;
          TrainStorage.replaceAll(list);
          setFormMsg('已更新 ' + tripRoute(rec) + viaText + '（' + (r.distance / 1000).toFixed(0) + ' km）', true);
        }
        setEditing(null);
        clearRouteFields();
      } else {
        if (!TrainStorage.add(rec)) { setFormMsg('保存失败：本地存储容量可能已满'); return; }
        setFormMsg('已添加 ' + tripRoute(rec) + viaText + '（' + (r.distance / 1000).toFixed(0) + ' km）', true);
        clearRouteFields();
      }
      renderTrips();
      refreshHeat();
    } catch (err) {
      setFormMsg(err.message);
    }
  }

  function bindUI() {
    var form = $('trip-form');
    if (form) form.addEventListener('submit', handleSubmit);
    var clearBtn = $('btn-clear');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      if (window.confirm('确定清空全部行程记录？此操作不可恢复。')) {
        TrainStorage.clear();
        setEditing(null);
        renderTrips();
        refreshHeat();
      }
    });

    var cancelEdit = $('btn-cancel-edit');
    if (cancelEdit) cancelEdit.addEventListener('click', function () {
      setEditing(null);
      clearRouteFields();
      setFormMsg('');
    });

    var expBtn = $('btn-export');
    if (expBtn) expBtn.addEventListener('click', function () {
      var n = TrainCsv.exportCsv();
      setFormMsg(n ? ('已导出 ' + n + ' 条行程') : '暂无行程可导出', n > 0);
    });

    var impBtn = $('btn-import');
    var fileInput = $('csv-file');
    if (impBtn && fileInput) {
      impBtn.addEventListener('click', function () {
        if (!state.router) { setFormMsg('路网尚未就绪，请稍候…'); return; }
        fileInput.click();
      });
      fileInput.addEventListener('change', function () {
        var f = fileInput.files && fileInput.files[0];
        if (!f) return;
        setFormMsg('正在导入并重新计算路径…');
        TrainCsv.importFile(f, function (res) {
          fileInput.value = '';
          if (res.error) { setFormMsg('导入失败：' + res.error); return; }
          var msg = '导入完成：新增 ' + res.added + ' 条';
          if (res.failed.length) msg += '，失败 ' + res.failed.length + ' 条（' + res.failed.slice(0, 3).join('、') + (res.failed.length > 3 ? '…' : '') + '）';
          setFormMsg(msg, res.added > 0);
          renderTrips();
          refreshHeat();
        });
      });
    }
  }

  function init() {
    state.chart = echarts.init($('map'), null, { renderer: 'canvas' });
    window.addEventListener('resize', function () { state.chart.resize(); });
    bindUI();

    setStatus('正在加载省级底图与铁路网…');

    Promise.all([
      loadData('china'),
      loadData('railway')
    ]).then(function (res) {
      state.china = res[0];
      state.railway = res[1];
      state.chart.setOption(buildOption(state.china, state.railway));
      setStatus('正在构建铁路路网拓扑…');

      // 让浏览器先完成一次渲染，再构建图（约 200ms）
      setTimeout(function () {
        state.graph = TrainRouting.buildGraph(state.railway, { snapTol: 0.002 });

        loadData('stations').catch(function () { return null; }).then(function (st) {
          state.stations = st || { type: 'FeatureCollection', features: [] };
          state.stationIndex = new TrainRouting.StationIndex(state.stations);
          state.router = new TrainRouting.Router(state.graph, state.stationIndex);
          updateStats();
          populateStationList();
          renderTrips();
          refreshHeat();
          setStatus(null);
          console.log('[TrainHeatmap] 路网就绪：节点 ' + state.graph.nodes.length +
            '，边 ' + state.graph.edgeCount + '，车站 ' + state.stationIndex.list.length +
            '。可在控制台用 TrainHeatmap.route("北京南","上海") 测试。');
        });
      }, 0);
    }).catch(function (err) {
      var hint = '数据加载失败：' + err.message +
        '。若通过 file:// 直接打开，请改用本地静态服务器（如在项目目录运行 “python -m http.server 8080”）。';
      setStatus(hint, true);
      console.error(err);
    });
  }

  window.TrainHeatmap = {
    state: state,
    CONFIG: CONFIG,
    setStatus: setStatus,
    loadJSON: loadJSON,
    getChart: function () { return state.chart; },
    renderTrips: renderTrips,
    refreshHeat: refreshHeat,
    route: function (a, b) {
      if (!state.router) throw new Error('路网尚未就绪');
      var r = state.router.route(a, b);
      console.log('[route] ' + r.start.label + ' → ' + r.end.label +
        ' · ' + (r.distance / 1000).toFixed(1) + ' km · ' + r.coords.length + ' 点');
      return r;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
