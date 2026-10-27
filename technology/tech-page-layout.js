// 科技树页面布局元数据（各循环的图纸尺寸、节点对齐、战局格位与走线通道）。
//
// 单独成文件是因为战役简报（briefing/）要用同一套坐标重放科技树的点亮过程：
// 两份页面共用这一份布局，节点位置才不会和科技树页面不一致。
// 页面以经典 <script> 引入，所以既挂在 window 上，也保留 PAGE_METADATA 这个名字，
// 让原本从 technology/index.html 里读这段声明的测试继续按原样工作。
const PAGE_METADATA = [
  {
    key: 'cycle1', label: '循环 I', width: 1190.5511474609375, height: 841.8897705078125, split_y: 425.1977844238281,
    // cycle1_26「百臂巨人观测」对齐 cycle1_9 的行：它左侧那条来自 cycle1_9 的箭头本来在 y 上
    // 差 8.5px，会拐一个台阶；对齐后是一条直线。
    node_align_y: { cycle1_30: 'cycle1_22', cycle1_29: 'cycle1_51', cycle1_26: 'cycle1_9' },
    node_shift_groups: [{
      nodes: ['cycle1_52', 'cycle1_43', 'cycle1_44', 'cycle1_31', 'cycle1_50', 'cycle1_5', 'cycle1_34', 'cycle1_32', 'cycle1_27'],
      from: 'cycle1_50', to: 'cycle1_7',
    }],
  },
  {
    key: 'cycle2', label: '循环 II', width: 1190.5511474609375, height: 841.8897705078125, split_y: 413.8587646484375,
    node_align_y: {
      cycle2_64: 'cycle2_27', cycle2_27: 'cycle2_6',
      cycle2_29: 'cycle2_30', cycle2_14: 'cycle2_35', cycle2_43: 'cycle2_35',
      cycle2_11: 'cycle2_31', cycle2_17: 'cycle2_54',
      cycle2_47: 'cycle2_28', cycle2_46: 'cycle2_28',
      cycle2_33: 'cycle2_35', cycle2_10: 'cycle2_35',
      cycle2_9: 'cycle2_49',
    },
    node_align_x: { cycle2_27: 'cycle2_64' },
    edge_ports: {
      'cycle2_27>cycle2_66': { target: 'top' },
      'cycle2_64>cycle2_63': { source: 'left', target: 'top' },
      'cycle2_40>cycle2_23': { source: 'bottom', target: 'left' },
      'cycle2_41>cycle2_33': { source: 'right', target: 'top' },
    },
    edge_channels: {
      'cycle2_64>cycle2_62': { left: 'cycle2_62', right: 'cycle2_64', fraction: .18 },
    },
  },
  {
    key: 'cycle3', label: '循环 III', width: 1190.5511474609375, height: 841.8897705078125, split_y: 411.0247802734375,
    node_align_y: { cycle3_57: 'cycle3_20', cycle3_58: 'cycle3_22', cycle3_65: 'cycle3_5', cycle3_4: 'cycle3_25', cycle3_40: 'cycle3_43' },
  },
  {
    key: 'cycle4', label: '循环 IV', width: 1190.5511474609375, height: 841.8897705078125, split_y: 411.0247802734375,
    node_align_y: {
      cycle4_da2211: 'cycle4_da2205',
      cycle4_da2203: 'cycle4_da2220', cycle4_da2200: 'cycle4_da2204',
    },
    // Equipment feeds three research branches; independent rewards occupy the last row.
    battle_grid: {
      x: 60, y: 550, column_gap: 170, row_gap: 94,
      slots: {
        cycle4_da2165: [0, 0], cycle4_da2164: [0, 2], cycle4_da2163: [0, 3],
        cycle4_da2188: [1, 0], cycle4_da2162: [1, 1], cycle4_da2189: [1, 3],
        cycle4_da2168: [2, 0], cycle4_da2166: [2, 1],
        cycle4_da2190: [3, 1], cycle4_da2191: [3, 2], cycle4_da2167: [3, 3],
        cycle4_da2175: [4, 1], cycle4_da2178: [4, 2], cycle4_da2185: [4, 3],
        cycle4_da2192: [5, 1], cycle4_da2169: [5, 2], cycle4_da2193: [5, 3],
        cycle4_da2170: [6, 0], cycle4_da2176: [6, 1], cycle4_da2196: [6, 2],
        cycle4_da2201: [10, 0], cycle4_da2171: [7, 1.5], cycle4_da2179: [7, 2],
        cycle4_da2184: [8, 0], cycle4_da2194: [8, .5], cycle4_da2195: [8, 2], cycle4_da2183: [8, 3],
        cycle4_da2182: [9, 0], cycle4_da2177: [9, 1], cycle4_da2180: [9, 2], cycle4_da2186: [9, 3],
        cycle4_da2181: [10, 2],
        cycle4_da2172: [0, 4], cycle4_da2173: [2, 4], cycle4_da2174: [4, 4],
        cycle4_da2221: [6, 4], cycle4_da2222: [8, 4], cycle4_da2223: [10, 4],
      },
    },
    edge_ports: {
      'cycle4_da2175>cycle4_da2192': { target: 'top' },
      'cycle4_da2192>cycle4_da2170': { source: 'right' },
      'cycle4_da2192>cycle4_da2176': { source: 'right' },
    },
    edge_channels: {
      'cycle4_da2166>cycle4_da2181': { above: 'cycle4_da2186', below: 'cycle4_da2221' },
      'cycle4_da2193>cycle4_da2180': { above: 'cycle4_da2179', below: 'cycle4_da2183' },
      'cycle4_da2193>cycle4_da2186': { above: 'cycle4_da2179', below: 'cycle4_da2183' },
    },
  },
  {
    key: 'cycle5', label: '循环 V', width: 1190.5511474609375, height: 841.8897705078125, split_y: 411.0247802734375,
    node_align_y: {
      cycle5_ea2778: 'cycle5_ea2777', cycle5_ea2767: 'cycle5_ea2766',
      cycle5_ea2772: 'cycle5_ea2782', cycle5_ea2747: 'cycle5_ea2757',
    },
    node_shift_groups: [{
      nodes: ['cycle5_ea2723', 'cycle5_ea2749', 'cycle5_ea2776'],
      from: 'cycle5_ea2776', to: 'cycle5_ea2777',
    }],
    edge_channels: {
      'cycle5_ea2729>cycle5_ea2735': { above: 'cycle5_ea2734', below: 'cycle5_ea2747' },
    },
  },
];
window.ATO_TECH_PAGE_LAYOUT = PAGE_METADATA;
