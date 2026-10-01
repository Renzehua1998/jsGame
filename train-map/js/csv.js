/* 个人火车行程热力地图 —— 第五阶段：CSV 导入与导出
 * 导出：仅保留用户输入的字段（去除 nodes 轨迹等大字段）
 * 导入：解析 CSV，逐条重新运行路由计算后追加到 localStorage
 */
(function (global) {
  'use strict';

  var COLUMNS = ['date', 'train_no', 'start_station', 'end_station', 'via', 'duration'];
  var ALIAS = {
    start: 'start_station', end: 'end_station', train: 'train_no', train_no: 'train_no',
    from: 'start_station', to: 'end_station'
  };

  function idGen() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function pick(row, key) {
    if (row[key] != null && row[key] !== '') return String(row[key]).trim();
    for (var a in ALIAS) {
      if (ALIAS[a] === key && row[a] != null && row[a] !== '') return String(row[a]).trim();
    }
    return '';
  }

  function download(text, filename) {
    var blob = new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  function exportCsv() {
    var trips = global.TrainStorage.load();
    var rows = trips.map(function (t) {
      var o = {};
      COLUMNS.forEach(function (c) {
        if (c === 'via') o[c] = (t.via || []).join('|');
        else o[c] = t[c] == null ? '' : t[c];
      });
      return o;
    });
    var csv = Papa.unparse(rows, { columns: COLUMNS });
    var d = new Date();
    var stamp = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    download(csv, 'train-trips-' + stamp + '.csv');
    return rows.length;
  }

  function importFile(file, cb) {
    var state = global.TrainHeatmap && global.TrainHeatmap.state;
    if (!state || !state.router) { cb({ error: '路网尚未就绪' }); return; }
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: function (res) {
        var list = global.TrainStorage.load();
        var added = 0;
        var failed = [];
        res.data.forEach(function (row) {
          var start = pick(row, 'start_station');
          var end = pick(row, 'end_station');
          if (!start || !end) return;
          var via = (pick(row, 'via') || '').split(/[|,，、;；]+/).map(function (s) { return s.trim(); }).filter(Boolean);
          try {
            var r = state.router.routeVia(start, end, via);
            list.push({
              id: idGen(),
              date: pick(row, 'date'),
              train_no: pick(row, 'train_no'),
              start_station: r.start.label,
              end_station: r.end.label,
              via: r.viaLabels,
              duration: pick(row, 'duration'),
              distance: Math.round(r.distance),
              nodes: r.nodeIds,
              createdAt: new Date().toISOString()
            });
            added++;
          } catch (e) {
            failed.push(start + '→' + end);
          }
        });
        global.TrainStorage.replaceAll(list);
        cb({ added: added, failed: failed, total: res.data.length });
      },
      error: function (err) { cb({ error: String(err && err.message || err) }); }
    });
  }

  global.TrainCsv = {
    exportCsv: exportCsv,
    importFile: importFile,
    COLUMNS: COLUMNS
  };
})(window);
