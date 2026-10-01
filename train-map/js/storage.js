/* 行程记录的本地持久化（localStorage） */
(function (global) {
  'use strict';

  var KEY = 'trainHeatmap.trips.v1';

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      console.warn('读取本地行程失败', e);
      return [];
    }
  }

  function save(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      console.error('写入本地行程失败（可能超出容量）', e);
      return false;
    }
  }

  function add(rec) {
    var list = load();
    list.push(rec);
    save(list);
    return list;
  }

  function remove(id) {
    var list = load().filter(function (r) { return r.id !== id; });
    save(list);
    return list;
  }

  function clear() {
    localStorage.removeItem(KEY);
  }

  function replaceAll(list) {
    save(list);
    return list;
  }

  global.TrainStorage = {
    KEY: KEY,
    load: load,
    save: save,
    add: add,
    remove: remove,
    clear: clear,
    replaceAll: replaceAll
  };
})(window);
