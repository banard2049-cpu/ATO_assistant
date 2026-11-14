/* Display theme follows the dashboard, independently of the selected apostle. */
(function () {
  const cycles = ["c1", "c2", "c3", "c4", "c5"];
  function setCycle(cycleId) {
    if (!cycles.includes(cycleId)) return;
    document.body.dataset.cycle = cycleId;
    window.ATO_CYCLE_SYMBOLS?.prependModuleLogo(document.querySelector("#aibpTitle"), "evolution", "../");
  }
  window.AIBP_CYCLE_THEME = Object.freeze({ setCycle });
  const linkedCycle = new URLSearchParams(window.location.search).get("cycle");
  setCycle(cycles.includes(linkedCycle) ? linkedCycle : "c1");
  const channel = typeof BroadcastChannel === "function"
    ? new BroadcastChannel("ato-dashboard-cycle-v1") : null;
  channel?.addEventListener("message", (event) => {
    if (event.data?.type === "active-cycle-changed") setCycle(event.data.cycleId);
  });
})();
