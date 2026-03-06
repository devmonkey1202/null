const DesignPanelInner = () => (
    <>
      {selectedNode ? (
      <div className="space-y-4" key="with-node">
        <div className="rounded-md border border-neutral-100 bg-neutral-50/50 overflow-hidden" role="region" aria-label="Selection tools">
          <div className="px-2 py-1.5 flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-neutral-200 px-2 py-1 text-[11px]"
              onClick={readSelectionAloud}
              disabled={!doc.selection.size}
              aria-label="Announce selection"
            >
              Announce selection
            </button>
            <span className="sr-only" aria-live="polite" aria-atomic>
              {selectionAnnounceText}
            </span>
              </div>
          </div>
        {selectedSupportsDataBinding && (
          <div className="rounded-md border border-neutral-100 bg-neutral-50/50 overflow-hidden">
            <button
              type="button"
              className="flex w-full items-center justify-between px-2 py-1.5 text-left text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-500 hover:bg-neutral-100"
              onClick={() => setRightPanelSections((s) => ({ ...s, dataBinding: !s.dataBinding }))}
            >
              <span>Label</span>
              <span>Label</span>
            </button>
            {rightPanelSections.dataBinding && (
              <div className="px-2 pb-2">
                <div className="mt-2 space-y-2">
                  <label className="flex items-center justify-between gap-2">
                    <span className="text-neutral-500">Label</span>
                    <input
                      type="checkbox"
                      checked={Boolean(selectedDataBinding)}
                      onChange={(e) => {
                        if (!selectedNode) return;
                        if (e.target.checked) {
                          const base: NodeDataBinding = selectedDataBinding ?? {
                            type: "collection",
                            collectionId: "",
                            mode: "list",
                          };
                          updateNode(selectedNode.id, { data: base }, true);
                        } else {
                          updateNode(selectedNode.id, { data: undefined }, true);
                        }
                      }}
                    />
                  </label>
                  {selectedDataBinding ? (
                    <>
                      <label className="flex flex-col gap-1">
                        <span className="text-neutral-500">Label</span>
                        <input
                          type="text"
                          value={selectedDataBinding.collectionId ?? ""}
                          onChange={(e) =>
                            selectedNode &&
                            updateNode(
                              selectedNode.id,
                              { data: { ...selectedDataBinding, collectionId: e.target.value } },
                              true,
                            )
                          }
                          placeholder="e.g. products"
                          className="w-full rounded border border-neutral-200 px-2 py-1 text-xs"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-neutral-500">Mode</span>
                        <select
                          value={selectedDataBinding.mode ?? "list"}
                          onChange={(e) =>
                            selectedNode &&
                            updateNode(
                              selectedNode.id,
                              { data: { ...selectedDataBinding, mode: e.target.value as "list" | "table" } },
                              true,
                            )
                          }
                          className="rounded border border-neutral-200 px-2 py-1 text-xs"
                        >
                          <option value="list">List</option>
                          <option value="table">Table</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-neutral-500">Label</span>
                        <input
                          type="text"
                          value={selectedDataBindingFields}
                          onChange={(e) => {
                            if (!selectedNode) return;
                            const fields = e.target.value
                              .split(",")
                              .map((v) => v.trim())
                              .filter(Boolean);
                            updateNode(
                              selectedNode.id,
                              { data: { ...selectedDataBinding, fields: fields.length ? fields : undefined } },
                              true,
                            );
                          }}
                          placeholder="title, price, image"
                          className="w-full rounded border border-neutral-200 px-2 py-1 text-xs"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-neutral-500">Limit</span>
                        <input
                          type="number"
                          min={1}
                          value={selectedDataBinding.limit ?? ""}
                          onChange={(e) => {
                            if (!selectedNode) return;
                            const raw = e.target.value;
                            const value = raw === "" ? undefined : Math.max(1, Number(raw));
                            updateNode(
                              selectedNode.id,
                              { data: { ...selectedDataBinding, limit: value } },
                              true,
                            );
                          }}
                          className="w-20 rounded border border-neutral-200 px-2 py-1 text-xs"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-neutral-500">Offset</span>
                        <input
                          type="number"
                          min={0}
                          value={selectedDataBinding.offset ?? ""}
                          onChange={(e) => {
                            if (!selectedNode) return;
                            const raw = e.target.value;
                            const value = raw === "" ? undefined : Math.max(0, Number(raw));
                            updateNode(
                              selectedNode.id,
                              { data: { ...selectedDataBinding, offset: value } },
                              true,
                            );
                          }}
                          className="w-20 rounded border border-neutral-200 px-2 py-1 text-xs"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-neutral-500">Order by</span>
                        <select
                          value={selectedDataBinding.orderBy ?? "created_at"}
                          onChange={(e) =>
                            selectedNode &&
                            updateNode(
                              selectedNode.id,
                              { data: { ...selectedDataBinding, orderBy: e.target.value as "created_at" | "updated_at" } },
                              true,
                            )
                          }
                          className="rounded border border-neutral-200 px-2 py-1 text-xs"
                        >
                          <option value="created_at">created_at</option>
                          <option value="updated_at">updated_at</option>
                        </select>
                      </label>
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-neutral-500">Order dir</span>
                        <select
                          value={selectedDataBinding.orderDir ?? "desc"}
                          onChange={(e) =>
                            selectedNode &&
                            updateNode(
                              selectedNode.id,
                              { data: { ...selectedDataBinding, orderDir: e.target.value as "asc" | "desc" } },
                              true,
                            )
                          }
                          className="rounded border border-neutral-200 px-2 py-1 text-xs"
                        >
                          <option value="desc">desc</option>
                          <option value="asc">asc</option>
                        </select>
                      </label>
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-neutral-500">Editable</span>
                        <input
                          type="checkbox"
                          checked={Boolean(selectedDataBinding.editable)}
                          onChange={(e) =>
                            selectedNode &&
                            updateNode(
                              selectedNode.id,
                              { data: { ...selectedDataBinding, editable: e.target.checked } },
                              true,
                            )
                          }
                        />
                      </label>
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-neutral-500">Allow delete</span>
                        <input
                          type="checkbox"
                          checked={Boolean(selectedDataBinding.allowDelete)}
                          onChange={(e) =>
                            selectedNode &&
                            updateNode(
                              selectedNode.id,
                              { data: { ...selectedDataBinding, allowDelete: e.target.checked } },
                              true,
                            )
                          }
                        />
                      </label>
                      {selectedNode.children.length === 0 ? (
                        <p className="text-[11px] text-amber-600">
                          Label
Label
                        </p>
                      ) : (
                        <p className="text-[11px] text-neutral-500">Label</p>
                      )}
                    </>
                  ) : (
                    <p className="text-[11px] text-neutral-500">
                      Label
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="rounded-md border border-neutral-100 bg-neutral-50/50 overflow-hidden">
          <button type="button" className="flex w-full items-center justify-between px-2 py-1.5 text-left text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-500 hover:bg-neutral-100" onClick={() => setRightPanelSections((s) => ({ ...s, geometry: !s.geometry }))}>
            <span>Label</span>
            <span>Label</span>
          </button>
          {rightPanelSections.geometry && (
            <div className="px-2 pb-2">
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="flex items-center justify-between gap-2">
                  <span className="text-neutral-500">X</span>
                  <input type="number" value={Math.round(selectedNode.frame.x)} onChange={(e) => updateNode(selectedNode.id, { frame: { ...selectedNode.frame, x: Number(e.target.value) } }, true)} className="w-20 rounded border border-neutral-200 px-2 py-1" />
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span className="text-neutral-500">Y</span>
                  <input type="number" value={Math.round(selectedNode.frame.y)} onChange={(e) => updateNode(selectedNode.id, { frame: { ...selectedNode.frame, y: Number(e.target.value) } }, true)} className="w-20 rounded border border-neutral-200 px-2 py-1" />
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span className="text-neutral-500">W</span>
                  <input type="number" value={Math.round(selectedNode.frame.w)} onChange={(e) => updateNode(selectedNode.id, { frame: { ...selectedNode.frame, w: Number(e.target.value) }, widthPercent: undefined }, true)} className="w-20 rounded border border-neutral-200 px-2 py-1" />
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span className="text-neutral-500">H</span>
                  <input type="number" value={Math.round(selectedNode.frame.h)} onChange={(e) => updateNode(selectedNode.id, { frame: { ...selectedNode.frame, h: Number(e.target.value) }, heightPercent: undefined }, true)} className="w-20 rounded border border-neutral-200 px-2 py-1" />
                </label>
                {selectedNode.parentId ? (
                  <>
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-neutral-500">Label</span>
                      <input type="number" min={0} max={100} step={1} placeholder="0-100" value={selectedNode.widthPercent ?? ""} onChange={(e) => { const v = e.target.value === "" ? undefined : Number(e.target.value); updateNode(selectedNode.id, { widthPercent: v }, true); }} className="w-20 rounded border border-neutral-200 px-2 py-1" />
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-neutral-500">Label</span>
                      <input type="number" min={0} max={100} step={1} placeholder="0-100" value={selectedNode.heightPercent ?? ""} onChange={(e) => { const v = e.target.value === "" ? undefined : Number(e.target.value); updateNode(selectedNode.id, { heightPercent: v }, true); }} className="w-20 rounded border border-neutral-200 px-2 py-1" />
                    </label>
                  </>
                ) : null}
                <label className="flex items-center justify-between gap-2">
                  <span className="text-neutral-500">Label</span>
                  <input type="number" value={Math.round(selectedNode.frame.rotation)} onChange={(e) => updateNode(selectedNode.id, { frame: { ...selectedNode.frame, rotation: Number(e.target.value) } }, true)} className="w-20 rounded border border-neutral-200 px-2 py-1" />
                </label>
              </div>
              <div className="mt-2">
              <button type="button" className="px-2" onClick={fitSelectionToContent} disabled={!hasSelection}>Fit to content</button>
              </div>
              {selectedIsPageRoot && activePageMeta ? (
                <div className="mt-3 border-t border-neutral-100 pt-2 space-y-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Label</div>
                  <div className="flex flex-wrap gap-2">
                    {BREAKPOINT_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className="rounded border border-neutral-200 px-2 py-1 text-[11px]"
                        onClick={() => applyPageBreakpoint(activePageMeta.id, preset)}
                      >
                        {preset.name} {preset.width}x{preset.height}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="rounded border border-neutral-200 px-2 py-1 text-[11px]"
                      onClick={() => {
                        setNewBreakpointWidth(Math.round(selectedNode.frame.w));
                        setNewBreakpointHeight(Math.round(selectedNode.frame.h));
                      }}
                    >
                      Label
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newBreakpointName}
                      onChange={(e) => setNewBreakpointName(e.target.value)}
                      placeholder="Breakpoint name"
                      className="w-full rounded border border-neutral-200 px-2 py-1 text-[11px]"
                    />
                    <button
                      type="button"
                      className="rounded border border-neutral-200 px-2 py-1 text-[11px]"
                      onClick={() =>
                        applyPageBreakpoint(activePageMeta.id, {
                          name: newBreakpointName || "Breakpoint",
                          width: newBreakpointWidth,
                          height: newBreakpointHeight,
                        })
                      }
                    >
                      Label
                    </button>
                    <input
                      type="number"
                      value={newBreakpointWidth}
                      onChange={(e) => setNewBreakpointWidth(Number(e.target.value) || 0)}
                      className="w-full rounded border border-neutral-200 px-2 py-1 text-[11px]"
                      placeholder="Width"
                    />
                    <input
                      type="number"
                      value={newBreakpointHeight}
                      onChange={(e) => setNewBreakpointHeight(Number(e.target.value) || 0)}
                      className="w-full rounded border border-neutral-200 px-2 py-1 text-[11px]"
                      placeholder="Height"
                    />
                  </div>
                  {pageBreakpoints.length === 0 ? (
                    <p className="text-[11px] text-neutral-400">Label</p>
                  ) : (
                    <div className="space-y-1">
                      {pageBreakpoints.map((bp) => (
                        <div key={bp.id} className="flex items-center justify-between gap-2 rounded border border-neutral-200 bg-white px-2 py-1 text-[11px]">
                          <div className="flex items-center gap-2">
                            <span className="text-neutral-700">{bp.name}</span>
                            <span className="text-neutral-400">Label</span>
                            {activePageBreakpointId === bp.id && (
                              <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">Active</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button type="button" className="rounded border border-neutral-200 px-2 py-0.5" onClick={() => applyPageBreakpoint(activePageMeta.id, bp)}>Apply</button>
                            <button type="button" className="rounded border border-neutral-200 px-2 py-0.5" onClick={() => removePageBreakpoint(activePageMeta.id, bp.id)}>Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
              {!selectedIsPageRoot && pageBreakpoints.length > 0 && selectedNode ? (
                <div className="mt-3 border-t border-neutral-100 pt-2 space-y-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Label</div>
                  {pageBreakpoints.map((bp) => {
                    const bpOverride = selectedNode.breakpointOverrides?.[bp.id];
                    const isHidden = bpOverride?.hidden ?? false;
                    return (
                      <div key={bp.id} className="rounded border border-neutral-200 bg-white px-2 py-1.5 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium">{bp.name} ({bp.width})</span>
                          <label className="flex items-center gap-1 text-[10px]">
                            <input type="checkbox" checked={isHidden} onChange={(e) => {
                              const draft = cloneDoc(docRef.current);
                              const node = draft.nodes[selectedNode.id];
                              if (!node) return;
                              if (!node.breakpointOverrides) node.breakpointOverrides = {};
                              if (!node.breakpointOverrides[bp.id]) node.breakpointOverrides[bp.id] = {};
                              node.breakpointOverrides[bp.id].hidden = e.target.checked;
                              commit(draft);
                            }} />
                            Label
                          </label>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <label className="text-[10px] text-neutral-500">
                            X
                            <input type="number" value={bpOverride?.frame?.x ?? ""} placeholder={String(Math.round(selectedNode.frame.x))} onChange={(e) => {
                              const draft = cloneDoc(docRef.current);
                              const node = draft.nodes[selectedNode.id];
                              if (!node) return;
                              if (!node.breakpointOverrides) node.breakpointOverrides = {};
                              if (!node.breakpointOverrides[bp.id]) node.breakpointOverrides[bp.id] = {};
                              if (!node.breakpointOverrides[bp.id].frame) node.breakpointOverrides[bp.id].frame = {};
                              node.breakpointOverrides[bp.id].frame!.x = Number(e.target.value) || undefined;
                              commit(draft);
                            }} className="w-full rounded border border-neutral-200 px-1 py-0.5 text-[10px]" />
                          </label>
                          <label className="text-[10px] text-neutral-500">
                            Y
                            <input type="number" value={bpOverride?.frame?.y ?? ""} placeholder={String(Math.round(selectedNode.frame.y))} onChange={(e) => {
                              const draft = cloneDoc(docRef.current);
                              const node = draft.nodes[selectedNode.id];
                              if (!node) return;
                              if (!node.breakpointOverrides) node.breakpointOverrides = {};
                              if (!node.breakpointOverrides[bp.id]) node.breakpointOverrides[bp.id] = {};
                              if (!node.breakpointOverrides[bp.id].frame) node.breakpointOverrides[bp.id].frame = {};
                              node.breakpointOverrides[bp.id].frame!.y = Number(e.target.value) || undefined;
                              commit(draft);
                            }} className="w-full rounded border border-neutral-200 px-1 py-0.5 text-[10px]" />
                          </label>
                          <label className="text-[10px] text-neutral-500">
                            W
                            <input type="number" value={bpOverride?.frame?.w ?? ""} placeholder={String(Math.round(selectedNode.frame.w))} onChange={(e) => {
                              const draft = cloneDoc(docRef.current);
                              const node = draft.nodes[selectedNode.id];
                              if (!node) return;
                              if (!node.breakpointOverrides) node.breakpointOverrides = {};
                              if (!node.breakpointOverrides[bp.id]) node.breakpointOverrides[bp.id] = {};
                              if (!node.breakpointOverrides[bp.id].frame) node.breakpointOverrides[bp.id].frame = {};
                              node.breakpointOverrides[bp.id].frame!.w = Number(e.target.value) || undefined;
                              commit(draft);
                            }} className="w-full rounded border border-neutral-200 px-1 py-0.5 text-[10px]" />
                          </label>
                          <label className="text-[10px] text-neutral-500">
                            H
                            <input type="number" value={bpOverride?.frame?.h ?? ""} placeholder={String(Math.round(selectedNode.frame.h))} onChange={(e) => {
                              const draft = cloneDoc(docRef.current);
                              const node = draft.nodes[selectedNode.id];
                              if (!node) return;
                              if (!node.breakpointOverrides) node.breakpointOverrides = {};
                              if (!node.breakpointOverrides[bp.id]) node.breakpointOverrides[bp.id] = {};
                              if (!node.breakpointOverrides[bp.id].frame) node.breakpointOverrides[bp.id].frame = {};
                              node.breakpointOverrides[bp.id].frame!.h = Number(e.target.value) || undefined;
                              commit(draft);
                            }} className="w-full rounded border border-neutral-200 px-1 py-0.5 text-[10px]" />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          )}
        </div>
        <div className="rounded-md border border-neutral-100 bg-neutral-50/50 overflow-hidden">
          <button
            type="button"
            className="flex w-full items-center justify-between px-2 py-1.5 text-left text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-500 hover:bg-neutral-100"
            onClick={() => setRightPanelSections((s) => ({ ...s, layout: !s.layout }))}
          >
            <span>Layout</span>
            <span>{rightPanelSections.layout ? "Hide" : "Show"}</span>
          </button>
          {rightPanelSections.layout && (
            <div className="px-2 pb-2">
              <div className="mt-2 space-y-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Auto Layout</div>
                <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                  <span>Enable</span>
                  <input
                    type="checkbox"
                    checked={Boolean(autoLayout)}
                    onChange={(e) => {
                      if (!selectedNode) return;
                      if (e.target.checked) updateNode(selectedNode.id, { layout: { ...DEFAULT_AUTO_LAYOUT } }, true);
                      else updateNode(selectedNode.id, { layout: { mode: "fixed" } }, true);
                    }}
                  />
                </label>
                {autoLayout && (
                  <div className="space-y-2">
                    <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                      <span>Gap mode</span>
                      <select
                        value={resolvedAutoLayout.gapMode ?? "fixed"}
                        onChange={(e) =>
                          updateNode(
                            selectedNode.id,
                            { layout: { ...resolvedAutoLayout, gapMode: e.target.value as "fixed" | "space-between" } },
                            true,
                          )
                        }
                        className="rounded border border-neutral-200 px-2 py-1 text-xs"
                      >
                        <option value="fixed">Fixed</option>
                        <option value="space-between">Space between</option>
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                      <span>Direction</span>
                      <select
                        value={resolvedAutoLayout.dir}
                        onChange={(e) =>
                          updateNode(
                            selectedNode.id,
                            { layout: { ...resolvedAutoLayout, dir: e.target.value as "row" | "column" } },
                            true,
                          )
                        }
                        className="rounded border border-neutral-200 px-2 py-1 text-xs"
                      >
                        <option value="row">Row</option>
                        <option value="column">Column</option>
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                      <span>Align</span>
                      <select
                        value={resolvedAutoLayout.align}
                        onChange={(e) =>
                          updateNode(
                            selectedNode.id,
                            { layout: { ...resolvedAutoLayout, align: e.target.value as AutoLayout["align"] } },
                            true,
                          )
                        }
                        className="rounded border border-neutral-200 px-2 py-1 text-xs"
                      >
                        <option value="start">Start</option>
                        <option value="center">Center</option>
                        <option value="end">End</option>
                        <option value="stretch">Stretch</option>
                        {resolvedAutoLayout.dir === "row" ? <option value="baseline">Baseline</option> : null}
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                      <span>Gap</span>
                      <input
                        type="number"
                        value={resolvedAutoLayout.gap}
                        onChange={(e) => updateNode(selectedNode.id, { layout: { ...resolvedAutoLayout, gap: Number(e.target.value) || 0 } }, true)}
                        className="w-20 rounded border border-neutral-200 px-2 py-1 text-xs"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                        <span>Padding T</span>
                        <input
                          type="number"
                          value={resolvedAutoLayout.padding.t}
                          onChange={(e) => updateNode(selectedNode.id, { layout: { ...resolvedAutoLayout, padding: { ...resolvedAutoLayout.padding, t: Number(e.target.value) || 0 } } }, true)}
                          className="w-16 rounded border border-neutral-200 px-1 py-0.5"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                        <span>Padding R</span>
                        <input
                          type="number"
                          value={resolvedAutoLayout.padding.r}
                          onChange={(e) => updateNode(selectedNode.id, { layout: { ...resolvedAutoLayout, padding: { ...resolvedAutoLayout.padding, r: Number(e.target.value) || 0 } } }, true)}
                          className="w-16 rounded border border-neutral-200 px-1 py-0.5"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                        <span>Padding B</span>
                        <input
                          type="number"
                          value={resolvedAutoLayout.padding.b}
                          onChange={(e) => updateNode(selectedNode.id, { layout: { ...resolvedAutoLayout, padding: { ...resolvedAutoLayout.padding, b: Number(e.target.value) || 0 } } }, true)}
                          className="w-16 rounded border border-neutral-200 px-1 py-0.5"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                        <span>Padding L</span>
                        <input
                          type="number"
                          value={resolvedAutoLayout.padding.l}
                          onChange={(e) => updateNode(selectedNode.id, { layout: { ...resolvedAutoLayout, padding: { ...resolvedAutoLayout.padding, l: Number(e.target.value) || 0 } } }, true)}
                          className="w-16 rounded border border-neutral-200 px-1 py-0.5"
                        />
                      </label>
                    </div>
                    <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                      <span>Wrap</span>
                      <input
                        type="checkbox"
                        checked={Boolean(resolvedAutoLayout.wrap)}
                        onChange={(e) => updateNode(selectedNode.id, { layout: { ...resolvedAutoLayout, wrap: e.target.checked } }, true)}
                      />
                    </label>
                    <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                      <span>Include stroke</span>
                      <input
                        type="checkbox"
                        checked={Boolean(resolvedAutoLayout.includeStrokeInBounds)}
                        onChange={(e) => updateNode(selectedNode.id, { layout: { ...resolvedAutoLayout, includeStrokeInBounds: e.target.checked } }, true)}
                      />
                    </label>
                  </div>
                )}

                {parentIsAutoLayout && (
                  <div className="space-y-2">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Sizing</div>
                    <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                      <span>Width</span>
                      <select value={sizing.width} onChange={(e) => updateNode(selectedNode.id, { layoutSizing: { ...sizing, width: e.target.value as "fixed" | "fill" | "hug" } }, true)} className="rounded border border-neutral-200 px-2 py-1 text-[11px]">
                        <option value="fixed">Fixed</option>
                        <option value="fill">Fill</option>
                        <option value="hug">Hug</option>
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                      <span>Height</span>
                      <select value={sizing.height} onChange={(e) => updateNode(selectedNode.id, { layoutSizing: { ...sizing, height: e.target.value as "fixed" | "fill" | "hug" } }, true)} className="rounded border border-neutral-200 px-2 py-1 text-[11px]">
                        <option value="fixed">Fixed</option>
                        <option value="fill">Fill</option>
                        <option value="hug">Hug</option>
                      </select>
                    </label>
                    <div className="grid grid-cols-2 gap-1 text-[11px]">
                      <label className="flex items-center gap-1"><span className="text-neutral-500">Min W</span><input type="number" placeholder="px" value={sizing.minWidth ?? ""} onChange={(e) => updateNode(selectedNode.id, { layoutSizing: { ...sizing, minWidth: e.target.value === "" ? undefined : Number(e.target.value) } }, true)} className="w-14 rounded border border-neutral-200 px-1 py-0.5" /></label>
                      <label className="flex items-center gap-1"><span className="text-neutral-500">Max W</span><input type="number" placeholder="px" value={sizing.maxWidth ?? ""} onChange={(e) => updateNode(selectedNode.id, { layoutSizing: { ...sizing, maxWidth: e.target.value === "" ? undefined : Number(e.target.value) } }, true)} className="w-14 rounded border border-neutral-200 px-1 py-0.5" /></label>
                      <label className="flex items-center gap-1"><span className="text-neutral-500">Min H</span><input type="number" placeholder="px" value={sizing.minHeight ?? ""} onChange={(e) => updateNode(selectedNode.id, { layoutSizing: { ...sizing, minHeight: e.target.value === "" ? undefined : Number(e.target.value) } }, true)} className="w-14 rounded border border-neutral-200 px-1 py-0.5" /></label>
                      <label className="flex items-center gap-1"><span className="text-neutral-500">Max H</span><input type="number" placeholder="px" value={sizing.maxHeight ?? ""} onChange={(e) => updateNode(selectedNode.id, { layoutSizing: { ...sizing, maxHeight: e.target.value === "" ? undefined : Number(e.target.value) } }, true)} className="w-14 rounded border border-neutral-200 px-1 py-0.5" /></label>
                    </div>
                  </div>
                )}
                {canEditConstraints && (
                  <div className="border-t border-neutral-100 pt-3 space-y-2">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Constraints</div>
                    <div className="grid grid-cols-3 gap-1 text-[11px]">
                      <button type="button" className="rounded border border-neutral-200 px-2 py-1" onClick={() => applyConstraintPreset({ left: true, top: true })}>Top Left</button>
                      <button type="button" className="rounded border border-neutral-200 px-2 py-1" onClick={() => applyConstraintPreset({ hCenter: true, top: true })}>Top Center</button>
                      <button type="button" className="rounded border border-neutral-200 px-2 py-1" onClick={() => applyConstraintPreset({ right: true, top: true })}>Top Right</button>
                      <button type="button" className="rounded border border-neutral-200 px-2 py-1" onClick={() => applyConstraintPreset({ left: true, vCenter: true })}>Center Left</button>
                      <button type="button" className="rounded border border-neutral-200 px-2 py-1" onClick={() => applyConstraintPreset({ hCenter: true, vCenter: true })}>Center</button>
                      <button type="button" className="rounded border border-neutral-200 px-2 py-1" onClick={() => applyConstraintPreset({ right: true, vCenter: true })}>Center Right</button>
                      <button type="button" className="rounded border border-neutral-200 px-2 py-1" onClick={() => applyConstraintPreset({ left: true, bottom: true })}>Bottom Left</button>
                      <button type="button" className="rounded border border-neutral-200 px-2 py-1" onClick={() => applyConstraintPreset({ hCenter: true, bottom: true })}>Bottom Center</button>
                      <button type="button" className="rounded border border-neutral-200 px-2 py-1" onClick={() => applyConstraintPreset({ right: true, bottom: true })}>Bottom Right</button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      <label className="flex items-center gap-1"><input type="checkbox" checked={Boolean(constraints.left)} onChange={(e) => updateConstraintFlag("left", e.target.checked)} />Left</label>
                      <label className="flex items-center gap-1"><input type="checkbox" checked={Boolean(constraints.right)} onChange={(e) => updateConstraintFlag("right", e.target.checked)} />Right</label>
                      <label className="flex items-center gap-1"><input type="checkbox" checked={Boolean(constraints.top)} onChange={(e) => updateConstraintFlag("top", e.target.checked)} />Top</label>
                      <label className="flex items-center gap-1"><input type="checkbox" checked={Boolean(constraints.bottom)} onChange={(e) => updateConstraintFlag("bottom", e.target.checked)} />Bottom</label>
                      <label className="flex items-center gap-1"><input type="checkbox" checked={Boolean(constraints.hCenter)} onChange={(e) => updateConstraintFlag("hCenter", e.target.checked)} />H Center</label>
                      <label className="flex items-center gap-1"><input type="checkbox" checked={Boolean(constraints.vCenter)} onChange={(e) => updateConstraintFlag("vCenter", e.target.checked)} />V Center</label>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" className="rounded border border-neutral-200 px-2 py-1 text-[11px]" onClick={() => applyConstraintPreset({ left: true, right: true })}>Stretch H</button>
                      <button type="button" className="rounded border border-neutral-200 px-2 py-1 text-[11px]" onClick={() => applyConstraintPreset({ top: true, bottom: true })}>Stretch V</button>
                      <button type="button" className="rounded border border-neutral-200 px-2 py-1 text-[11px]" onClick={() => applyConstraintPreset({ left: true, right: true, top: true, bottom: true })}>Stretch Both</button>
                      <button type="button" className="rounded border border-neutral-200 px-2 py-1 text-[11px]" onClick={clearConstraints}>Clear</button>
                    </div>
                  </div>
                )}
                {canEditLayoutGrid ? (
                  <div className="border-t border-neutral-100 pt-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 mb-1.5">Layout Grid</div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded border border-neutral-200 px-2 py-1 text-[11px]"
                        onClick={() =>
                          updateLayoutGridItems([
                            ...layoutGridItems,
                            { type: "columns", count: 12, gutter: 16, offset: 16, color: "#4F46E5", opacity: 0.1 },
                          ])
                        }
                      >
                        Add columns
                      </button>
                      <button
                        type="button"
                        className="rounded border border-neutral-200 px-2 py-1 text-[11px]"
                        onClick={() =>
                          updateLayoutGridItems([
                            ...layoutGridItems,
                            { type: "rows", count: 8, gutter: 16, offset: 16, color: "#22C55E", opacity: 0.08 },
                          ])
                        }
                      >
                        Add rows
                      </button>
                      <button
                        type="button"
                        className="rounded border border-neutral-200 px-2 py-1 text-[11px]"
                        onClick={() =>
                          updateLayoutGridItems([
                            ...layoutGridItems,
                            { type: "grid", cellSize: 8, color: "#0EA5E9", opacity: 0.08 },
                          ])
                        }
                      >
                        Add grid
                      </button>
                    </div>
                    {layoutGridItems.length === 0 ? (
                      <p className="mt-2 text-[11px] text-neutral-400">No layout grid items yet.</p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {layoutGridItems.map((item, idx) => {
                          const label = item.type === "columns" ? "Columns" : item.type === "rows" ? "Rows" : "Grid";
                          const updateItem = (patch: Partial<LayoutGridItem>) => {
                            const next = layoutGridItems.map((g, i) => (i === idx ? ({ ...g, ...patch } as LayoutGridItem) : g));
                            updateLayoutGridItems(next);
                          };
                          return (
                            <div key={`${item.type}-${idx}`} className="rounded border border-neutral-200 bg-white p-2 space-y-2">
                              <div className="flex items-center justify-between text-[11px] text-neutral-600">
                                <span>{label}</span>
                                <button
                                  type="button"
                                  className="rounded border border-neutral-200 px-2 py-0.5 text-[10px]"
                                  onClick={() => updateLayoutGridItems(layoutGridItems.filter((_, i) => i !== idx))}
                                >
                                  Remove
                                </button>
                              </div>
                              {item.type === "columns" && (
                                <>
                                  <div className="grid grid-cols-2 gap-2">
                                    <label className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                                      <span>Count</span>
                                      <input
                                        type="number"
                                        min={1}
                                        value={item.count ?? 1}
                                        onChange={(e) => updateItem({ count: Math.max(1, Number(e.target.value) || 1) })}
                                        className="w-16 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                                      />
                                    </label>
                                    <label className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                                      <span>Width</span>
                                      <input
                                        type="number"
                                        value={item.width ?? ""}
                                        onChange={(e) => {
                                          const raw = e.target.value;
                                          updateItem({ width: raw === "" ? undefined : Number(raw) });
                                        }}
                                        className="w-16 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                                      />
                                    </label>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <label className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                                      <span>Gutter</span>
                                      <input
                                        type="number"
                                        value={item.gutter ?? 0}
                                        onChange={(e) => updateItem({ gutter: Number(e.target.value) || 0 })}
                                        className="w-16 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                                      />
                                    </label>
                                    <label className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                                      <span>Offset</span>
                                      <input
                                        type="number"
                                        value={item.offset ?? 0}
                                        onChange={(e) => updateItem({ offset: Number(e.target.value) || 0 })}
                                        className="w-16 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                                      />
                                    </label>
                                  </div>
                                </>
                              )}
                              {item.type === "rows" && (
                                <>
                                  <div className="grid grid-cols-2 gap-2">
                                    <label className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                                      <span>Count</span>
                                      <input
                                        type="number"
                                        min={1}
                                        value={item.count ?? 1}
                                        onChange={(e) => updateItem({ count: Math.max(1, Number(e.target.value) || 1) })}
                                        className="w-16 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                                      />
                                    </label>
                                    <label className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                                      <span>Height</span>
                                      <input
                                        type="number"
                                        value={item.height ?? ""}
                                        onChange={(e) => {
                                          const raw = e.target.value;
                                          updateItem({ height: raw === "" ? undefined : Number(raw) });
                                        }}
                                        className="w-16 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                                      />
                                    </label>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <label className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                                      <span>Gutter</span>
                                      <input
                                        type="number"
                                        value={item.gutter ?? 0}
                                        onChange={(e) => updateItem({ gutter: Number(e.target.value) || 0 })}
                                        className="w-16 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                                      />
                                    </label>
                                    <label className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                                      <span>Offset</span>
                                      <input
                                        type="number"
                                        value={item.offset ?? 0}
                                        onChange={(e) => updateItem({ offset: Number(e.target.value) || 0 })}
                                        className="w-16 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                                      />
                                    </label>
                                  </div>
                                </>
                              )}
                              {item.type === "grid" && (
                                <label className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                                  <span>Cell size</span>
                                  <input
                                    type="number"
                                    min={1}
                                    value={item.cellSize ?? 8}
                                    onChange={(e) => updateItem({ cellSize: Math.max(1, Number(e.target.value) || 1) })}
                                    className="w-16 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                                  />
                                </label>
                              )}
                              <div className="grid grid-cols-2 gap-2">
                                <label className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                                  <span>Color</span>
                                  <input
                                    type="color"
                                    value={item.color ?? "#94A3B8"}
                                    onChange={(e) => updateItem({ color: e.target.value })}
                                    className="h-7 w-12 rounded border border-neutral-200"
                                  />
                                </label>
                                <label className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                                  <span>Opacity</span>
                                  <input
                                    type="number"
                                    step={0.05}
                                    min={0}
                                    max={1}
                                    value={item.opacity ?? 0.1}
                                    onChange={(e) => updateItem({ opacity: Math.min(1, Math.max(0, Number(e.target.value) || 0)) })}
                                    className="w-16 rounded border border-neutral-200 px-2 py-1 text-[11px]"
                                  />
                                </label>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}
                {['frame', 'section', 'component', 'instance', 'group', 'table'].includes(selectedNode.type) && (
                  <>
                    <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                      <span>Clip content</span>
                      <input type="checkbox" checked={Boolean(selectedNode.clipContent)} onChange={(e) => updateNode(selectedNode.id, { clipContent: e.target.checked }, true)} />
                    </label>
                    <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                      <span>Overflow scroll</span>
                      <select value={selectedNode.overflowScrolling ?? "none"} onChange={(e) => updateNode(selectedNode.id, { overflowScrolling: e.target.value === "none" ? undefined : (e.target.value as "vertical" | "horizontal" | "both") }, true)} className="rounded border border-neutral-200 px-2 py-1 text-xs">
                        <option value="none">None</option>
                        <option value="horizontal">Horizontal</option>
                        <option value="vertical">Vertical</option>
                        <option value="both">Both</option>
                      </select>
                    </label>
                  </>
                )}
                {selectedNode.type === 'table' && (
                  <>
                    <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                      <span>Columns</span>
                      <input type="number" min={1} value={selectedNode.table?.columns ?? 3} onChange={(e) => updateNode(selectedNode.id, { table: { ...selectedNode.table, columns: Math.max(1, Math.round(Number(e.target.value) || 1)), headerRow: selectedNode.table?.headerRow } }, true)} className="w-14 rounded border border-neutral-200 px-2 py-1 text-xs" />
                    </label>
                    <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                      <span>Header row</span>
                      <input type="checkbox" checked={Boolean(selectedNode.table?.headerRow)} onChange={(e) => updateNode(selectedNode.id, { table: { ...selectedNode.table, columns: selectedNode.table?.columns ?? 3, headerRow: e.target.checked } }, true)} />
                    </label>
                  </>
                )}
                {selectedNode.parentId && doc.nodes[selectedNode.parentId]?.overflowScrolling ? (
                  <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                    <span>Sticky</span>
                    <input type="checkbox" checked={Boolean(selectedNode.sticky)} onChange={(e) => updateNode(selectedNode.id, { sticky: e.target.checked }, true)} />
                  </label>
                ) : null}

                <div className="border-t border-neutral-100 pt-3 space-y-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Canvas Grid & Snap</div>
                  <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                    <span>Show grid</span>
                    <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                    <span>Snap to grid</span>
                    <input type="checkbox" checked={gridSnap} onChange={(e) => setGridSnap(e.target.checked)} />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                    <span>Guide snap</span>
                    <input type="checkbox" checked={guideSnap} onChange={(e) => setGuideSnap(e.target.checked)} />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                    <span>Grid size</span>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={gridSize}
                      onChange={(e) => {
                        const next = Math.max(1, Math.min(200, Number(e.target.value) || 1));
                        setGridSize(next);
                      }}
                      className="w-20 rounded border border-neutral-200 px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                    <span>Pixel grid</span>
                    <input type="checkbox" checked={showPixelGrid} onChange={(e) => setShowPixelGrid(e.target.checked)} />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                    <span>Rulers</span>
                    <input type="checkbox" checked={showRulers} onChange={(e) => setShowRulers(e.target.checked)} />
                  </label>
                </div>
              </div>
            </div>
            )}
        </div>
          <div className="rounded-md border border-neutral-100 bg-neutral-50/50 overflow-hidden">
            <button
              type="button"
              className="flex w-full items-center justify-between px-2 py-1.5 text-left text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-500 hover:bg-neutral-100"
              onClick={() => setRightPanelSections((s) => ({ ...s, media: !s.media }))}
            >
              <span>Label</span>
              <span>Label</span>
            </button>
            {rightPanelSections.media && (
              <div className="px-2 pb-2">
                <div className="mt-2 space-y-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-neutral-500">URL</span>
                    <input
                      type="text"
                      value={selectedMedia?.src ?? ""}
                      onChange={(e) => updateSelectedMedia({ src: e.target.value })}
                      placeholder="https://..."
                      className="w-full rounded border border-neutral-200 px-2 py-1 text-xs"
                    />
                  </label>
                  {selectedNode?.type === "image" ? (
                    <label className="flex flex-col gap-1">
                      <span className="text-neutral-500">File</span>
                      <input
                        type="file"
                        accept={IMAGE_FILE_ACCEPT}
                        onChange={(e) => {
                          const file = e.currentTarget.files?.[0];
                          e.currentTarget.value = "";
                          if (!file) return;
                          readFileAsDataUrl(file)
                            .then((src) => updateSelectedMedia({ src }))
                            .catch(() => pushMessage("Operation failed."));
                        }}
                        className="w-full rounded border border-neutral-200 px-2 py-1 text-xs"
                      />
                    </label>
                  ) : null}
              </div>
            </div>
            )}
        </div>
      </div>
          ) : (
            <>
              <input type="text" value={elementQuery} onChange={(e) => setElementQuery(e.target.value)} placeholder="Search elements" className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs" />
              <div className="mt-3 rounded-md border border-neutral-200 bg-white overflow-hidden">
                <div className="flex items-center justify-between bg-neutral-50 px-2 py-1.5 text-[11px] font-medium text-neutral-600">
                  <span>Template Catalog</span>
                  <span className="text-[10px] text-neutral-400">{filteredTemplateGroups.reduce((acc, group) => acc + group.items.length, 0)}</span>
                </div>
                <div className="p-2">
                  <input
                    type="text"
                    value={templateQuery}
                    onChange={(e) => setTemplateQuery(e.target.value)}
                    placeholder="Template search"
                    className="w-full rounded border border-neutral-200 px-2 py-1 text-xs"
                  />
                  {filteredTemplateGroups.length === 0 ? (
                    <div className="mt-2 text-[11px] text-neutral-400">No templates found.</div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {filteredTemplateGroups.map((group) => (
                        <div key={`tpl-${group.title}`} className="rounded border border-neutral-200 bg-white">
                          <div className="flex items-center justify-between px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-neutral-400">
              <span>Label</span>
                            <span>{group.items.length}</span>
                          </div>
                          <div className="grid grid-cols-1 gap-2 p-2">
                            {group.items.map((item) => (
                              <div key={item.id} className="rounded border border-neutral-200 bg-neutral-50 p-2">
                                <div className="text-[11px] font-medium text-neutral-700">
                                  {displayPresetLabel(item.label, item.id)}
                                </div>
                                {sanitizeDescription(item.description) ? (
                                  <div className="mt-0.5 text-[10px] text-neutral-500">{sanitizeDescription(item.description)}</div>
                                ) : null}
                                <div className="mt-2 flex gap-2">
                                  <button
                                    type="button"
                                    className="rounded border border-neutral-200 bg-white px-2 py-1 text-[10px]"
                                    onClick={() => insertPreset(item)}
                                  >
                                    Insert
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded border border-neutral-200 bg-white px-2 py-1 text-[10px]"
                                    onClick={() => insertPresetAsNewPage(item)}
                                  >
                                    New page
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {allPresetTags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {allPresetTags.map((tag) => {
                    const active = assetTagFilters.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={`rounded-full border px-2 py-0.5 text-[10px] ${
                          active ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white text-neutral-600"
                        }`}
                        onClick={() => toggleAssetTag(tag)}
                        title={tag}
                      >
                        {tag}
                      </button>
                    );
                  })}
                  {assetTagFilters.length > 0 ? (
                    <button
                      type="button"
                      className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[10px] text-neutral-500"
                      onClick={clearAssetTags}
                    >
                      clear
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-3 space-y-1">
                {filteredPresetGroups.map((group) => {
                  const isOpen = assetsAccordionOpen[group.title] !== false;
                  const groupTitle = displayPresetGroupTitle(group.title, group.items[0]?.id ?? "group");
                  const groupIcon = (group as { icon?: string }).icon;
                  return (
                    <div key={group.title} className="rounded-md border border-neutral-200 bg-white overflow-hidden">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between bg-neutral-50 px-2 py-1.5 text-left text-[11px] font-medium text-neutral-600 hover:bg-neutral-100"
                        onClick={() => toggleAssetsAccordion(group.title)}
                      >
                        <span>{groupTitle}</span>
                        <span>Label</span>
                      </button>
                      {isOpen ? (
                        <div className="grid grid-cols-2 gap-1.5 p-2">
                          {group.items.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              data-preset-id={item.id}
                              className="rounded border border-neutral-100 px-2 py-1.5 text-left text-[11px] hover:bg-neutral-50"
                              onClick={() => insertPreset(item)}
                              title={sanitizeDescription(item.description) || undefined}
                            >
                              <span className="block">{displayPresetLabel(item.label, item.id)}</span>
                              {sanitizeDescription(item.description) ? <span className="block text-[9px] text-neutral-400 mt-0.5 truncate">{sanitizeDescription(item.description)}</span> : null}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <input type="text" value={resourceQuery} onChange={(e) => setResourceQuery(e.target.value)} placeholder="Search resources" className="mt-4 w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs" />
              <div className="mt-2 space-y-1">
                {filteredResourceGroups.map((group) => {
                  const isOpen = assetsAccordionOpen[group.title] !== false;
                  const groupTitle = displayPresetGroupTitle(group.title, group.items[0]?.id ?? "group");
                  return (
                    <div key={`res-${group.title}`} className="rounded-md border border-neutral-200 bg-white overflow-hidden">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between bg-neutral-50 px-2 py-1.5 text-left text-[11px] font-medium text-neutral-600 hover:bg-neutral-100"
                        onClick={() => toggleAssetsAccordion(group.title)}
                      >
                        <span>{groupTitle}</span>
                        <span>Label</span>
                      </button>
                      {isOpen ? (
                        <div className="grid grid-cols-2 gap-1.5 p-2 max-h-40 overflow-y-auto">
                          {group.items.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              data-preset-id={item.id}
                              className="rounded border border-neutral-100 px-2 py-1.5 text-left text-[11px] hover:bg-neutral-50"
                              onClick={() => insertPreset(item)}
                              title={sanitizeDescription(item.description) || undefined}
                            >
                              <span className="block">{displayPresetLabel(item.label, item.id)}</span>
                              {sanitizeDescription(item.description) ? <span className="block text-[9px] text-neutral-400 mt-0.5 truncate">{sanitizeDescription(item.description)}</span> : null}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </aside>
      ) : null}

      <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <header className="relative z-50 h-14 shrink-0 overflow-x-auto overflow-y-hidden border-b border-neutral-200 bg-white" role="toolbar" aria-label="Editor toolbar">
          <div className="flex h-full min-w-max items-center justify-between gap-2 px-4">
          <div className="flex shrink-0 items-center gap-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Untitled"
              className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1 text-sm"
            />
            <div className="flex items-center gap-2">
              {TOOL_GROUPS.map((group, gi) => {
                const activeInGroup = group.ids.includes(tool);
                const displayId = activeInGroup ? tool : group.ids[0];
                const displayOpt = TOOL_OPTIONS.find((o) => o.id === displayId);
                const isOpen = toolbarDropdown === `group-${gi}`;
                return (
                  <div key={gi} className="relative flex items-center gap-1">
                    {gi > 0 && <span className="h-4 w-px bg-neutral-200" aria-hidden />}
                    <button
                      ref={isOpen ? toolbarDropdownRef : undefined}
                      type="button"
                      className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${
                        activeInGroup ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50"
                      }`}
                      onClick={() => setToolbarDropdown(isOpen ? null : `group-${gi}`)}
                      aria-expanded={isOpen}
                      aria-haspopup="true"
                    >
                      {displayOpt?.label ?? ""}
                      <span className="opacity-70" aria-hidden></span>
                    </button>
                    {isOpen && typeof document !== "undefined"
                      ? createPortal(
                          <>
                            <div className="fixed inset-0 z-[9998]" aria-hidden onClick={() => setToolbarDropdown(null)} />
                            <div
                              className="fixed z-[9999] min-w-[120px] rounded-md border border-neutral-200 bg-white py-1 shadow-lg"
                              style={{ left: toolbarDropdownRect.left, top: toolbarDropdownRect.top }}
                            >
                              {group.ids.map((id) => {
                                const opt = TOOL_OPTIONS.find((o) => o.id === id);
                                if (!opt) return null;
                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    className={`flex w-full px-3 py-1.5 text-left text-xs ${
                                      tool === opt.id ? "bg-neutral-100 font-medium text-neutral-900" : "text-neutral-700 hover:bg-neutral-50"
                                    }`}
                                    onClick={() => { setTool(opt.id); setToolbarDropdown(null); }}
                                  >
                                    {opt.label}
                                  </button>
                                );
                              })}
                            </div>
                          </>,
                          document.body,
                        )
                      : null}
                  </div>
                );
              })}
              <span className="h-4 w-px bg-neutral-200" aria-hidden />
              <div className="relative">
                <button
                  ref={toolbarOverflowOpen ? toolbarOverflowRef : undefined}
                  type="button"
                  className={`rounded-full border px-3 py-1 text-xs ${toolbarOverflowOpen ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50"}`}
                  onClick={() => { setToolbarOverflowOpen((o) => !o); setToolbarDropdown(null); }}
                  aria-expanded={toolbarOverflowOpen}
                  aria-label="More tools"
                >
                  More
                </button>
                {toolbarOverflowOpen && typeof document !== "undefined"
                  ? createPortal(
                      <>
                        <div className="fixed inset-0 z-[9998]" aria-hidden onClick={() => setToolbarOverflowOpen(false)} />
                        <div
                          className="fixed z-[9999] min-w-[180px] rounded-md border border-neutral-200 bg-white py-1 shadow-lg text-xs"
                          style={{ left: toolbarOverflowRect.left, top: toolbarOverflowRect.top }}
                        >
                      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Tools</div>
                      <button type="button" className="flex w-full items-center justify-between px-3 py-1.5 text-left text-neutral-700 hover:bg-neutral-50" onClick={() => { setTool("comment"); setToolbarOverflowOpen(false); }}>
                        Comments
                        {comments.length > 0 ? <span>Label</span> : null}
                      </button>
                      <button type="button" className="flex w-full px-3 py-1.5 text-left text-neutral-700 hover:bg-neutral-50" onClick={() => { setTool("slice"); setToolbarOverflowOpen(false); }}>Slice</button>
                      <div className="my-1 h-px bg-neutral-200" />
                      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Boolean</div>
                      <button type="button" className="flex w-full px-3 py-1.5 text-left text-neutral-700 hover:bg-neutral-50 disabled:opacity-50" disabled={selectedIds.length < 2} onClick={() => { runBooleanSelection("union"); setToolbarOverflowOpen(false); }}>Union</button>
                      <button type="button" className="flex w-full px-3 py-1.5 text-left text-neutral-700 hover:bg-neutral-50 disabled:opacity-50" disabled={selectedIds.length < 2} onClick={() => { runBooleanSelection("subtract"); setToolbarOverflowOpen(false); }}>Subtract</button>
                      <button type="button" className="flex w-full px-3 py-1.5 text-left text-neutral-700 hover:bg-neutral-50 disabled:opacity-50" disabled={selectedIds.length < 2} onClick={() => { runBooleanSelection("intersect"); setToolbarOverflowOpen(false); }}>Intersect</button>
                      <button type="button" className="flex w-full px-3 py-1.5 text-left text-neutral-700 hover:bg-neutral-50 disabled:opacity-50" disabled={selectedIds.length < 2} onClick={() => { runBooleanSelection("exclude"); setToolbarOverflowOpen(false); }}>Exclude</button>
                      <div className="my-1 h-px bg-neutral-200" />
                      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Vector</div>
                      <button type="button" className="flex w-full px-3 py-1.5 text-left text-neutral-700 hover:bg-neutral-50 disabled:opacity-50" disabled={!canJoinSelection} onClick={() => { joinSelectionToPath(); setToolbarOverflowOpen(false); }}>Join to Path</button>
                      <button type="button" className="flex w-full px-3 py-1.5 text-left text-neutral-700 hover:bg-neutral-50 disabled:opacity-50" disabled={!canFlattenSelection} onClick={() => { flattenSelectionToPath(); setToolbarOverflowOpen(false); }}>Flatten to Path</button>
                      <div className="my-1 h-px bg-neutral-200" />
                      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Mask</div>
                      <button type="button" className="flex w-full px-3 py-1.5 text-left text-neutral-700 hover:bg-neutral-50 disabled:opacity-50" disabled={selectedIds.length !== 1} onClick={() => { applyMaskSelection(); setToolbarOverflowOpen(false); }}>Make mask</button>
                      <button type="button" className="flex w-full px-3 py-1.5 text-left text-neutral-700 hover:bg-neutral-50 disabled:opacity-50" disabled={selectedIds.length !== 1 || !selectedNode?.isMask} onClick={() => { releaseMaskSelection(); setToolbarOverflowOpen(false); }}>Release mask</button>
                      <div className="my-1 h-px bg-neutral-200" />
                      <button type="button" className="flex w-full px-3 py-1.5 text-left text-neutral-700 hover:bg-neutral-50" onClick={() => { setFigmaImportOpen(true); setToolbarOverflowOpen(false); }}>Import from Figma</button>
                        </div>
                      </>,
                      document.body,
                    )
                : null}
              </div>
            </div>
          </div>

          <div className="flex min-w-max shrink-0 flex-nowrap items-center gap-2 overflow-x-auto py-1">
            <button type="button" className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-xs" onClick={() => align("l")}>Align left</button>
            <button type="button" className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-xs" onClick={() => align("hc")}>Align center</button>
            <button type="button" className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-xs" onClick={() => align("r")}>Align right</button>
            <button type="button" className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-xs" onClick={() => matchSelectionSize("w")}>Match width</button>
            <button type="button" className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-xs" onClick={() => matchSelectionSize("h")}>Match height</button>
            <button type="button" className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-xs" onClick={snapSelectionToGrid}>Snap to grid</button>
            <button type="button" className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-xs" onClick={() => flipSelection("h")}>Flip horizontal</button>
            <button type="button" className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-xs" onClick={() => flipSelection("v")}>Flip vertical</button>
            <button type="button" className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-xs" onClick={() => distribute("h")}>Distribute horizontal</button>
            <button type="button" className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-xs" onClick={() => distribute("v")}>Distribute vertical</button>
            <button type="button" className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-xs" onClick={clearSelection} disabled={!hasSelection}>Clear selection</button>
            <button type="button" className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-xs" onClick={invertSelection}>Invert selection</button>
            <button type="button" className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-xs" onClick={tidyUpSelection} disabled={selectedIds.length < 2}>Tidy up</button>
            <button type="button" className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-xs" onClick={openRepeatGrid} disabled={!hasSelection}>Repeat grid</button>
            <div className="flex shrink-0 items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-1 text-xs">
              <button type="button" className="px-2" onClick={fitSelectionToContent} disabled={!hasSelection}>Fit to content</button>
              <button type="button" className="px-2" onClick={toggleSelectionHidden} disabled={!hasSelection}>
                {selectionHidden ? "Show selection" : "Hide selection"}
              </button>
              <button type="button" className="px-2" onClick={toggleSelectionLocked} disabled={!hasSelection}>
                {selectionLocked ? "Unlock selection" : "Lock selection"}
              </button>
            </div>
            <div className="flex shrink-0 items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-1 text-xs">
              <button type="button" className="px-1" onClick={() => zoomBy(-0.1)}>-</button>
              <button type="button" className="px-2" onClick={zoomReset}>{zoomPercent}%</button>
              <button type="button" className="px-1" onClick={() => zoomBy(0.1)}>+</button>
              <button type="button" className="px-2" onClick={zoomToSelection}>Fit selection</button>
              <button type="button" className="px-2" onClick={zoomToContent}>Fit content</button>
              <button type="button" className="px-2" onClick={zoomToPage}>Fit page</button>
            </div>
            <div className="flex shrink-0 items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-1 text-xs">
              <button type="button" className="px-2" onClick={() => setShowGrid((prev) => !prev)}>Grid {showGrid ? "On" : "Off"}</button>
              <button type="button" className="px-2" onClick={() => setShowPixelGrid((prev) => !prev)}>Pixel grid {showPixelGrid ? "On" : "Off"}</button>
              <button type="button" className="px-2" onClick={() => setOutlineMode((prev) => !prev)}>Outline {outlineMode ? "On" : "Off"}</button>
              <button type="button" className="px-2" onClick={() => setShowRulers((prev) => !prev)}>Rulers {showRulers ? "On" : "Off"}</button>
              <button type="button" className="px-2" onClick={() => setUiHidden((prev) => !prev)}>UI {uiHidden ? "Hidden" : "Visible"}</button>
            </div>
            <button type="button" className="shrink-0 rounded-full border border-neutral-200 px-2 py-1 text-xs" onClick={doUndo} disabled={undoStackLen === 0} title="Undo (Ctrl+Z)" aria-label="Undo">Undo</button>
            <button type="button" className="shrink-0 rounded-full border border-neutral-200 px-2 py-1 text-xs" onClick={doRedo} disabled={redoStackLen === 0} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">Redo</button>
            <span className="shrink-0 rounded-full border border-neutral-200 px-2 py-1 text-[11px] text-neutral-600" title="Plan limits (buttons/texts/images)">
              Plan limits: Buttons {constraintCounts.buttons}/{planFeatures?.maxButtons ?? 3} | Texts {constraintCounts.texts}/{planFeatures?.maxTexts ?? 6} | Images {constraintCounts.images}/{planFeatures?.maxImages ?? 1}
            </span>
            <button type="button" className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-xs" onClick={groupSelected}>Group</button>
            <button type="button" className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-xs" onClick={ungroupSelected}>Ungroup</button>
            <button type="button" className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-xs" onClick={sendToBack}>Send to back</button>
            <button type="button" className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-xs" onClick={bringToFront}>Bring to front</button>
            <button type="button" className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-xs" onClick={sendBackward}>Send backward</button>
            <button type="button" className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-xs" onClick={bringForward}>Bring forward</button>
            <button
              type="button"
              className={`rounded-full border px-3 py-1 text-xs ${
                livePreview ? "border-emerald-600 bg-emerald-600 text-white" : "border-neutral-200 bg-white text-neutral-600"
              }`}
              onClick={toggleLivePreview}
            >
              {livePreview ? "Live preview: On" : "Live preview"}
              </button>
              <button
                type="button"
                className={`rounded-full border px-3 py-1 text-xs ${
                  prototypePreview ? "border-blue-600 bg-blue-600 text-white" : "border-neutral-200 bg-white text-neutral-600"
                }`}
                onClick={togglePrototypePreview}
              >
                {prototypePreview ? "Prototype preview: On" : "Prototype preview"}
              </button>
              <button
                type="button"
                className="rounded-full border border-neutral-900 bg-neutral-900 px-3 py-1 text-xs text-white"
                onClick={saveDraft}
                disabled={status !== "idle" || (Boolean(pageId) && !isOwner)}
                title={pageId && !isOwner ? "Read-only" : undefined}
              >
                {status === "saving" ? (
                  <>
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white mr-1" />
                    Saving...
                  </>
                ) : "Save"}
              </button>
              <button
                type="button"
                className="shrink-0 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs"
                onClick={() => pageId && setVersionListOpen(true)}
                disabled={!pageId}
                title="Open version history"
                aria-label="Open version history"
              >
                Versions
              </button>
              <button type="button" className="rounded-full border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-50" onClick={() => setShortcutHelpOpen(true)} title="Shortcut help (Ctrl+/)">?</button>
              <button
                type="button"
                className="rounded-full border border-neutral-900 bg-neutral-900 px-3 py-1 text-xs text-white"
                onClick={openPublishModal}
                disabled={status !== "idle"}
              >
                {status === "publishing" ? (
                  <>
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white mr-1" />
                    Publishing...
                  </>
                ) : "Publish"}
              </button>
            </div>
          </div>
        </header>

        {repeatGridOpen && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Repeat grid"
            onClick={() => setRepeatGridOpen(false)}
          >
            <div className="w-full max-w-sm rounded-[14px] bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-neutral-200 pb-2 mb-3">
                <h2 className="text-sm font-medium text-neutral-900">Repeat Grid</h2>
                <button type="button" className="rounded p-1 text-neutral-500 hover:bg-neutral-100" onClick={() => setRepeatGridOpen(false)} aria-label="Close">Close</button>
              </div>
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-neutral-500">Rows</span>
                    <input type="number" min={1} value={repeatGridRows} onChange={(e) => setRepeatGridRows(Math.max(1, Number(e.target.value) || 1))} className="w-full rounded border border-neutral-200 px-2 py-1" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-neutral-500">Columns</span>
                    <input type="number" min={1} value={repeatGridCols} onChange={(e) => setRepeatGridCols(Math.max(1, Number(e.target.value) || 1))} className="w-full rounded border border-neutral-200 px-2 py-1" />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-neutral-500">Gap X</span>
                    <input type="number" value={repeatGridGapX} onChange={(e) => setRepeatGridGapX(Number(e.target.value) || 0)} className="w-full rounded border border-neutral-200 px-2 py-1" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-neutral-500">Gap Y</span>
                    <input type="number" value={repeatGridGapY} onChange={(e) => setRepeatGridGapY(Number(e.target.value) || 0)} className="w-full rounded border border-neutral-200 px-2 py-1" />
                  </label>
                </div>
                <p className="text-[11px] text-neutral-500">Applies spacing between repeated items.</p>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs" onClick={() => setRepeatGridOpen(false)}>Cancel</button>
                <button type="button" className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs text-white" onClick={applyRepeatGrid}>Apply</button>
              </div>
            </div>
          </div>
        )}

        {versionListOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-label="Version history" onClick={() => setVersionListOpen(false)}>
            <div className="max-h-[80vh] w-full max-w-md rounded-lg border border-neutral-200 bg-white shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
                <h2 className="text-sm font-medium text-neutral-900">Version History</h2>
                <button type="button" className="rounded p-1 text-neutral-500 hover:bg-neutral-100" onClick={() => setVersionListOpen(false)} aria-label="Close">Close</button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="mb-4 rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs space-y-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Branch</div>
                  <div className="grid grid-cols-1 gap-2">
                    <input type="text" value={branchNameInput} onChange={(e) => setBranchNameInput(e.target.value)} placeholder="Branch name" className="w-full rounded border border-neutral-200 px-2 py-1 text-xs" />
                    <div className="flex items-center gap-2">
                      <select value={branchTargetVersionId} onChange={(e) => setBranchTargetVersionId(e.target.value)} className="flex-1 rounded border border-neutral-200 px-2 py-1 text-xs">
                        <option value="">Base version</option>
                        {versionList.map((v) => (
                          <option key={v.id} value={v.id}>{new Date(v.created_at).toLocaleString("ko-KR")}</option>
                        ))}
                      </select>
                      <button type="button" className="rounded border border-neutral-200 bg-white px-2 py-1 text-xs" onClick={createBranch}>Create</button>
                    </div>
                  </div>
                  {Object.keys(branches).length ? (
                    <div className="space-y-2">
                      {Object.entries(branches).map(([name, versionId]) => {
                        const branchCount = versionPreviewNodeCount[versionId];
                        const draftCount = Object.keys(doc.nodes).length;
                        const diff = branchCount != null ? branchCount - draftCount : null;
                        const nodeDiff = getVersionNodeDiff(versionId);
                        const isCurrent = versionId === currentVersionId;
                        return (
                          <div key={name} className="rounded border border-neutral-100 bg-neutral-50/70 px-2 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <div className="text-[11px] text-neutral-700">{name}</div>
                                <div className="text-[10px] text-neutral-400">{versionId.slice(0, 8)}{isCurrent ? " (Current)" : ""}</div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button type="button" className="rounded border border-neutral-200 bg-white px-2 py-1 text-[10px]" onClick={() => fetchVersionPreview(versionId)}>Preview</button>
                                <button type="button" className="rounded border border-neutral-200 bg-white px-2 py-1 text-[10px]" onClick={() => checkoutBranch(name)}>Checkout</button>
                                <button type="button" className="rounded border border-neutral-200 bg-white px-2 py-1 text-[10px]" onClick={() => mergeBranch(name)}>Merge</button>
                                <button type="button" className="rounded border border-neutral-200 bg-white px-2 py-1 text-[10px]" onClick={() => removeBranch(name)}>Remove</button>
                              </div>
                            </div>
                            {branchCount != null ? (
                              <div className="mt-1 text-[10px] text-neutral-500">
                                Nodes {branchCount}
                                {diff !== null && diff !== 0 ? (
                                  <span>Label</span>
                                ) : null}
                                {nodeDiff ? (
                                  <span className="ml-2 text-[10px] text-neutral-500">Added {nodeDiff.added} ? Removed {nodeDiff.removed}{versionPreviewNodeIdsTruncated[versionId] ? " (truncated)" : ""}</span>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-[11px] text-neutral-400">No branches</div>
                  )}
                </div>
                {versionListLoading ? (
                  <p className="text-xs text-neutral-500">Loading...</p>
                ) : versionList.length === 0 ? (
                  <p className="text-xs text-neutral-500">No versions yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {versionList.map((v) => {
                      const prevCount = versionPreviewNodeCount[v.id];
                      const draftCount = Object.keys(doc.nodes).length;
                      const diff = prevCount != null ? prevCount - draftCount : null;
                      const nodeDiff = getVersionNodeDiff(v.id);
                      const isCurrent = v.id === currentVersionId;
                      return (
                        <li key={v.id} className="rounded border border-neutral-100 bg-neutral-50/50 px-3 py-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-neutral-600">{new Date(v.created_at).toLocaleString("ko-KR")}</span>
                              {isCurrent && (<span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">Current</span>)}
                            </div>
                            <div className="flex items-center gap-1">
                              <button type="button" className="rounded border border-neutral-300 bg-white px-2 py-1 text-[11px] hover:bg-neutral-100" onClick={() => fetchVersionPreview(v.id)} title="Preview this version">Preview</button>
                              <button type="button" className="rounded border border-neutral-300 bg-white px-2 py-1 text-[11px] hover:bg-neutral-100 disabled:opacity-50" onClick={() => restoreVersion(v.id)} disabled={versionRestoring !== null || isCurrent}>{versionRestoring === v.id ? "Restoring..." : "Restore"}</button>
                            </div>
                          </div>
                          {prevCount != null && (
                            <p className="mt-1 text-neutral-500">
                              Nodes {prevCount}
                              {diff !== null && diff !== 0 && (<span>Label</span>)}
                              {nodeDiff ? (<span className="ml-2 text-[10px] text-neutral-500">Added {nodeDiff.added} ? Removed {nodeDiff.removed}{versionPreviewNodeIdsTruncated[v.id] ? " (truncated)" : ""}</span>) : null}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {showPublishModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-6" role="dialog" aria-modal="true" aria-label="Publish preview" onClick={() => setShowPublishModal(false)}>
            <div className="w-full max-w-md rounded-[14px] bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm font-medium text-neutral-900">Publish Preview</p>
              <p className="mt-1 text-xs text-neutral-500">This will publish the current state and generate a public preview.</p>
              <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 overflow-hidden" style={{ height: 200 }}>
                <div className="h-full w-full overflow-hidden" style={{ transform: "scale(0.3)", transformOrigin: "top left", width: "333%", height: "333%" }}>
                  <AdvancedRuntimeRenderer doc={layoutDoc(hydrateDoc(doc))} activePageId={doc.prototype?.startPageId ?? doc.pages[0]?.id} />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs" onClick={() => setShowPublishModal(false)}>Cancel</button>
                <button type="button" className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs text-white" onClick={() => void doPublish()}>Publish</button>
              </div>
            </div>
          </div>
        )}

        {shortcutHelpOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-label="Shortcut help" onClick={() => setShortcutHelpOpen(false)}>
            <div className="max-h-[85vh] w-full max-w-sm rounded-lg border border-neutral-200 bg-white shadow-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
                <h2 className="text-sm font-medium text-neutral-900">Shortcut Help</h2>
                <button type="button" className="rounded p-1 text-neutral-500 hover:bg-neutral-100" onClick={() => setShortcutHelpOpen(false)} aria-label="Close">Close</button>
              </div>
              <div className="overflow-y-auto p-4 text-xs space-y-3">
                <div>
                  <span className="font-medium text-neutral-600">Tools</span>
                  <ul className="mt-1 space-y-0.5 text-neutral-700">
                    <li>V Select</li>
                    <li>F Frame</li>
                    <li>R Rectangle</li>
                    <li>O Ellipse</li>
                    <li>L Line</li>
                    <li>T Text</li>
                    <li>P Pen</li>
                    <li>H Hand</li>
                  </ul>
                </div>
                <div>
                  <span className="font-medium text-neutral-600">Editing</span>
                  <ul className="mt-1 space-y-0.5 text-neutral-700">
                    <li>Ctrl+C Copy / X Cut / V Paste</li>
                    <li>Del, Backspace Remove</li>
                    <li>Ctrl+Z Undo / Shift+Z Redo</li>
                    <li>Ctrl+S Save version</li>
                    <li>Ctrl+G Group / Shift+G Ungroup</li>
                    <li>Ctrl+A Select all / Shift+A Deselect all</li>
                  </ul>
                </div>
                <div>
                  <span className="font-medium text-neutral-600">View</span>
                  <ul className="mt-1 space-y-0.5 text-neutral-700">
                    <li>Ctrl+0 100% / 1 Fit to screen / + - Zoom</li>
                  </ul>
                </div>
                <div>
                  <span className="font-medium text-neutral-600">Other</span>
                  <ul className="mt-1 space-y-0.5 text-neutral-700">
                    <li>Esc Cancel / Clear selection</li>
                    <li>? or Ctrl+/ Open help</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {figmaImportOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-label="Figma import" onClick={() => { setFigmaImportOpen(false); setFigmaImportError(null); }}>
            <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white shadow-xl p-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-neutral-200 pb-3 mb-3">
                <h2 className="text-sm font-medium text-neutral-900">Figma Import</h2>
                <button type="button" className="rounded p-1 text-neutral-500 hover:bg-neutral-100" onClick={() => { setFigmaImportOpen(false); setFigmaImportError(null); }} aria-label="Close">Close</button>
              </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="rounded-md border border-neutral-200 bg-white px-3 py-2 space-y-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Step Reference</div>
                  <div className="text-[10px] text-neutral-500 space-y-1 font-mono">
                    <div>create_record: collection, data</div>
                    <div>update_record: collection, recordId, data</div>
                    <div>delete_record: collection, recordId</div>
                    <div>api_call: url, method, headers, body</div>
                    <div>set_variable: key, value</div>
                    <div>condition: if, then, else</div>
                    <div>loop: items, variable, steps</div>
                    <div>delay: ms</div>
                    <div>log: message</div>
                  </div>
                </div>
              </div>
            ) : null}
                                    {panelMode === "export" ? (
              <div className="mt-4 space-y-4 text-xs">
                <div className="rounded-md border border-neutral-200 bg-white px-3 py-2 space-y-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Performance / Audit</div>
                  <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                    <span>Performance Mode</span>
                    <input type="checkbox" checked={performanceMode} onChange={(e) => setPerformanceMode(e.target.checked)} />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                    <span>Audit Mode</span>
                    <input type="checkbox" checked={auditMode} onChange={(e) => setAuditMode(e.target.checked)} />
                  </label>
                  {auditMode ? (
                    <div className="space-y-2">
                      <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                        <span>Scope</span>
                        <select value={auditScope} onChange={(e) => setAuditScope(e.target.value as "page" | "document")} className="w-28 rounded border border-neutral-200 px-2 py-1">
                          <option value="page">Page</option>
                          <option value="document">Document</option>
                        </select>
                      </label>
                      <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                        <span>Filter</span>
                        <select
                          value={auditFilter}
                          onChange={(e) =>
                            setAuditFilter(e.target.value as "all" | "contrast" | "font-size" | "tiny" | "opacity")
                          }
                          className="w-28 rounded border border-neutral-200 px-2 py-1"
                        >
                          <option value="all">All</option>
                          <option value="contrast">Contrast</option>
                          <option value="font-size">Font size</option>
                          <option value="tiny">Tiny text</option>
                          <option value="opacity">Opacity</option>
                        </select>
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={auditSearch}
                          onChange={(e) => setAuditSearch(e.target.value)}
                          placeholder="Search issues"
                          className="w-full rounded border border-neutral-200 px-2 py-1 text-xs"
                        />
                        <button
                          type="button"
                          className="rounded border border-neutral-200 px-2 py-1 text-xs"
                          onClick={() => setAuditSearch("")}
                          disabled={!auditSearch.trim()}
                        >
                          Clear
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[11px] text-neutral-500">
                        <span>Contrast {auditCounts.contrast}</span>
                        <span>Font size {auditCounts["font-size"]}</span>
                        <span>Tiny text {auditCounts.tiny}</span>
                        <span>Opacity {auditCounts.opacity}</span>
                      </div>
                      {filteredAuditIssues.length ? (
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {filteredAuditIssues.slice(0, 20).map((issue) => (
                            <div key={issue.id} className="flex items-center justify-between gap-2 rounded border border-neutral-100 bg-neutral-50 px-2 py-1 text-[11px]">
                              <span className="text-neutral-600">{issue.message}</span>
                              <button type="button" className="rounded border border-neutral-200 px-2 py-0.5 text-[10px]" onClick={() => replace({ ...docRef.current, selection: new Set([issue.nodeId]) })}>Select</button>
                            </div>
                          ))}
                          {filteredAuditIssues.length > 20 ? (
                            <div className="text-[10px] text-neutral-400">+{filteredAuditIssues.length - 20} more</div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="text-[11px] text-neutral-400">No issues</div>
                      )}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-md border border-neutral-200 bg-white px-3 py-2 space-y-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Collaboration</div>
                  <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                    <span>Presence</span>
                    <input type="checkbox" checked={collabEnabled} onChange={(e) => setCollabEnabled(e.target.checked)} />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                    <span>Name</span>
                    <input type="text" value={collabName} onChange={(e) => setCollabName(e.target.value)} className="w-28 rounded border border-neutral-200 px-2 py-1" />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                    <span>Color</span>
                    <input type="color" value={collabColor} onChange={(e) => setCollabColor(e.target.value)} className="h-6 w-10 rounded border border-neutral-200" />
                  </label>
                  <div className="text-[11px] text-neutral-500">Peers: {collabPeerList.length}</div>
                  {collabPeerList.length ? (
                    <div className="flex flex-wrap gap-2">
                      {collabPeerList.map((peer) => (
                        <span key={peer.id} className="rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: peer.color, color: peer.color }}>
                          {peer.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-neutral-400">No other users</div>
                  )}
                </div>

                <div className="rounded-md border border-neutral-200 bg-white px-3 py-2 space-y-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Plugins</div>
                  {allPlugins.length ? (
                    <div className="space-y-2">
                      {allPlugins.map((plugin) => (
                        <div key={plugin.id} className="rounded border border-neutral-100 bg-neutral-50/70 px-2 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="text-[11px] font-medium text-neutral-700">{plugin.name}</div>
                              {sanitizeDescription(plugin.description) ? <div className="text-[10px] text-neutral-400">{sanitizeDescription(plugin.description)}</div> : null}
                            </div>
                            {!builtinPluginIds.has(plugin.id) ? (
                              <button type="button" className="rounded border border-neutral-200 px-2 py-0.5 text-[10px]" onClick={() => removePlugin(plugin.id)}>Remove</button>
                            ) : (
                              <span className="text-[10px] text-neutral-400">Built-in</span>
                            )}
                          </div>
                          {plugin.actions?.length ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {plugin.actions.map((action) => (
                                <button
                                  key={action.id}
                                  type="button"
                                  className="rounded border border-neutral-200 bg-white px-2 py-0.5 text-[10px]"
                                  onClick={() => runPluginAction(action)}
                                >
                                  {action.label}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-2 text-[10px] text-neutral-400">No actions</div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-neutral-400">No plugins installed</div>
                  )}
                  <div className="space-y-2">
                    <textarea
                      value={pluginJson}
                      onChange={(e) => setPluginJson(e.target.value)}
                      placeholder="Paste manifest JSON"
                      className="h-24 w-full rounded border border-neutral-200 bg-white p-2 text-[11px] font-mono"
                    />
                    {pluginError ? <div className="text-[11px] text-red-500">{pluginError}</div> : null}
                    <button type="button" className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs" onClick={installPluginFromJson}>
                      Install plugin
                    </button>
                  </div>
                </div>

                <div className="rounded-md border border-neutral-200 bg-white px-3 py-2 space-y-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Export Settings</div>
                  <div className="mt-2 space-y-2">
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-neutral-500">Page</span>
                      <select
                        value={activeExportPageId ?? ""}
                        onChange={(e) => setExportPageId(e.target.value || null)}
                        className="w-32 rounded border border-neutral-200 px-2 py-1"
                      >
                        {doc.pages.map((page) => (
                          <option key={page.id} value={page.id}>
                            {page.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-neutral-500">Scope</span>
                      <select
                        value={exportScope}
                        onChange={(e) => setExportScope(e.target.value as "page" | "selection")}
                        className="w-32 rounded border border-neutral-200 px-2 py-1"
                      >
                        <option value="page">Page</option>
                        <option value="selection" disabled={!hasSelection}>
                          Selection
                        </option>
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-neutral-500">Scale</span>
                      <select
                        value={exportScale}
                        onChange={(e) => setExportScale(Number(e.target.value))}
                        className="w-24 rounded border border-neutral-200 px-2 py-1"
                      >
                        <option value={1}>1x</option>
                        <option value={2}>2x</option>
                        <option value={3}>3x</option>
                      </select>
                    </label>
                    {exportScope === "page" ? (
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-neutral-500">Content only</span>
                        <input
                          type="checkbox"
                          checked={exportContentOnly}
                          onChange={(e) => setExportContentOnly(e.target.checked)}
                        />
                      </label>
                    ) : null}
                  </div>
                </div>

                {selectedNode && (
                  <div className="rounded-md border border-neutral-200 bg-white px-3 py-2 space-y-2">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Selected Node Export Settings</div>
                    <div className="mt-2 space-y-1">
                      {(selectedNode.exportSettings ?? []).map((es, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 rounded border border-neutral-100 px-2 py-1 text-[11px]">
                          <span>{es.format.toUpperCase()} @{es.scale}x</span>
                          <button type="button" className="rounded border border-neutral-200 px-1 py-0.5" onClick={() => { const next = [...(selectedNode.exportSettings ?? [])]; next.splice(i, 1); updateNode(selectedNode.id, { exportSettings: next.length ? next : undefined }, true); }}>Remove</button>
                        </div>
                      ))}
                      <div className="flex items-center gap-1 flex-wrap">
                        <select id="export-add-format" className="rounded border border-neutral-200 px-2 py-1 text-[11px]" defaultValue="png">
                          <option value="png">PNG</option>
                          <option value="svg">SVG</option>
                          <option value="pdf">PDF</option>
                        </select>
                        <select id="export-add-scale" className="rounded border border-neutral-200 px-2 py-1 text-[11px]" defaultValue="1">
                          <option value={1}>1x</option>
                          <option value={2}>2x</option>
                          <option value={3}>3x</option>
                        </select>
                        <button
                          type="button"
                          className="rounded border border-neutral-200 px-2 py-1 text-[11px]"
                          onClick={() => {
                            const format = (document.getElementById("export-add-format") as HTMLSelectElement)?.value as "png" | "svg" | "pdf";
                            const scale = Number((document.getElementById("export-add-scale") as HTMLSelectElement)?.value || 1);
                            const next = [...(selectedNode.exportSettings ?? []), { format, scale }];
                            updateNode(selectedNode.id, { exportSettings: next }, true);
                          }}
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          className="rounded border border-neutral-200 px-2 py-1 text-[11px]"
                          onClick={exportByNodeSettings}
                          disabled={!Array.from(doc.selection).some((id) => doc.nodes[id]?.exportSettings?.length)}
                          title="Exports only nodes that have export settings"
                        >
                          Export by node settings
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-md border border-neutral-200 bg-white px-3 py-2 space-y-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Export</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="rounded border border-neutral-200 px-2 py-1 text-xs"
                      onClick={exportDocJson}
                    >
                      JSON
                    </button>
                    <button
                      type="button"
                      className="rounded border border-neutral-200 px-2 py-1 text-xs"
                      onClick={exportTokensJson}
                    >
                      Tokens
                    </button>
                    <button type="button" className="rounded border border-neutral-200 px-2 py-1 text-xs" onClick={exportSvg}>
                      SVG
                    </button>
                    <button type="button" className="rounded border border-neutral-200 px-2 py-1 text-xs" onClick={exportPng}>
                      PNG
                    </button>
                    <button type="button" className="rounded border border-neutral-200 px-2 py-1 text-xs" onClick={exportJpg}>
                      JPG
                    </button>
                    <button type="button" className="rounded border border-neutral-200 px-2 py-1 text-xs" onClick={() => void exportPdf()}>
                      PDF
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      value={tokenImportMode}
                      onChange={(e) => setTokenImportMode(e.target.value as "merge" | "replace")}
                      className="rounded border border-neutral-200 px-2 py-1 text-[11px]"
                    >
                      <option value="merge">Merge</option>
                      <option value="replace">Replace</option>
                    </select>
                    <button
                      type="button"
                      className="rounded border border-neutral-200 px-2 py-1 text-[11px]"
                      onClick={() => tokenImportRef.current?.click()}
                    >
                      Import Tokens
                    </button>
                    <input
                      ref={tokenImportRef}
                      type="file"
                      accept="application/json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.currentTarget.files?.[0];
                        e.currentTarget.value = "";
                        if (file) void importTokensJson(file);
                      }}
                    />
                  </div>
                  <div className="mt-2 text-[11px] text-neutral-400">
                    Large images may be truncated in PNG export.
                  </div>
                </div>
              </div>
            ) : null}
            </div>
          </aside>
          ) : null}
        </div>
        <div className="sr-only" aria-hidden="true">
          {canvasMounted ? <AdvancedRuntimeRenderer doc={doc} activePageId={activeExportPageId ?? undefined} svgRef={exportSvgRef} /> : null}
        </div>
        </div>
      </main>
      {showOnboarding ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
          <div className="w-[440px] rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-neutral-900">NULL Editor</h2>
            <div className="mt-3 space-y-2 text-sm text-neutral-600">
              <p>Create frames by dragging on the canvas or insert presets from the asset library.</p>
              <p>Use the right panel to adjust design, prototype, and workflow settings.</p>
              <div className="mt-2 rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500 space-y-1">
                <div><kbd className="rounded border border-neutral-300 bg-white px-1 py-0.5 text-[10px]">Space + Drag</kbd> Pan canvas</div>
                <div><kbd className="rounded border border-neutral-300 bg-white px-1 py-0.5 text-[10px]">Ctrl + Wheel</kbd> Zoom</div>
                <div><kbd className="rounded border border-neutral-300 bg-white px-1 py-0.5 text-[10px]">R</kbd> Rectangle <kbd className="rounded border border-neutral-300 bg-white px-1 py-0.5 text-[10px]">T</kbd> Text</div>
                <div><kbd className="rounded border border-neutral-300 bg-white px-1 py-0.5 text-[10px]">Ctrl + Z</kbd> Undo</div>
              </div>
            </div>
            <button
              type="button"
              className="mt-4 w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
              onClick={() => {
                setShowOnboarding(false);
                localStorage.setItem("null_editor_onboarded", "1");
              }}
            >
              Get started
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
