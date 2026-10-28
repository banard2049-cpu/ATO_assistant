/* Display names and icon sources match the existing page entrypoints.
 * Keep these independent of preview layout; compact layouts must not rename content.
 */
window.MobilePreviewIdentity = Object.freeze({
  dashboard: { heading: 'ATO 战役主控台', documentTitle: 'ATO 战役主控台', label: '主控台', source: 'index.html', cycleIcon: true },
  record: { heading: '阿尔戈号记录表', documentTitle: '阿尔戈号记录表', label: '阿尔戈号记录表', source: 'record/index.html', cycleIcon: true },
  hero: { heading: '英雄记录表', documentTitle: '英雄记录表', label: '英雄记录表', source: 'hero/index.html', cycleIcon: true },
  aibp: { heading: '始徒', documentTitle: 'AIBP Apostle Viewer', label: '始徒', source: 'aibp/index.html', cycleIcon: false },
  technology: { heading: '科技', documentTitle: 'ATO 科技树', label: '科技', source: 'technology/index.html', cycleIcon: true },
  map: { heading: 'ATO 地图模块', documentTitle: 'ATO 地图模块', label: '地图', source: 'map/index.html', cycleIcon: true },
  story: { heading: '故事书跳转器', documentTitle: 'ATO 故事书跳转器', label: '故事书跳转器', source: 'story/index.html', cycleIcon: true },
  briefing: { heading: '战役简报', documentTitle: 'ATO 战役简报', label: '战役简报', source: 'briefing/index.html', cycleIcon: true },
});
