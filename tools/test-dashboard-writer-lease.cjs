const fs = require("fs");

const source = fs.readFileSync("index.html", "utf8");
const leaseStart = source.indexOf("function dashboardLeaseUserId()");
const leaseEnd = source.indexOf("function releaseDashboardWriteLease()");

if (leaseStart < 0 || leaseEnd < 0) throw new Error("Dashboard lease functions are missing.");

const leaseCode = source.slice(leaseStart, leaseEnd);

function createTab(pageId, localStorage) {
  return new Function("localStorage", "dashboardPageId", `
    let sessionUser = { id: "user-1" };
    const dashboardWriterLeaseKey = "lease";
    const dashboardWriterLeaseTtl = 12000;
    let dashboardHasWriteLease = false;
    let campaignSaveTimer = null;
    let campaignSavePending = false;
    let campaignSaveQueuedBeforeReady = false;
    const dashboardWriterChannel = null;
    let writerMessage = "";
    let writerMessageWrites = 0;
    const elements = {
      dashboardWriterNotice: { hidden: true },
      dashboardWriterMessage: {
        get textContent() { return writerMessage; },
        set textContent(value) { writerMessage = value; writerMessageWrites += 1; },
      },
    };
    const document = {
      body: { classList: { toggle() {} } },
      querySelectorAll() { return []; },
    };
    function isPlainObject(value) {
      return value && typeof value === "object" && !Array.isArray(value);
    }
    function setCampaignSaveStatus() {}

    ${leaseCode}

    return {
      acquireDashboardWriteLease,
      ownsDashboardWriteLease,
      updateDashboardWriteAccessUi,
      writerMessageWrites: () => writerMessageWrites,
      state: () => dashboardHasWriteLease,
    };
  `)(localStorage, pageId);
}

const values = {};
const localStorage = {
  getItem(key) {
    return values[key] ?? null;
  },
  setItem(key, value) {
    values[key] = value;
  },
  removeItem(key) {
    delete values[key];
  },
};

const first = createTab("first", localStorage);
const second = createTab("second", localStorage);

if (!first.acquireDashboardWriteLease() || !first.ownsDashboardWriteLease()) {
  throw new Error("The first dashboard did not become the writer.");
}
if (second.acquireDashboardWriteLease() || second.ownsDashboardWriteLease()) {
  throw new Error("The second dashboard was not kept read-only.");
}
second.updateDashboardWriteAccessUi();
second.updateDashboardWriteAccessUi();
if (second.writerMessageWrites() !== 1) {
  throw new Error("Repeated read-only UI refreshes rewrote the notice and can retrigger the DOM observer.");
}
if (!second.acquireDashboardWriteLease(true) || !second.ownsDashboardWriteLease() || first.ownsDashboardWriteLease()) {
  throw new Error("Explicit takeover did not transfer ownership.");
}

const expired = JSON.parse(values.lease);
expired.expiresAt = Date.now() - 1;
values.lease = JSON.stringify(expired);
if (!first.acquireDashboardWriteLease() || !first.ownsDashboardWriteLease()) {
  throw new Error("An expired lease could not be recovered.");
}

const queueStart = source.indexOf("function campaignArchiveSnapshot()");
const queueEnd = source.indexOf("async function saveCampaignSection()");
if (queueStart < 0 || queueEnd < 0) throw new Error("Dashboard save queue functions are missing.");
const queueCode = source.slice(queueStart, queueEnd);

function createSaveQueue({ writer, archive, baseline, exists }) {
  return new Function("initialWriter", "initialArchive", "initialBaseline", "initialExists", `
    let archive = initialArchive;
    let campaignSectionBaseline = initialBaseline;
    let campaignSectionExists = initialExists;
    let campaignStorageAvailable = true;
    let campaignSaveQueuedBeforeReady = false;
    let campaignSaveTimer = null;
    let campaignSavePending = false;
    let scheduled = 0;
    let writer = initialWriter;
    function cloneJson(value) { return JSON.parse(JSON.stringify(value)); }
    function jsonEqual(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
    function ownsDashboardWriteLease() { return writer; }
    function setDashboardWriteLeaseState(value) { writer = value; }
    function setCampaignSaveStatus() {}
    function scheduleCampaignReconnect() {}
    function clearTimeout() {}
    function setTimeout() { scheduled += 1; return scheduled; }
    function saveCampaignSection() {}

    ${queueCode}

    return {
      queueCampaignSave,
      scheduled: () => scheduled,
      mutate(value) { archive = value; },
    };
  `)(writer, archive, baseline, exists);
}

const unchangedQueue = createSaveQueue({ writer: true, archive: { day: 1 }, baseline: { day: 1 }, exists: true });
unchangedQueue.queueCampaignSave();
if (unchangedQueue.scheduled() !== 0) throw new Error("An unchanged dashboard scheduled a save.");

unchangedQueue.mutate({ day: 2 });
unchangedQueue.queueCampaignSave();
if (unchangedQueue.scheduled() !== 1) throw new Error("A changed dashboard did not schedule a save.");

const readOnlyQueue = createSaveQueue({ writer: false, archive: { day: 2 }, baseline: { day: 1 }, exists: true });
readOnlyQueue.queueCampaignSave();
if (readOnlyQueue.scheduled() !== 0) throw new Error("A read-only dashboard scheduled a save.");

console.log("Dashboard writer lease and save queue regression tests passed.");
