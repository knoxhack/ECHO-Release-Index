# Unified ECHO Native Player Runtime Goal

This is the durable Codex goal for the cross-repo ECHO Native player runtime cutover.

ECHO Native is the single player-facing contract model for four canonical hosts: `native_loader`, `neoforge`, `standalone_runtime`, and `standalone_engine`. Hosts may use their own internals, but visible menus, HUDs, inventory, keybinds, overlays, terminal, index, diagnostics, save/session warnings, and gameplay actions must be defined once through ECHO SDK schemas and ECHO module manifests.

Ashfall is a fixture only. It can supply evidence and regression scenarios, but it must never own platform UI, player controls, gameplay mutation rules, runtime conformance policy, or host adapter contracts.

## Core Rule

No standalone-only, NeoForge-only, Native-only, Engine-only, runtime-owned, or pack-owned player-facing feature may pass release gates. Every player-facing feature must have:

- An SDK schema or approved schema extension.
- A module-owned manifest or resource.
- Content Graph nodes and adaptation edges.
- Host adapter implementation for each required host.
- Runtime conformance evidence.
- Release Index and Launcher visibility when blocked, fallback-only, warning-gated, or player-ready.

## Phase 1: Platform Charter And Ownership Lock

Goal: make ownership explicit before implementation spreads.

Required state:

- ECHO-SDK owns schemas, fixtures, templates, and public contract docs.
- ECHO-Native-Platform owns runtime SPI, typed services, loader behavior, and evidence contracts.
- ECHO-Modules owns player-facing feature definitions.
- Runtime repos own host adapters only.
- Pack repos own selection, configuration, assets, and evidence fixtures only.
- ECHO-Release-Index owns catalog records, trust policy, and `playerReady` promotion gates backed by indexed `runtimeConformanceEvidence`.

Exit criteria:

- Docs use ECHO Native conformance language, not pack-specific readiness language.
- Pack docs describe Ashfall, Openlands, and other products as fixtures or consumers.
- No platform UI/gameplay language is owned by an experience pack.

## Phase 2: Unified Contract Family

Goal: define the schemas every host implements.

Required schemas:

- `echo.native.host.v1`
- `echo.ui.surface.v1`
- `echo.input.binding.v1`
- `echo.inventory.surface.v1`
- `echo.gameplay.action.v1`
- `echo.save.session.v1`
- `echo.runtime.conformance.v1`
- `echo.native.player_surface_manifest.v1`

Exit criteria:

- SDK fixtures cover at least one menu, HUD widget, input binding, inventory action, terminal page, index route, and gameplay mutation.
- SDK validation fails when required ids, owners, statuses, receipts, or host reports are missing.

## Phase 3: Module-Owned Player Surface Manifests

Goal: player-facing features are declared by modules, not runtimes.

Canonical module owners:

- `echoscreencore`: title, pause, world create/load, settings, diagnostics, blockers, death/respawn, screen stack, focus, data binding, action dispatch.
- `echothemecore`: theme tokens, density, contrast, readable mode, visual skin ids.
- `echohudcore`: HUD widgets, overlay priority, safe areas, meters, prompts, objective tracker, notification queue.
- `echoinputcore`: input contexts, keybind registry, radial menus, remap metadata, conflict diagnostics, controller prompt metadata.
- `echoindex`: index pages, recipes, item/block references, inventory overlay hooks.
- `echoterminal`: terminal shell, tabs, command deck, route planning, diagnostics pages.
- `echomissioncore`: objective state, routes, rewards, active tracker data.
- `echosessioncore`: onboarding state, objective/session state, route history, hazard state, pack phase.
- `echoadaptercore`: gameplay actions, mutation receipts, mutation ledger.
- `echoplaytestcore`: scenario definitions and release evidence.

Exit criteria:

- Each module publishes `data/<module>/echo_native/player_surfaces.json`.
- Each manifest names owner module, host targets, required host services, and surfaces/actions/session references.
- Runtime adapters consume manifests or graph output instead of private player-facing lists.

## Phase 4: Content Graph Player Runtime Parity

Goal: the Content Graph becomes the audit trail for player-facing parity.

Required `echo:ui_intent` coverage:

- `title_menu`
- `pause_menu`
- `world_create`
- `world_load`
- `settings_panel`
- `module_diagnostics`
- `inventory_surface`
- `crafting_surface`
- `hotbar_surface`
- `hud_widget`
- `overlay`
- `keybind_action`
- `terminal_page`
- `index_page`
- `mission_tracker`
- `death_respawn`
- `save_warning`
- `runtime_blocker`

Required edge coverage includes:

- `ui_surface_uses_theme`
- `ui_surface_requires_input`
- `ui_surface_dispatches_action`
- `hud_widget_reads_session_state`
- `inventory_action_invokes_gameplay_action`
- `terminal_page_controls_node`
- `index_page_documents_node`
- `runtime_host_adapts_surface`

Exit criteria:

- Strict graph validation fails if a player-facing resource exists without graph coverage.
- Export plans include `neoforge`, `native_loader`, `standalone_runtime`, and `standalone_engine`.
- Evidence can answer which module owns any player-facing feature.

## Phase 5: ECHO Menus And Shell Flow

Goal: players enter and navigate through ECHO ScreenCore surfaces.

Required surfaces:

- Title: Continue, New World, Load World, Modules, Settings, Diagnostics, Quit.
- New world: name, seed, difficulty/profile, module validation, content graph fingerprint preview.
- Load world: save list, module mismatch warnings, migration warnings, repair suggestions.
- Pause: Resume, Save, Settings, Modules, Return to Title, Quit.
- Settings: display, input, accessibility, audio, runtime diagnostics.
- Diagnostics: module graph, host services, blocked surfaces, mutation ledger summary.
- Death/respawn: respawn, checkpoint where supported, session consequences.

NeoForge may use Minecraft screen classes internally. Visible layout, labels, actions, data, and dispatch ids must come from ECHO contracts.

Exit criteria:

- Vanilla title, pause, settings, and inventory presentation are not the default player route for ECHO packs.
- Every menu action dispatches through ECHO action ids.
- Missing modules and blocked surfaces are shown before launch or world entry.

## Phase 6: ECHO HUD, Input, Inventory, And Crafting

Goal: the everyday play loop is ECHO-defined.

HUD requirements:

- Health/status widgets.
- Hunger/hydration when enabled.
- Hazard meters.
- Objective tracker.
- Interaction prompts.
- Notification queue.
- Debug overlay only when explicitly enabled.

Input requirements:

- Movement context.
- Combat/use/place context.
- Inventory, terminal, index, lens/map keys.
- Remapping and conflict diagnostics.
- Controller prompt metadata.

Inventory/crafting requirements:

- Hotbar.
- Backpack grid.
- Equipment/loadout slots.
- Tooltips.
- Drag/drop, split stack, quick move, number-key swap.
- Item actions.
- Crafting and recipe links through Inventory, Index, and Recipe contracts.

Exit criteria:

- NeoForge inventory and recipe book are backend details, not the visible ECHO surface.
- Standalone hosts use the same inventory and action definitions.
- Keybinds are declared once and adapted per host.

## Phase 7: Gameplay Actions And Mutation Receipts

Goal: player-facing gameplay success is proven by receipts, not reports.

AdapterCore owns normalized actions for:

- Inventory grant, remove, query, move stack, consume.
- Player health, hunger, hydration, spawn, status effects.
- Block place, break, query.
- Structure place, validate, rollback where supported.
- Block entity read/write state.
- Capability attach, detach, update.
- Events emit/listen.
- HUD and packet feedback.
- Save/session read/write.

Proof receipt kinds:

- `HOST_STATE`
- `SAVE_WRITE`
- `HUD_EVENT`
- `PACKET_EVENT`

Non-proof kinds:

- `DIAGNOSTIC_ONLY`
- `QUEUED_ONLY`
- `METADATA_ONLY`

Exit criteria:

- `MUTATED` without a proof receipt fails conformance.
- Runtime-only direct state changes are forbidden unless wrapped by AdapterCore receipts.
- Mutation ledger is visible to diagnostics and playtest evidence.

## Phase 8: Four Runtime Hosts

Goal: every host implements the same contract with internals hidden behind adapters.

Native Loader:

- Reference host for `.echo-addon` modules.
- Loads modules and invokes lifecycle/typed host services.
- Emits canonical conformance evidence.

NeoForge:

- Maps ECHO contracts to Minecraft registries, events, screens, key mappings, saves, packets.
- Replaces vanilla presentation with ECHO surfaces.
- Emits receipts for all player-facing mutations.

Standalone Runtime:

- Implements the same surfaces with disk-backed state.
- Used for CI, offline, and parity proof.
- Must not use mock-only state for player-ready claims.

Standalone Engine:

- Loads module manifests and content graphs.
- Renders ECHO menus, HUD, inventory, terminal, index, diagnostics.
- Uses the same action and receipt model as the other hosts.

Exit criteria:

- All four hosts emit `echo.runtime.conformance.v1`.
- A host cannot claim player-ready if required surfaces are fallback-only.
- Standalone Engine and Standalone Runtime no longer define independent player-facing contracts.

## Phase 9: Release Index, Launcher, And Tooling Gates

Goal: distribution uses conformance evidence as truth.

Release Index:

- Stores conformance evidence per module release and pack/runtime combination.
- Records required, blocked, fallback, and adapted surfaces plus proof receipts.
- Rejects player-ready status when evidence is missing, blocked, fallback-only, or stale.

Launcher:

- Resolves module requirements.
- Shows runtime choices with conformance status.
- Blocks hard blockers.
- Warns on approved fallback surfaces.
- Offers repair for module, hash, descriptor, graph, or conformance mismatches.

Developer and Addons Studio:

- Validate surface manifests.
- Show owning module and missing adapter diagnostics.
- Prevent new player-facing features without schema, graph, host adapter, tests, and evidence.

Exit criteria:

- Player-ready promotion is impossible from descriptor-only or source-packaged evidence.
- Launcher displays concrete missing surface/action names.
- Tools identify the owning module for each blocked feature.

## Phase 10: Migration, Cutover, And Governance

Goal: move existing features into the unified model and keep them there.

Migration rules:

- Move standalone-only screens into ScreenCore manifests.
- Move hard-coded keybinds into InputCore.
- Move hard-coded HUD overlays into HUDCore.
- Move terminal/index routes into module page manifests.
- Move inventory/crafting behavior into inventory/action contracts.
- Move gameplay state changes behind AdapterCore actions.
- Move save/session state into `echo.save.session.v1`.

New feature governance:

- Start with SDK schema or schema extension.
- Add module manifest/resource.
- Add Content Graph node and export/adaptation plan.
- Add host adapter implementation.
- Add conformance tests.
- Add Launcher/Release Index evidence.
- Add at least one non-Ashfall fixture for platform-level behavior.

Exit criteria:

- No pack repo owns platform UI/gameplay.
- No runtime repo owns unique player-facing features.
- At least two packs pass the same conformance scenarios: one heavy fixture and one non-Ashfall fixture.
- ECHO Native parity means menus, HUD, input, inventory, terminal, index, gameplay actions, save/load, diagnostics, and release gates pass across all four hosts.

## Acceptance Matrix

Every host must prove:

- Boot to ECHO title screen.
- Create world with module validation.
- Load world with content graph fingerprint validation.
- Open pause menu and return to title without terminating runtime.
- Open settings and remap a key.
- Use HUD objective tracker and warning overlay.
- Open inventory, move item, inspect tooltip, use item action.
- Craft through ECHO inventory/index route.
- Open Terminal page and perform a safe action.
- Open Index page and navigate item/recipe reference.
- Trigger mission progress.
- Trigger at least one world mutation and one save write.
- Die and respawn through ECHO surface.
- Save, reload, and verify session state.
- Display blocked surface diagnostics when a required adapter is missing.

Negative tests:

- Runtime-only screen fails release validation.
- Pack-owned platform UI fails validation.
- `MUTATED` without receipt fails validation.
- Metadata-only activation fails player-ready gate.
- Fallback-only required surface fails full parity.
- Missing Content Graph node fails strict graph validation.

## Current Implementation Notes

Keep this list short and factual. Use direct source inspection before editing.

- SDK owns the unified schema family and fixtures.
- Modules own player surface manifests and Content Graph generation/validation.
- Runtime hosts are producing `echo.runtime.conformance.v1` at different maturity levels.
- Release Index validates player-ready runtime conformance policy and module-release conformance evidence.
- Addons Studio validation blocks creator-owned vanilla/standalone UI override permissions and requires ECHO-owned modules for player-facing feature permissions.
- Remaining blockers are expected until live NeoForge client UI/play evidence, pack runtime conformance artifacts, and full four-host parity evidence are published.
