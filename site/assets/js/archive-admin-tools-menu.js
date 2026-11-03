// Presentation only: consolidate existing Archive Admin tools without changing their handlers.
// No Firebase imports, queries, or data writes.
(() => {
  const toolbar = document.getElementById("archiveToolbar");
  const viewer = document.getElementById("archiveViewer");
  if (!toolbar || !viewer) return;
  const css = document.createElement("style");
  css.textContent = `
    .archive-admin-menu { position:relative; margin-left:auto; flex-shrink:0; font:12px system-ui,sans-serif; }
    .archive-admin-menu > summary { display:flex; align-items:center; gap:7px; list-style:none; cursor:pointer; color:#224762;
      font-weight:750; padding:8px 12px; border:1px solid #c6d6e3; border-radius:8px; background:#f6f9fc; white-space:nowrap; }
    .archive-admin-menu > summary::-webkit-details-marker { display:none; }
    .archive-admin-menu > summary:hover,.archive-admin-menu[open] > summary { background:#eaf3fa; border-color:#9dbbd1; }
    .archive-admin-menu > summary:focus-visible { outline:2px solid #347cba; outline-offset:2px; }
    .archive-admin-menu .archive-admin-panel { position:absolute; z-index:160; top:calc(100% + 7px); right:0; width:min(350px,calc(100vw - 38px));
      padding:11px; background:#fff; border:1px solid #d5e1eb; border-radius:12px; box-shadow:0 12px 35px #132f4b24; }
    .archive-admin-menu .archive-admin-caption { margin:2px 3px 10px; color:#697e92; font-size:11px; line-height:1.5; }
    .archive-admin-menu .archive-admin-items { display:grid; gap:6px; }
    .archive-admin-menu .archive-admin-items > button { display:block; box-sizing:border-box; width:100%; margin:0; padding:10px 11px;
      min-height:37px; text-align:left; font:650 12px system-ui,sans-serif; border:1px solid #d8e4ec; border-radius:8px; color:#254b69; background:#fff; }
    .archive-admin-menu .archive-admin-items > button:hover:not(:disabled) { background:#f1f7fc; border-color:#b3cadc; }
    .archive-admin-menu .archive-admin-items > button:disabled { opacity:.52; cursor:not-allowed; }
    .archive-admin-menu .archive-admin-items > button[hidden] { display:none!important; }
    .archive-admin-menu .archive-ipc-index-note { display:block; margin:3px 5px 5px; font-size:10px; line-height:1.4; }
    .archive-admin-menu .archive-admin-divider { border-top:1px solid #e7edf3; margin:5px 0; }
    #archiveToolbar.archive-admin-consolidated .archive-ipc-all-launch { display:none!important; }
    @media(max-width:620px) { .archive-admin-menu { margin-left:auto; } .archive-admin-menu .archive-admin-panel { right:0; } }
  `;
  document.head.append(css);
  let busy = false;
  let menu = null, items = null, allProxy = null;
  const selectors = [".archive-ipc-index-tools",".archive-ipc-index-note",".archive-ipc-index-repair",".archive-ipc-bulk-launch:not(.archive-ipc-all-launch)"];
  function sync() {
    if (busy) return;
    busy = true;
    try {
      const heading = viewer.querySelector(".viewer-heading");
      const original = toolbar.querySelector(".archive-ipc-all-launch");
      // This menu is only created for the Admin controls. Staff has no tools to move.
      const hasControls = !!(heading && (original && !original.hidden ||
        selectors.some(selector => heading.querySelector(selector))));
      if (!hasControls || !heading) {
        toolbar.classList.remove("archive-admin-consolidated");
        if(menu && menu.parentElement !== heading) menu = items = allProxy = null;
        return;
      }
      if (!menu || menu.parentElement !== heading) {
        menu = document.createElement("details");
        menu.className = "archive-admin-menu";
        const summary = document.createElement("summary");
        summary.textContent = "⚙ Công cụ Admin ▾";
        summary.setAttribute("aria-label","Mở công cụ quản trị Kho chứng từ");
        const panel = document.createElement("div");
        panel.className = "archive-admin-panel";
        const caption = document.createElement("p");
        caption.className = "archive-admin-caption";
        caption.textContent = "Quản lý link hồ sơ · chỉ chạy khi m chọn công cụ";
        items = document.createElement("div");
        items.className = "archive-admin-items";
        panel.append(caption,items);
        menu.append(summary,panel);
        const close = heading.querySelector(".viewer-close");
        if(close)close.before(menu); else heading.append(menu);
        allProxy = document.createElement("button");
        allProxy.type = "button";
        allProxy.textContent = "📁 Quét hồ sơ toàn Kho (một lần)";
        allProxy.addEventListener("click", () => {
          const liveButton = toolbar.querySelector(".archive-ipc-all-launch");
          if(!liveButton || liveButton.hidden || liveButton.disabled)return;
          menu.open = false;
          liveButton.click();
        });
        items.append(allProxy);
      }
      for (const selector of selectors) {
        const element = heading.querySelector(selector);
        if (element && element.parentElement !== items) items.append(element);
      }
      if(original && allProxy) {
        const hidden = original.hidden;
        if(allProxy.hidden !== hidden)allProxy.hidden = hidden;
        if(allProxy.disabled !== original.disabled)allProxy.disabled = original.disabled;
      }
      toolbar.classList.toggle("archive-admin-consolidated",!!original);
    } finally { busy = false; }
  }
  const observer = new MutationObserver(sync);
  observer.observe(viewer,{childList:true,subtree:true,attributes:true,attributeFilter:["hidden","disabled"]});
  observer.observe(toolbar,{childList:true,subtree:true,attributes:true,attributeFilter:["hidden","disabled"]});
  document.addEventListener("click", e => { if(menu?.open && !menu.contains(e.target))menu.open=false; });
  document.addEventListener("keydown", e => { if(e.key==="Escape" && menu?.open)menu.open=false; });
  sync();
})();
