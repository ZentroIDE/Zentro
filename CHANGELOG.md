# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [0.10.0](https://github.com/ZentroIDE/Zentro/compare/v0.9.0...v0.10.0) (2026-10-22)


### ⚠ BREAKING CHANGES

* **open-core:** remove Pro Early Access, superseded by the 30-day trial

### Features

* **activity:** add inline confirm to JobRow's Cancel, not just Force kill ([7c67b2a](https://github.com/ZentroIDE/Zentro/commit/7c67b2a469935938de6779a259bd7a05d3079cde))
* **activity:** hide internal queries, merge duplicate status columns, add timestamps ([747e88a](https://github.com/ZentroIDE/Zentro/commit/747e88a19ad9b29fc1ef07ed0c07cf42de036916))
* **activity:** M1 - job framework, Activity panel, ctx-based query cancel ([e7e13dc](https://github.com/ZentroIDE/Zentro/commit/e7e13dce0607c1ee0d9c8d6a8a09baf2a4d73c67))
* **activity:** M2 - server-side query cancel/kill (BackendCanceller) ([fd6222f](https://github.com/ZentroIDE/Zentro/commit/fd6222f899e5dfdf9c20cd91e2675de33f91fc66))
* **activity:** M3 - export runs as a streaming job ([a0deb89](https://github.com/ZentroIDE/Zentro/commit/a0deb897ef4e539960f79da3afe0f4b41c24ab4a))
* **activity:** M4 - CSV import as a job, with a 4-step wizard ([8a14c5b](https://github.com/ZentroIDE/Zentro/commit/8a14c5bbcb181f50d6db4eaace1aaea89eb17180))
* **activity:** M5 - Server Sessions tab, list/cancel/kill DB server sessions ([e97fa09](https://github.com/ZentroIDE/Zentro/commit/e97fa094d05cb0c211f0959e84d545f840ebcf10))
* **activity:** show the most recently started job at the top of Jobs tab ([5d571c3](https://github.com/ZentroIDE/Zentro/commit/5d571c31e8e02a7041053587faf724f98f4d8b4b))
* **ai:** add metadata-only chat assistant with provider setup ([a7e16cb](https://github.com/ZentroIDE/Zentro/commit/a7e16cb4eaf8bfb08111fda919aaf6658798fc23))
* **ai:** app context tools for the chat and MCP agents, gated by plan ([606a9b4](https://github.com/ZentroIDE/Zentro/commit/606a9b4682971c9572c0aeaad21db0d7c7db47e6))
* **ai:** auto-configure Cursor MCP through a client catalog ([6a15852](https://github.com/ZentroIDE/Zentro/commit/6a15852232be1b46341168a06afd39cb1c46773e))
* **ai:** browse and review sensitive-column detection in Settings ([7ffbb76](https://github.com/ZentroIDE/Zentro/commit/7ffbb76aafcc6886ba08886fec804d9ba1d1f8a5))
* **ai:** chat history popover modeled on the project and connection lists ([67ad0a4](https://github.com/ZentroIDE/Zentro/commit/67ad0a4b3e01c14fa858cb849ef652a7a8f50fea))
* **ai:** choose the model from what the host lists, not from a preset ([cded6f0](https://github.com/ZentroIDE/Zentro/commit/cded6f046c3579f7b93443ae43e9525ed88b9de0))
* **ai:** classify columns, mask row reads, count impact, and dry-run writes ([cad534f](https://github.com/ZentroIDE/Zentro/commit/cad534f18e9be322630661ee5feb743e0a04ce25))
* **ai:** composer layout, token bar, and keyboard-driven mentions ([58d70df](https://github.com/ZentroIDE/Zentro/commit/58d70dfc4faf11298aea46349ee9a1d616243b17))
* **ai:** cut the tokens a chat reply costs, and polish the chat ([2b54148](https://github.com/ZentroIDE/Zentro/commit/2b5414879adb9732430ba30bd07137c54122b133))
* **ai:** diff_schema compares the schema of two environments ([c45cd42](https://github.com/ZentroIDE/Zentro/commit/c45cd42fb7e6d25e5df091cad37cc56d4bf04520))
* **ai:** every tool answers with one envelope, and a failure carries a code ([e84603e](https://github.com/ZentroIDE/Zentro/commit/e84603e148401a09876bba356074e671bb13418d))
* **ai:** explain_plan returns an estimated plan without running the query ([c880c11](https://github.com/ZentroIDE/Zentro/commit/c880c11fa1ffc2d8314f6faee48943d6fbecaa9f))
* **ai:** find_dependencies shows what breaks if an object or column changes ([1ace334](https://github.com/ZentroIDE/Zentro/commit/1ace334c640700e8cd2495015f7f2b62ca0822b9))
* **ai:** five Postgres ports for validating, explaining, and reading schema facts ([d0f09f3](https://github.com/ZentroIDE/Zentro/commit/d0f09f368b148fc3ec34a10a61de031eaa884243))
* **ai:** get_table_stats and list_indexes read catalog facts and flag issues ([e27b24c](https://github.com/ZentroIDE/Zentro/commit/e27b24cd22a59dcceaf791e3fc42f7b86642e69b))
* **ai:** list the chat's questions beside the token count ([6ce0ee8](https://github.com/ZentroIDE/Zentro/commit/6ce0ee8188d437f6d634b9c055b46009633f35ca))
* **ai:** minimal chat header, history popover, and mention shortcuts ([d1e2bd9](https://github.com/ZentroIDE/Zentro/commit/d1e2bd9ec47de4a1d9b767c683dbf77d6b627807))
* **ai:** offer the three latest chats in an empty chat ([ba35224](https://github.com/ZentroIDE/Zentro/commit/ba35224fcb81dcfe92eb6d87a718a364d362b40d))
* **ai:** permission groups for agent tools, production kept blocked (D2) ([16d2a04](https://github.com/ZentroIDE/Zentro/commit/16d2a049e2b90d9473451724f054786bae42b76b))
* **ai:** propose, review, and approve database changes ([fa600b7](https://github.com/ZentroIDE/Zentro/commit/fa600b7859a6822685bc772e3657c6d02a704d24))
* **ai:** rate limit MCP tool calls, 120 a minute and 10 for changes ([45ccbc2](https://github.com/ZentroIDE/Zentro/commit/45ccbc2e0de48a23be75d682d5702412f3514b81))
* **ai:** record every MCP call in a tamper-evident audit chain ([d576da4](https://github.com/ZentroIDE/Zentro/commit/d576da4abbca024f8086acb1c49371337cf6eb99))
* **ai:** redesign the chat panel as one quiet column ([24cf9c9](https://github.com/ZentroIDE/Zentro/commit/24cf9c988cc69c6cecb3b41d869ea04abb706355))
* **ai:** resolve a connection for any environment, not just the open one ([ace42f9](https://github.com/ZentroIDE/Zentro/commit/ace42f9fd8c7cf50458709ff1cf34bf211c31e22))
* **ai:** saved chats, granted data review, streaming replies, mentions ([b8666cc](https://github.com/ZentroIDE/Zentro/commit/b8666cc9413fc9bb7172f503ee152f0d63e9ee4b))
* **ai:** scan only the JSON string values of a result, not its numbers ([86786ca](https://github.com/ZentroIDE/Zentro/commit/86786ca9e2e8f2c7b4a09d07f386a9814030b986))
* **ai:** schema tools for the chat and an MCP server for external agents ([4a96611](https://github.com/ZentroIDE/Zentro/commit/4a96611ef3fe31a3985ef48aa63810faf7b9c58f))
* **ai:** the assistant sees the schema, not the data (ADR 0017) ([9c02d71](https://github.com/ZentroIDE/Zentro/commit/9c02d71975205a124ded6d4ea4767ecd18b90ca7))
* **ai:** the four schema tools read any environment and say more ([926383a](https://github.com/ZentroIDE/Zentro/commit/926383a231192cba7fb52c09a8481f1d10da9cc5))
* **ai:** the whole assistant is free, including the activity tools and Data mode ([#150](https://github.com/ZentroIDE/Zentro/issues/150)) ([4e1d619](https://github.com/ZentroIDE/Zentro/commit/4e1d619859866314c4d760d7f057e6d6fb3cb835))
* **ai:** validate_sql checks SQL against the real schema without running it ([b5210a7](https://github.com/ZentroIDE/Zentro/commit/b5210a7a4ef9c12c94a5d35748d8f2418bbc6c90))
* **ai:** wire SQLite, MySQL, and SQL Server into the remaining MCP ports ([d1f30f3](https://github.com/ZentroIDE/Zentro/commit/d1f30f3acd0c4db7b5f24dba6a84378163587c66))
* **ci:** the exported public tree builds and tests itself on every PR ([#159](https://github.com/ZentroIDE/Zentro/issues/159)) ([a311f35](https://github.com/ZentroIDE/Zentro/commit/a311f3529735beb57530843cbdc0689609c2e9e4)), closes [#132](https://github.com/ZentroIDE/Zentro/issues/132)
* **connection:** browse for a SQLite file via OS-native picker ([38d0513](https://github.com/ZentroIDE/Zentro/commit/38d05132e71e7bf68059c9865525089a4942d8c4))
* **connection:** reach databases through an SSH tunnel ([efbbbab](https://github.com/ZentroIDE/Zentro/commit/efbbbab21b4ce47ad26796318867c2b1798f6fa5))
* **connection:** TLS minimum version and legacy ciphers per connection ([7cbfa22](https://github.com/ZentroIDE/Zentro/commit/7cbfa22de0e46919ae4a1ac5c4117afc58b1e30a))
* **data-table:** Enter/F2 cell-edit entry, Escape round-trip, Ctrl+PgUp/Dn tab switch (Phase 3) ([84744e7](https://github.com/ZentroIDE/Zentro/commit/84744e79176a43840dc12e0c502c1eb1db9ce5ed))
* **db:** one SQL tokenizer for risk analysis, with top-level WHERE and CTE-aware kinds ([53975d2](https://github.com/ZentroIDE/Zentro/commit/53975d2523264f27f0ceea14fa2fc4af3058f2ce))
* **editor:** connection-free SQL syntax diagnostics ([b051d73](https://github.com/ZentroIDE/Zentro/commit/b051d73283051f0765674cc95fd05796a9bd5beb))
* **editor:** opt-in schema-aware coloring of table, column and alias names ([5b9c324](https://github.com/ZentroIDE/Zentro/commit/5b9c3240b0b924b4172a7a301dc23e61b27696fb))
* **editor:** own SQL grammar so token styles fully override Monaco ([c0099c5](https://github.com/ZentroIDE/Zentro/commit/c0099c5d95ce327165fe1e859402a128249d3100))
* **editor:** redesign SQL Editor Colors with tabs, palette swatches, weight select and live preview ([67165a1](https://github.com/ZentroIDE/Zentro/commit/67165a1419702b251102fdd4b0633524e5a4245e))
* **editor:** richer SQL completion for CTEs, select aliases, T-SQL variables and functions ([2af3bc5](https://github.com/ZentroIDE/Zentro/commit/2af3bc54a6c23cfb2d1a097b9d1a623cdc681197))
* **editor:** show cursor position and selected character count in a status strip ([0b04919](https://github.com/ZentroIDE/Zentro/commit/0b049199fbfb4c4ed573a3525f8b9a5a0359358e))
* **editor:** user-defined SQL syntax colors per light/dark theme ([29eb28a](https://github.com/ZentroIDE/Zentro/commit/29eb28aeb98417036cc9f686cbff16d1bd22b521))
* **erd:** auto layout with dagre, saved layout and refreshed table styling ([42d52e8](https://github.com/ZentroIDE/Zentro/commit/42d52e833bc16fcd01e941f1582806dc384cd67b))
* **erd:** keyboard pan/zoom for the ERD canvas + erd focus zone (Phase 5, G8) ([dbaea10](https://github.com/ZentroIDE/Zentro/commit/dbaea10d2af7590fddce59bcf310b2affaf5a5f7))
* **erd:** minimap, dotted canvas and reset layout in the zoom controls ([fa213c5](https://github.com/ZentroIDE/Zentro/commit/fa213c51fd156b845211f23b3f973e0ad4310b76))
* **explorer:** roving-tabindex keyboard nav for the explorer tree (Phase 6, Z4) ([18b5fa4](https://github.com/ZentroIDE/Zentro/commit/18b5fa4cef28e68ae2dcd2fe1fae0b08274af83e))
* **explorer:** tab from the sidebar filter into the first result ([42b9f3a](https://github.com/ZentroIDE/Zentro/commit/42b9f3a7df9942a7c57d675b01f4750a2ec51a30))
* **export:** write the public tree and check that it stands alone ([#151](https://github.com/ZentroIDE/Zentro/issues/151)) ([86ac6b2](https://github.com/ZentroIDE/Zentro/commit/86ac6b258e4170891523e5f97aea7dc304eefae5)), closes [#136](https://github.com/ZentroIDE/Zentro/issues/136) [#132](https://github.com/ZentroIDE/Zentro/issues/132) [#136](https://github.com/ZentroIDE/Zentro/issues/136)
* **formatter:** T-SQL aware SQL formatter with configurable options ([daac284](https://github.com/ZentroIDE/Zentro/commit/daac284ea4848eb892fa8d8bb50d2f19f7919a84))
* **guardrails:** add click-without-keyboard-activation rule (Phase 4, G9) ([e73c23f](https://github.com/ZentroIDE/Zentro/commit/e73c23fc1a2c11b2026d95af11ac63641132835f))
* **issue-templates:** convert bug and feature templates to issue forms ([#148](https://github.com/ZentroIDE/Zentro/issues/148)) ([e72ecc7](https://github.com/ZentroIDE/Zentro/commit/e72ecc7befe198c9ed4cc08cb845eb96ef8dd6a5)), closes [#138](https://github.com/ZentroIDE/Zentro/issues/138)
* **keyboard:** reveal focus targets and extend keyboard-only navigation ([22f5b71](https://github.com/ZentroIDE/Zentro/commit/22f5b71f8cbda1d84ecb9178a7144d0faa3e594b))
* **license:** open real Polar checkout from Upgrade to Pro ([65ce3f0](https://github.com/ZentroIDE/Zentro/commit/65ce3f07cc2528e72f795076dc265dbb53c95437))
* **onboarding:** add first-run product tours and a daily tip dialog ([a0480d8](https://github.com/ZentroIDE/Zentro/commit/a0480d86299b505eeca73e360ef070fe6941dc2b))
* **onboarding:** open the workspace without a project ([711c344](https://github.com/ZentroIDE/Zentro/commit/711c3442f4d93dac28c9a0b4245890b64496045f))
* **open-core:** backend plumbing for the 30-day Pro trial (ADR 0019) ([#169](https://github.com/ZentroIDE/Zentro/issues/169)) ([3c0a03b](https://github.com/ZentroIDE/Zentro/commit/3c0a03b90a8806d60a2bc160567036acca40a835)), closes [#140](https://github.com/ZentroIDE/Zentro/issues/140) [zentro-api#7](https://github.com/ZentroIDE/zentro-api/issues/7) [zentro-api#7](https://github.com/ZentroIDE/zentro-api/issues/7) [#140](https://github.com/ZentroIDE/Zentro/issues/140)
* **open-core:** copyright holder + SPDX headers on every core/pro source file ([#167](https://github.com/ZentroIDE/Zentro/issues/167)) ([1f0f340](https://github.com/ZentroIDE/Zentro/commit/1f0f340b5381efade325ae128208c8766693e744)), closes [#133](https://github.com/ZentroIDE/Zentro/issues/133) [#147](https://github.com/ZentroIDE/Zentro/issues/147) [#133](https://github.com/ZentroIDE/Zentro/issues/133)
* **open-core:** frontend for starting the 30-day Pro trial (ADR 0019) ([#170](https://github.com/ZentroIDE/Zentro/issues/170)) ([43e8122](https://github.com/ZentroIDE/Zentro/commit/43e8122448d66d31768c6ffdd55f88d713d880a4)), closes [#140](https://github.com/ZentroIDE/Zentro/issues/140) [#169](https://github.com/ZentroIDE/Zentro/issues/169) [#169](https://github.com/ZentroIDE/Zentro/issues/169) [zentro-api#7](https://github.com/ZentroIDE/zentro-api/issues/7) [#169](https://github.com/ZentroIDE/Zentro/issues/169) [#140](https://github.com/ZentroIDE/Zentro/issues/140)
* **open-core:** public-repo CI, Dependabot/CodeQL, gitleaks config, README sections ([#168](https://github.com/ZentroIDE/Zentro/issues/168)) ([bb26e4f](https://github.com/ZentroIDE/Zentro/commit/bb26e4fb103d85f16791b9b8f4871e2b6eed6059)), closes [#137](https://github.com/ZentroIDE/Zentro/issues/137) [#136](https://github.com/ZentroIDE/Zentro/issues/136) [#138](https://github.com/ZentroIDE/Zentro/issues/138) [#137](https://github.com/ZentroIDE/Zentro/issues/137)
* **open-core:** remove Pro Early Access, superseded by the 30-day trial ([cfd3596](https://github.com/ZentroIDE/Zentro/commit/cfd35960e5394630f345bcebd29285049447887e))
* **open-core:** sync the public repo and pull its PRs back, finish the denylist ([#165](https://github.com/ZentroIDE/Zentro/issues/165)) ([67a7d06](https://github.com/ZentroIDE/Zentro/commit/67a7d0643fae118e47335eb078b2f112ba76ffac)), closes [#136](https://github.com/ZentroIDE/Zentro/issues/136) [#136](https://github.com/ZentroIDE/Zentro/issues/136)
* **project:** open an existing project from a folder ([2cfa695](https://github.com/ZentroIDE/Zentro/commit/2cfa69563e343d8a54cdb3fce0a76e1f9e7e4cc3))
* **project:** report folders without project.json as ErrNotZentroProject ([db6e6fe](https://github.com/ZentroIDE/Zentro/commit/db6e6fede96e23ee6a8d625f835601ab471d23ad))
* **result-grid:** arrow-key cell navigation ([f64aca0](https://github.com/ZentroIDE/Zentro/commit/f64aca053db9a8d2ca86bca9d820b26906a0bd21))
* **result-grid:** copy rows selected via the index column ([c51716e](https://github.com/ZentroIDE/Zentro/commit/c51716eda76ece287fa3333560d97732673cd421))
* **result-grid:** fetch N rows and fetch all from the status bar ([972b92f](https://github.com/ZentroIDE/Zentro/commit/972b92fbf2f13740bd2c697b784eb0dc6b76cbd7))
* **result-panel:** add export progress bar, inline confirm before cancel ([7d7110b](https://github.com/ZentroIDE/Zentro/commit/7d7110b414dcbd9c7913fd10e2297ae19f5c7719))
* **settings:** a switch for showing connection details to MCP agents ([5431348](https://github.com/ZentroIDE/Zentro/commit/5431348250d94cc6ffb7f54ea807839993a534ff))
* **settings:** flat Assistant settings, and the rules that keep them flat ([a64f5cc](https://github.com/ZentroIDE/Zentro/commit/a64f5cc07c588a28641a43b883e9952fbf329cb3))
* **settings:** make the Assistant section shorter and calmer ([c522cd2](https://github.com/ZentroIDE/Zentro/commit/c522cd2d48ec0fb0caa2b2008dc79c91624b26c4))
* **shortcuts:** add Focus Zone Registry subsystem (Phase 1) ([da23999](https://github.com/ZentroIDE/Zentro/commit/da239998da06ada96907840a1ec2fb5a7815d36d))
* **shortcuts:** Alt+Up and Alt+Down step through the chat's questions ([aa6e159](https://github.com/ZentroIDE/Zentro/commit/aa6e15979654f5434a0fd6dd936db359c4b533b2))
* **shortcuts:** tab keyboard navigation + command palette tab-jump (Phase 2) ([0b07ee2](https://github.com/ZentroIDE/Zentro/commit/0b07ee259bd3b7ce97c6dea706cae40aa61a1d7d))
* **status-bar:** add inline progress bar + hover preview for running jobs ([e184634](https://github.com/ZentroIDE/Zentro/commit/e1846348cc5bbe56bc0bd184b4a966a72f166e61))
* **statusbar:** live database latency, traffic and resource stats ([fc88cbd](https://github.com/ZentroIDE/Zentro/commit/fc88cbd9c02739a6164bd41fe9bed0969cbc9850))
* **terminal:** a local and SSH terminal in the bottom panel ([c8e3fd0](https://github.com/ZentroIDE/Zentro/commit/c8e3fd0846301beb217cda31fde136295107b153))
* **terminal:** match the app's tab strip and empty state, readable colors, restart ([aeb741a](https://github.com/ZentroIDE/Zentro/commit/aeb741a5477e52f595e296540d2d459ecedead53))
* **toolbar:** label the quick environment popover ([524d797](https://github.com/ZentroIDE/Zentro/commit/524d797e44f594219aa9c38579d37373c83c56ea))


### Bug Fixes

* **about:** stamp commit hash and build date into release builds ([3721109](https://github.com/ZentroIDE/Zentro/commit/372110956e0122cd219ae165656c768e45759ed1))
* **activity:** filter internal queries out of activityStore too ([c2d6ab5](https://github.com/ZentroIDE/Zentro/commit/c2d6ab599ea0ea9e0d59c67d75fb40f63f25f1e8))
* **activity:** fix status-bar progress bar contrast, show % next to row count ([444fc35](https://github.com/ZentroIDE/Zentro/commit/444fc35efe1e8d1cf6c69515016713760b7abc40))
* **activity:** show real export percent instead of raw row count ([3ce889c](https://github.com/ZentroIDE/Zentro/commit/3ce889cf7b7c4ef31632351d21927e1403d92eb8))
* **activity:** stop export-all's detail from hiding the done/total caption ([fcc1a4a](https://github.com/ZentroIDE/Zentro/commit/fcc1a4a4ad927c1e527919591799eeadb2ce1d55))
* **activity:** stop infinite re-render loop in status bar job indicator ([fcd95fa](https://github.com/ZentroIDE/Zentro/commit/fcd95fa47b833ea6e0c47b1ea884d0ec9fda4ae2))
* **ai:** accept a complete JSON reply when the provider ignores streaming ([4c11a87](https://github.com/ZentroIDE/Zentro/commit/4c11a87dd37dc7b19b3c52d7f3f99c939fdd5630))
* **ai:** guard against a null columns array from scanClassification ([dd5ae0b](https://github.com/ZentroIDE/Zentro/commit/dd5ae0b72bf29bd021b7655b55616a5acfd53896))
* **ai:** judge the production rule on the env a tool targets, not the open one ([a12c988](https://github.com/ZentroIDE/Zentro/commit/a12c98837a47cc9428b045cd9e9ec6b787e06619))
* **ai:** keep the chat model picker visible when setup is closed ([cb40325](https://github.com/ZentroIDE/Zentro/commit/cb40325fbc7ceaef702c60709c35e38257c24f7e))
* **ai:** keep typing out of the conversation, and read replies that carry nulls or tool markup ([757432d](https://github.com/ZentroIDE/Zentro/commit/757432d0d29f9315357f071fae94d982fe9a8826))
* **ai:** open a chat on its newest message and follow the reply while it streams ([bcc5c95](https://github.com/ZentroIDE/Zentro/commit/bcc5c958b8edb92defa5b47f971efd550b0fbf93))
* **ai:** primary buttons, Enter to send, data notice stacked on the input ([261c4ac](https://github.com/ZentroIDE/Zentro/commit/261c4ac598b75ea36aad68205dfcc810bb70bf06))
* **ai:** put the run-history tools behind the Run history switch ([4edc915](https://github.com/ZentroIDE/Zentro/commit/4edc9156f0e68e3f92ceab0d366cba9b859fe417))
* **ai:** say why a streamed reply came back empty and log it ([796994a](https://github.com/ZentroIDE/Zentro/commit/796994a6e0f72f089b378621cd9107fbdb55b7d3))
* **ai:** time out a stuck reply and test that failures are logged ([4b8ae28](https://github.com/ZentroIDE/Zentro/commit/4b8ae28926d506dec77c936aa9a83ea5d9434182))
* **app:** warn before closing the window with a background job running ([9cb7846](https://github.com/ZentroIDE/Zentro/commit/9cb7846dbf47639c52544b76f59bd2d176e27882))
* **connection:** match the connection form's URI and placeholders to the driver ([ea2f7c6](https://github.com/ZentroIDE/Zentro/commit/ea2f7c6a21b83dec4cd71fbe1238d5ef2cb01b29))
* **connection:** pin the form's Test / Cancel / Save buttons below the scroll area ([6cdec3f](https://github.com/ZentroIDE/Zentro/commit/6cdec3fa03c9c52b391326f3335358e2ad4a7dcd))
* **editor:** repaint the visible editor when SQL colors change ([6562e90](https://github.com/ZentroIDE/Zentro/commit/6562e90464cdc1ddee198ae99cc2078de387db08))
* **editor:** schema-name colors now beat Monaco's token color rule ([c330a7e](https://github.com/ZentroIDE/Zentro/commit/c330a7e40168a488254f15ba440bd86200aef2d2))
* **export:** count rows itself when the frontend's total isn't ready yet ([e6461e9](https://github.com/ZentroIDE/Zentro/commit/e6461e9ffebfe80ad8cb290959423ec67f15ea35))
* **installer:** give shortcuts an explicit icon and refresh the shell icon cache ([323f3b2](https://github.com/ZentroIDE/Zentro/commit/323f3b27fabbed9b99339da9b029f44cb5ceabfb))
* **license:** grant paid plans only from a verified signed payload ([#144](https://github.com/ZentroIDE/Zentro/issues/144)) ([0d2c3c7](https://github.com/ZentroIDE/Zentro/commit/0d2c3c70ce2a7bd89f4d3bd36e8a115f60628b14)), closes [#127](https://github.com/ZentroIDE/Zentro/issues/127)
* **license:** keep the dev tier override out of release builds ([#143](https://github.com/ZentroIDE/Zentro/issues/143)) ([9984b33](https://github.com/ZentroIDE/Zentro/commit/9984b339a7722e2f9e5c5572d7123cf609a68c17)), closes [#126](https://github.com/ZentroIDE/Zentro/issues/126)
* **licenses:** make check:licenses actually catch a stale THIRD_PARTY_NOTICES.md ([5631dff](https://github.com/ZentroIDE/Zentro/commit/5631dff2627753526527e484b831b22b13e851fe))
* **open-core:** surface Pro trial state correctly across the app (ADR 0019) ([97ee9aa](https://github.com/ZentroIDE/Zentro/commit/97ee9aa3b9f057c45966f337b9bbfc0c43afcb25)), closes [#140](https://github.com/ZentroIDE/Zentro/issues/140)
* **open-core:** Zentro CE actually builds and runs ([#166](https://github.com/ZentroIDE/Zentro/issues/166)) ([92b272e](https://github.com/ZentroIDE/Zentro/commit/92b272eb8f9864f6f79b9833579fba0b8f7d53f1))
* **release:** register checksums from the public release, fail on missing digest ([e4022ea](https://github.com/ZentroIDE/Zentro/commit/e4022ea11ed23da372073f485866812269a95d57))
* **result-grid:** copy a row picked from the index column ([#118](https://github.com/ZentroIDE/Zentro/issues/118)) ([9f87905](https://github.com/ZentroIDE/Zentro/commit/9f87905a6723247ab2f294266fef6e431e292b39))
* **result-grid:** make row-drag selection survive missed mouseenter events ([3f283eb](https://github.com/ZentroIDE/Zentro/commit/3f283eba56e70da879fc4c1632f623b44c138ae5))
* **result-panel:** add missing aria-label on execution time tooltip ([07dc307](https://github.com/ZentroIDE/Zentro/commit/07dc307652f0ec1ab7e8681c5ef97e3b5719b04d))
* **sessions:** exclude Postgres's own background workers from Sessions tab ([b23d769](https://github.com/ZentroIDE/Zentro/commit/b23d76916848be6263907c53234725b95e50a290))
* **shortcuts:** let chord completions win over single-key rules that share the second key ([0632c22](https://github.com/ZentroIDE/Zentro/commit/0632c22f1b10a4f86751710190741e37b0008c1f))
* **shortcuts:** make Ctrl+Tab switch to the most recently used tab ([0a9d843](https://github.com/ZentroIDE/Zentro/commit/0a9d843d369948e2807a7b7c50539a52c471aafe))
* **shortcuts:** render keybindings per platform and fix Alt combos on macOS ([de190ff](https://github.com/ZentroIDE/Zentro/commit/de190ff7c4b9ba15c6eb089f96fbcdf45cf7be25))
* **shortcuts:** run global shortcuts while a text field is focused ([8a7466f](https://github.com/ZentroIDE/Zentro/commit/8a7466f940857834ded25f2d51dcd089a54e9802))
* **statusbar:** report private memory so WebView2 shared pages are not double counted ([37c2300](https://github.com/ZentroIDE/Zentro/commit/37c2300cf90972686c1d570c8ff465d64c9f84ca))
* **ui:** close the spotlight palette when the backdrop is clicked ([0c464b4](https://github.com/ZentroIDE/Zentro/commit/0c464b4461b1e116bb2d78cc0223b2b2d3f266f4))
* **ui:** render Select options above dialogs ([c4b54c7](https://github.com/ZentroIDE/Zentro/commit/c4b54c77edd2327c06a4c0db0cf31833553adfea))

## [0.9.0](https://github.com/ZentroIDE/Zentro/compare/v0.8.0...v0.9.0) (2026-09-23)


### Features

* **completion:** add dialect-aware built-in templates for quick data inspection ([2e6fb68](https://github.com/ZentroIDE/Zentro/commit/2e6fb685ec058ca6011610f90f7571471c1fb8a5))
* **completion:** offer All columns and alias.* expansions in the select list ([9db6331](https://github.com/ZentroIDE/Zentro/commit/9db633130304f206b341040a1418ef542b6e3586))
* **completion:** qualify column suggestions with their alias when a statement joins several tables ([c6241f5](https://github.com/ZentroIDE/Zentro/commit/c6241f5933f0d92d4ab0ee8f2587baaa020facb3))
* **completion:** suggest columns of foreign-key related tables and add the LEFT JOIN they need ([7e8325f](https://github.com/ZentroIDE/Zentro/commit/7e8325f2efcf1cc8461a473f8df970e6a4df9cf9))
* **completion:** write long generated select lists comma-first, one column per line ([465fe36](https://github.com/ZentroIDE/Zentro/commit/465fe36733dc0930d11a98b877eb475ab854ad4d))
* **editor:** add Expand * and Run command (Ctrl+Shift+Enter) ([8131f71](https://github.com/ZentroIDE/Zentro/commit/8131f71038f06a20a4f3127b25085deea42fadf3))
* **editor:** enable smooth scrolling in the query editor ([23035cd](https://github.com/ZentroIDE/Zentro/commit/23035cdae94f2bbf0abfcb71c144e144916504eb))
* **editor:** expand * and alias.* into explicit columns from the quick fix menu ([64eea1c](https://github.com/ZentroIDE/Zentro/commit/64eea1c827baf6078e69ac96763d1759e1424552))
* **editor:** flag ambiguous column references as errors before running, with qualify quick fixes ([010a9fa](https://github.com/ZentroIDE/Zentro/commit/010a9fa90443897ba308d0370fd9eb1aa40704c9))
* **editor:** show diagnostics inline at the end of the line (Error Lens style) with a Settings toggle ([408b282](https://github.com/ZentroIDE/Zentro/commit/408b282a8c9fc5f71bba02f3d793247f3068b510))
* **editor:** suggest schema columns by prefix in the unknown-column quick fix, skipping ones already selected ([22883ee](https://github.com/ZentroIDE/Zentro/commit/22883ee33da6ec74d5447750273198f8fb358004))
* **editor:** warn about unknown columns and offer did-you-mean and refresh quick fixes ([bedb76f](https://github.com/ZentroIDE/Zentro/commit/bedb76fa2cd1c15c53e7c25aa912acf5da86e409))
* **mssql:** surface PRINT/RAISERROR output as query messages ([0d08571](https://github.com/ZentroIDE/Zentro/commit/0d0857111eb2fc4df55d8efda0736d0ea470ad36))
* **onboarding:** gate first Project creation on a privacy notice ([3713e01](https://github.com/ZentroIDE/Zentro/commit/3713e014f7e766f9553d1559eb4dc84e7e81a3a6))
* **project:** add connection from the environment picker ([d140a6e](https://github.com/ZentroIDE/Zentro/commit/d140a6e3f7f9ad0176d8d3eb845c1c341be8e995))
* **query:** gather server messages into one Messages tab per run ([ed3f448](https://github.com/ZentroIDE/Zentro/commit/ed3f4485c5764f824bc4f41b379f931c7550b9f3))
* **query:** one Summary tab for multi-statement non-SELECT runs ([2abbdc3](https://github.com/ZentroIDE/Zentro/commit/2abbdc322c214af2fbd9d55a9f066c4563d85949))
* **release:** ad-hoc sign macOS build and add .pkg installer with auto-update ([c850b55](https://github.com/ZentroIDE/Zentro/commit/c850b5566e59b7cd610eca7f5b459613e3348377))
* **release:** add AppImage packaging with zsync auto-update for Linux ([2e3280e](https://github.com/ZentroIDE/Zentro/commit/2e3280e359e07d0a4637352ed93856b9ab3793f3))
* **release:** add Fedora .rpm build lane to release CI ([acd33c7](https://github.com/ZentroIDE/Zentro/commit/acd33c74839f9ff372f44d7965c840135e5a6237))
* **release:** bundle GTK3/WebKit2GTK into the AppImage so it runs on Fedora too ([385ee2a](https://github.com/ZentroIDE/Zentro/commit/385ee2a714ada03dd9a42fcb9598242df4abdbda))
* **release:** ship Linux as .deb + .rpm + AppImage, drop raw binary/tar.gz ([1f6ae3c](https://github.com/ZentroIDE/Zentro/commit/1f6ae3c26a7e3bb052a51a043fc7fd87dc673ce1))
* **result:** ease mouse-wheel scrolling in the result grid ([53e63b4](https://github.com/ZentroIDE/Zentro/commit/53e63b45584f7cd2b591eaa0f088126eaadf2e9e))
* **result:** keep a result with unsaved edits when running again ([4f211f1](https://github.com/ZentroIDE/Zentro/commit/4f211f1e872747a5b0b00e18320de879d5aeea6e))
* **result:** only warn about deleted rows that other tables really reference ([59c897f](https://github.com/ZentroIDE/Zentro/commit/59c897f278585eca42305494614d649cc1592983))
* **result:** show referenced rows inside the write confirmation ([fa7bda8](https://github.com/ZentroIDE/Zentro/commit/fa7bda8148c29a25052d70f935b8525fc2995b42))
* **result:** view the rows that reference the ones being deleted ([5d35502](https://github.com/ZentroIDE/Zentro/commit/5d355026a620be6157392292f65e018c211ed566))
* **result:** warn about referencing tables when deleting rows or dropping a table ([3ad640d](https://github.com/ZentroIDE/Zentro/commit/3ad640dd57ec80e9104c4ab127a621f0739ae403))
* **security:** make PII blur a real guard for presenting, not just a visual effect ([9f435f1](https://github.com/ZentroIDE/Zentro/commit/9f435f1bf7e3c09f718108bdc2b32be96a92c437))
* **tabs:** ease wheel scrolling in the editor and result tab bars ([c1a60c7](https://github.com/ZentroIDE/Zentro/commit/c1a60c7cf9c475c534c3721d035f45c033cbf275))
* **theme:** give Solarized Light its own primary color instead of sharing Dark's blue ([#97](https://github.com/ZentroIDE/Zentro/issues/97)) ([0bb2cb5](https://github.com/ZentroIDE/Zentro/commit/0bb2cb530d703e140fd2daf30deac226ca4939f9)), closes [#268bd2](https://github.com/ZentroIDE/Zentro/issues/268bd2) [#002b36](https://github.com/ZentroIDE/Zentro/issues/002b36)
* **theme:** ship Button component-token layer + accent rebrand ([4481aab](https://github.com/ZentroIDE/Zentro/commit/4481aab1edcfc01916e57ca24a11f704d350c5c7))
* **toolbar:** label the quick popover create button "New Project" ([b20ff9c](https://github.com/ZentroIDE/Zentro/commit/b20ff9ce6167b5cca5527c4a48574d8b8e514241))
* **toolbar:** replace connecting pulse with sweeping progress bar ([f9d0446](https://github.com/ZentroIDE/Zentro/commit/f9d044656a0251887d49229410e01828d0bca76a))


### Bug Fixes

* **about:** derive the app version from wails.json ([c221570](https://github.com/ZentroIDE/Zentro/commit/c2215705013e23345203a00698faa99c72db1d72))
* **completion:** quote column/alias identifiers per driver, replace open quote spans, keep aliases unique ([ccc1504](https://github.com/ZentroIDE/Zentro/commit/ccc1504f37957a9d350f504db12616a2ad6266ef))
* **connection:** refresh toolbar when active connection is edited ([d1dbf30](https://github.com/ZentroIDE/Zentro/commit/d1dbf30957bc32039a9c5b4614d11c4b3d819b8e))
* **data-table:** re-render cell editor on every keystroke ([25ef022](https://github.com/ZentroIDE/Zentro/commit/25ef02215d363266ab0bacb0bb90f1d308e7530c))
* **data-table:** resolve drag-select column range in visual order ([156eab8](https://github.com/ZentroIDE/Zentro/commit/156eab876281ef9b0bd545d952cb1f25ca19d4d0))
* **db:** keep Postgres dollar-quoted bodies in one statement ([29aba85](https://github.com/ZentroIDE/Zentro/commit/29aba852a39a3db468420e9222c4a173a8075195))
* **editor:** ctrl+click on an alias or table qualifier opens its table; navigation messages in English ([022b89d](https://github.com/ZentroIDE/Zentro/commit/022b89d8a4ee886954791bb433e08ce5c1ae8407))
* **editor:** inline diagnostic text no longer splits mid-word and is drawn in the destructive colour ([bb7fb54](https://github.com/ZentroIDE/Zentro/commit/bb7fb54eb0e9d1be19887d9e1cf48f1b89cb4d00))
* **editor:** make builtin SQL snippet templates insert as real Monaco snippets ([9319a78](https://github.com/ZentroIDE/Zentro/commit/9319a785f44d69348557128688d5fadfc8495c5f))
* **editor:** re-measure Monaco fonts once the webfont loads so the caret matches typed text ([617e879](https://github.com/ZentroIDE/Zentro/commit/617e879a548cf60d33737802a705e04092916be0))
* **editor:** show the inline diagnostic text, which Monaco drops on an empty range without showIfCollapsed ([6c854d2](https://github.com/ZentroIDE/Zentro/commit/6c854d2e7c5e5133a485350081796867739edc57))
* **editor:** stop query/table tabs from re-rendering on unrelated actions ([9e39f31](https://github.com/ZentroIDE/Zentro/commit/9e39f31fd17920b0e0b60b5d4a96e4f27de7ee8c))
* **explorer:** enable working reconnect button in primary explorer panel ([4d61b50](https://github.com/ZentroIDE/Zentro/commit/4d61b50a5e73ec55cd39a390a8da33a1d9513a4b))
* **mssql:** keep batch-scoped statements together during execution ([20b562d](https://github.com/ZentroIDE/Zentro/commit/20b562da2df77af40ba5869a15b85defa2b57e20))
* **mssql:** never drop PRINT output from throttled statements ([72a97e6](https://github.com/ZentroIDE/Zentro/commit/72a97e667bb4506c55ed7470ec2df7df1bcdaa80))
* **project-switch:** stop stale connection state leaking across project switches ([beeb531](https://github.com/ZentroIDE/Zentro/commit/beeb53180eef1885a8d8a0c5d2dc7381c5a13d03))
* **result-filter:** stop WHERE filter caret/selection from desyncing while typing ([1d0651b](https://github.com/ZentroIDE/Zentro/commit/1d0651ba3f20ef7d2350ab053d04a784965dcfd0))
* **result-grid:** apply column auto-fit immediately on double-click ([4efadcc](https://github.com/ZentroIDE/Zentro/commit/4efadccbafe9b969dfa4f49691908e062831be3d))
* **result:** F5/reload honour the filter and ask before dropping unsaved edits ([041f84c](https://github.com/ZentroIDE/Zentro/commit/041f84cce5cfe09f869caa1a5a70ba8714f42940))
* **schema:** stop duplicate concurrent schema fetches and cascading query failures ([144e952](https://github.com/ZentroIDE/Zentro/commit/144e952e513b5934b76644ac6d13423baa619ad0))
* **sql:** N-prefix unicode strings for SQL Server and escape backslashes for MySQL in generated literals ([9f13b9c](https://github.com/ZentroIDE/Zentro/commit/9f13b9c1c305f5481262823f72f2ced89236335d))
* stop stray console windows, fix data-grid selection UX, add F1/Kbd ([f8fd273](https://github.com/ZentroIDE/Zentro/commit/f8fd2734323247b8d196813ad427e41bed334b1a))
* **table-tab:** fetch a table's columns once instead of three times ([4b368c8](https://github.com/ZentroIDE/Zentro/commit/4b368c8b015bc71ff3d2d986f945eefb661524e3))
* **theme:** brighten Solarized row/cell selection contrast ([#92](https://github.com/ZentroIDE/Zentro/issues/92)) ([57f36c4](https://github.com/ZentroIDE/Zentro/commit/57f36c4f1333e17daf51f9f7eaaa051fae956b6b))
* **theme:** catch remaining -error Tailwind classes missed by the destructive rename ([#95](https://github.com/ZentroIDE/Zentro/issues/95)) ([58df82e](https://github.com/ZentroIDE/Zentro/commit/58df82e83fd005ccde270daf27743a1af994a8fa))
* **theme:** fix invisible/low-contrast selection states in Solarized ([5268609](https://github.com/ZentroIDE/Zentro/commit/52686090df008a3eefc59125b262743135fd4da7))
* **theme:** follow live accent in Solarized selection + fix env badge colors ([fcb0b36](https://github.com/ZentroIDE/Zentro/commit/fcb0b36da1e24027e4cd00a14cab8e7f99053eec))
* **theme:** give Solarized its own selection color instead of borrowed accent blue ([#93](https://github.com/ZentroIDE/Zentro/issues/93)) ([d676db1](https://github.com/ZentroIDE/Zentro/commit/d676db19106c00e16d868dd7e9c9099c2a18658c)), closes [#268bd2](https://github.com/ZentroIDE/Zentro/issues/268bd2) [#586e75](https://github.com/ZentroIDE/Zentro/issues/586e75) [#93a1a1](https://github.com/ZentroIDE/Zentro/issues/93a1a1)
* **theme:** reconcile token parity across all four built-in presets ([ac15caa](https://github.com/ZentroIDE/Zentro/commit/ac15caa4f7c3553acbe649aeedafa7ac77d0479d))
* **theme:** remaining Solarized selection/hover/tab-text divergences ([3bc53f7](https://github.com/ZentroIDE/Zentro/commit/3bc53f7aa655ca2650e7a104b8e10bb9d6b2ad51))
* **theme:** stop dark-2026/light-2026's --status-info var() from crashing Monaco ([#98](https://github.com/ZentroIDE/Zentro/issues/98)) ([4feda8b](https://github.com/ZentroIDE/Zentro/commit/4feda8b9fb95317a27624f0ae81b0d3775d289b4)), closes [#96](https://github.com/ZentroIDE/Zentro/issues/96) [#96](https://github.com/ZentroIDE/Zentro/issues/96)
* **theme:** tint Solarized cell selection with the live accent ([de8472d](https://github.com/ZentroIDE/Zentro/commit/de8472d5753f418f11b95ef2b3b127b010f0be66))
* **theme:** tint the selected-state accent consistently across themes ([0a03f77](https://github.com/ZentroIDE/Zentro/commit/0a03f77fc0b176bbab73d9296f15587a6967b2be))
* **ui:** force matching font size between AppMenu sub-trigger and items ([f247b89](https://github.com/ZentroIDE/Zentro/commit/f247b89701a00f53736d32c868aa7dbcda4b1962))

## [0.8.0](https://github.com/ZentroIDE/Zentro/compare/v0.7.0...v0.8.0) (2026-09-11)


### Features

* **update:** move Windows auto-update to a detached helper with its own window ([f95faae](https://github.com/ZentroIDE/Zentro/commit/f95faaee81a4d9b4088b35b2d06817a303a6d480))

## [0.7.0](https://github.com/ZentroIDE/Zentro/compare/v0.6.0...v0.7.0) (2026-09-10)


### Features

* **connections:** create connections during first-run onboarding ([887efb5](https://github.com/ZentroIDE/Zentro/commit/887efb5548b6bd3e6cdd27bc4358db0299d83b28))
* **connections:** stable ID identity + pinned-connection database fix ([a849e5c](https://github.com/ZentroIDE/Zentro/commit/a849e5ce4e00d90f55a617d4fef8178700699f0e))
* **project:** environment matrix is a pure binder; stop env hijack on save ([3b1ab04](https://github.com/ZentroIDE/Zentro/commit/3b1ab04c797783b1bcfdf5c71965a7c171fc9ea8))
* **settings:** add a Refresh button and live project names to the connection list ([8b106ef](https://github.com/ZentroIDE/Zentro/commit/8b106ef1e0965bf15f436f39fe49c4fc197db5d2))
* **settings:** Connections page — the sole connection-CRUD surface ([5fda3a2](https://github.com/ZentroIDE/Zentro/commit/5fda3a22aa1fff7a3e7d492a41ab6547788df7d1))
* **settings:** show per-database project bindings in the connection list ([2cbb487](https://github.com/ZentroIDE/Zentro/commit/2cbb487fff814579baebea983f0cb6d409285b09))


### Bug Fixes

* **toolbar:** keep the center track centered on the window ([ad03724](https://github.com/ZentroIDE/Zentro/commit/ad03724238546f097eb02e8be9aa5aa0f7fed63d))

## [0.6.0](https://github.com/ZentroIDE/Zentro/compare/v0.5.2...v0.6.0) (2026-09-09)


### ⚠ BREAKING CHANGES

* **connections:** connections no longer live in `project.json`. They move to a single global pool shared by every project; existing project manifests are migrated in place on first launch ([778cb2f](https://github.com/ZentroIDE/Zentro/commit/778cb2f)).


### Features

* **connections:** one global connection pool shared across every project, replacing per-project connection lists ([778cb2f](https://github.com/ZentroIDE/Zentro/commit/778cb2f))
* **project-wizard:** redesigned create/edit flow around `ProjectProfileDialog` + an `EnvironmentMatrix` picker — quick-switch context menu, teal default project colour, responsive profile dialog ([3e06761](https://github.com/ZentroIDE/Zentro/commit/3e06761), [bee583d](https://github.com/ZentroIDE/Zentro/commit/bee583d), [904174a](https://github.com/ZentroIDE/Zentro/commit/904174a))
* **toolbar:** quick project switcher with keyboard navigation ([d3e8381](https://github.com/ZentroIDE/Zentro/commit/d3e8381))
* **theme:** theme presets plus editor / app font settings — pick "Zentro Light/Dark" or Solarized and set the UI and editor font families ([fafb592](https://github.com/ZentroIDE/Zentro/commit/fafb592), [cf26053](https://github.com/ZentroIDE/Zentro/commit/cf26053))
* **updates:** the update check is now built-in and non-configurable (VSCode-style) — no toggle, no auto modal. A compact **Update** / **Restart to Update** button appears in the toolbar when a newer release is found, showing the current and latest versions on hover ([3df8f49](https://github.com/ZentroIDE/Zentro/commit/3df8f49))
* **editor:** VSCode-style empty query state and a synced right-sidebar resizer ([0e04ea2](https://github.com/ZentroIDE/Zentro/commit/0e04ea2))
* **editor:** extensible bottom-panel registry for Audit / Output / App Log / Stats ([996fe65](https://github.com/ZentroIDE/Zentro/commit/996fe65))
* **data-grid:** zebra striping and scroll-proof header dividers ([36d89dc](https://github.com/ZentroIDE/Zentro/commit/36d89dc))
* broad UI redesign — unified panel-shell borders and corner radii, Allotment-based sidebars, boxed settings nav, refreshed tab strip and result panel ([#84](https://github.com/ZentroIDE/Zentro/pull/84), [#85](https://github.com/ZentroIDE/Zentro/pull/85))


### Bug Fixes

* **settings:** apply the light/dark theme switch on the first click, and stop the theme picker wiping font/preset fields on save ([9ce8b74](https://github.com/ZentroIDE/Zentro/commit/9ce8b74), [1b3e911](https://github.com/ZentroIDE/Zentro/commit/1b3e911))
* **theme:** consistent panel-shell divider across all themes, a distinct active-tab surface, and Solarized presets matched to the canonical palette ([17bd4a5](https://github.com/ZentroIDE/Zentro/commit/17bd4a5), [2a960e5](https://github.com/ZentroIDE/Zentro/commit/2a960e5), [19f9dec](https://github.com/ZentroIDE/Zentro/commit/19f9dec))
* **editor:** generate provider-correct SQL literals for edited cells ([c13f2a9](https://github.com/ZentroIDE/Zentro/commit/c13f2a9))
* **editor:** only auto-open the result panel for real editor query runs ([a6879ac](https://github.com/ZentroIDE/Zentro/commit/a6879ac))
* **editor:** stop log views from re-theming every Monaco editor ([00fd6aa](https://github.com/ZentroIDE/Zentro/commit/00fd6aa))
* **query:** render `time.Time` values canonically instead of Go's doubled zone ([9ff288d](https://github.com/ZentroIDE/Zentro/commit/9ff288d))
* **context-search:** pin palette-opened table tabs to the Toolbar context; reset scroll and select the first row on every query change ([a152eba](https://github.com/ZentroIDE/Zentro/commit/a152eba), [8a1177b](https://github.com/ZentroIDE/Zentro/commit/8a1177b))
* **toolbar:** pin window controls to the top-right corner; make the quick-switch row highlight visible ([120f231](https://github.com/ZentroIDE/Zentro/commit/120f231), [f0e0bb6](https://github.com/ZentroIDE/Zentro/commit/f0e0bb6))
* **ui:** give every Dialog rounded corners ([1872bde](https://github.com/ZentroIDE/Zentro/commit/1872bde))
* **app:** debounce the no-connection notice so project switches don't flash it ([3935665](https://github.com/ZentroIDE/Zentro/commit/3935665))


### Performance

* **editor:** debounce Monaco-to-store sync so typing stops feeling delayed ([8e192f8](https://github.com/ZentroIDE/Zentro/commit/8e192f8))
* **data-grid:** keep result-grid scrolling smooth under fast scrolling ([79842cd](https://github.com/ZentroIDE/Zentro/commit/79842cd))

## [0.5.2](https://github.com/ZentroIDE/Zentro/compare/v0.5.1...v0.5.2) (2026-08-23)


### Features

* **diagnostics:** add FE-to-BE click-to-data-loaded event log ([30564e4](https://github.com/ZentroIDE/Zentro/commit/30564e412a953e6508cfb92156b192cfc2bb654e))
* **license:** add manual Refresh button in Settings > License ([382f413](https://github.com/ZentroIDE/Zentro/commit/382f413ffc462abbcc604031c0acb0bba286686c))
* **tabs:** pin Table/Catalog tabs to their own environment (ADR-0001) ([5641a76](https://github.com/ZentroIDE/Zentro/commit/5641a768adb2acc4bbe0fff6b121735ba158a46a))
* **tabs:** show Pinned Environment badge + dim Toolbar for table tabs ([5473f44](https://github.com/ZentroIDE/Zentro/commit/5473f44fe6bc0155921525dda2e8b02ccd16ceaf))
* **tabs:** show truncated env badge in Ctrl+Tab switcher ([36d4767](https://github.com/ZentroIDE/Zentro/commit/36d47679a2fbac0d2c6d2ab8999902b428ff4eb3))
* **update:** Windows auto-update + nightly channel ([#83](https://github.com/ZentroIDE/Zentro/issues/83)) ([6c6504b](https://github.com/ZentroIDE/Zentro/commit/6c6504bd799d64dfbe9597907c4ca617b21dd9a7))


### Bug Fixes

* **license:** point default license API URL at api.zentro-ide.com ([#82](https://github.com/ZentroIDE/Zentro/issues/82)) ([1086787](https://github.com/ZentroIDE/Zentro/commit/1086787e4d15027a77db744453f2131cfa338101))
* stop env switch flicker from auto-reconnect racing an in-flight switch ([f16fdb9](https://github.com/ZentroIDE/Zentro/commit/f16fdb9a98737fb61396ec88bd047ae1a4f6cba8))
* **tabs:** pin breadcrumb table switch to the tab's own connection ([7bafdd2](https://github.com/ZentroIDE/Zentro/commit/7bafdd25304a53f5ff88022634489d24fd1c914b))
* **tabs:** scroll the active tab into view in the tab strip ([2c8f038](https://github.com/ZentroIDE/Zentro/commit/2c8f038a6a1753a1ea43df3229e5aa2614d667f2))
* **tabs:** smooth out tab drag-and-drop and split-view animations ([a0653e9](https://github.com/ZentroIDE/Zentro/commit/a0653e923d73eb472f72e40064d527fa88a795f3))

## [0.5.1](https://github.com/ZentroIDE/Zentro/compare/v0.5.0...v0.5.1) (2026-08-18)


### Bug Fixes

* **project:** surface auto_schema_snapshots for schema rollback ([564ceba](https://github.com/ZentroIDE/Zentro/commit/564cebafb0b4836737f6483d51de132aedefd3a9))

## [0.5.0](https://github.com/ZentroIDE/Zentro/compare/v0.4.0...v0.5.0) (2026-08-12)


### Features

* **data-table:** add manual "Mark as Image Column" override ([3dfd1aa](https://github.com/ZentroIDE/Zentro/commit/3dfd1aa24b97fae438da91f164a2b512612e963e))
* **feedback:** add one-time in-app feedback prompt ([2f38e30](https://github.com/ZentroIDE/Zentro/commit/2f38e3070c69b90edc97c0d26dd0ee48604b57b5))
* **results:** add hover-to-preview image support for binary/URL cells ([a4b604b](https://github.com/ZentroIDE/Zentro/commit/a4b604b4e23b62711c26d9b393d2e438837508da))
* **toolbar:** show plan badge next to project, trim About/License UI ([be47125](https://github.com/ZentroIDE/Zentro/commit/be47125b34d0c50629d0e1a9e5f73e0733c92a6f))


### Bug Fixes

* **deps:** patch critical/high Go vulnerabilities flagged by Dependabot ([9b694d8](https://github.com/ZentroIDE/Zentro/commit/9b694d88da8aa384dbacdb9ff0484ac824c150b5))
* **deps:** patch frontend npm vulnerabilities, override transitive dompurify ([e26577d](https://github.com/ZentroIDE/Zentro/commit/e26577dfa49c95f8662fe73b150d2bfe99e3364f))
* **deps:** patch root npm vulnerabilities via npm audit fix ([956b39c](https://github.com/ZentroIDE/Zentro/commit/956b39caedbc50d030ab81c9bb08b11ddabfced0))
* **editor:** collect FK join suggestions from every anchor, not just the first ([7b3b715](https://github.com/ZentroIDE/Zentro/commit/7b3b7151c892d8736091281a83545d5def00df5f))
* **query:** strip leading comments before classifying SELECT statements ([beacbc6](https://github.com/ZentroIDE/Zentro/commit/beacbc6eecb9bf2f49f5d01d90672b6cb2569660))
* **safety:** gate sandbox preview eye icon behind Pro entitlement ([24929cb](https://github.com/ZentroIDE/Zentro/commit/24929cb11ca8ec66675d6b02ebb616cc419d40ca))
* **safety:** reconnect backend session before switching project environment ([0284ce1](https://github.com/ZentroIDE/Zentro/commit/0284ce13b023e604e015672d8d5fc9f85f2f5cdd))
* **shortcuts:** stop stuck dialog nodes from wedging Ctrl+Tab and other shortcuts ([aaea650](https://github.com/ZentroIDE/Zentro/commit/aaea650f7bf3c2efbf5315e886b135f0326ed167))
* **update:** point release checker at the ZentroIDE org repo ([f8b2698](https://github.com/ZentroIDE/Zentro/commit/f8b26980310a9aff84292e7351fb072f58b14493))
* **write-safety:** stop write confirmations being silently dropped ([d33f854](https://github.com/ZentroIDE/Zentro/commit/d33f854af8af9f6aefce3e351d1ec2b169e514b1))

## [0.4.0](https://github.com/ZentroIDE/Zentro/compare/v0.3.0...v0.4.0) (2026-07-27)


### Features

* **catalog:** add inline confirmation for discard changes on catalog details DDL ([6691781](https://github.com/ZentroIDE/Zentro/commit/669178119e1dbcb02454fe22153d41912f7e52bd))
* **catalog:** support catalog object details viewer with Monaco editor and diff view ([e11d819](https://github.com/ZentroIDE/Zentro/commit/e11d819bab3bb78b906b217fa1d82775acd32347))
* compact UI cleanup — spacing scale, wizard layout, editor polish ([#5](https://github.com/ZentroIDE/Zentro/issues/5)) ([36b1de4](https://github.com/ZentroIDE/Zentro/commit/36b1de4d7c32350ee35fa323a9a14e1442bc7482))
* **connection:** create a new database inline from the database tree picker ([0c832b9](https://github.com/ZentroIDE/Zentro/commit/0c832b91f766421413a8d491cc7e51bb6fd0a207))
* **db:** support database catalog object details viewer for mysql and sqlite ([b3eb0ab](https://github.com/ZentroIDE/Zentro/commit/b3eb0ab3c74511ff49155dca830bf82443b82667))
* **db:** support database catalog object details viewer for postgres ([b70c7d2](https://github.com/ZentroIDE/Zentro/commit/b70c7d2829debf684efa691c020239e1e06da0b0))
* **editor:** CodeLens run button + active statement highlight ([25397f7](https://github.com/ZentroIDE/Zentro/commit/25397f7637fab4f3ed9e1b18a1110ff5b5628646))
* **editor:** add adaptive sql completion engine ([20465b8](https://github.com/ZentroIDE/Zentro/commit/20465b80f6ec3b0bbbbeb2ece28c99ab4ea4f36f))
* **editor:** highlight executed statements ([154b955](https://github.com/ZentroIDE/Zentro/commit/154b9550ae1d85a35cd27d4b1e68054a2b39e7d7))
* **editor:** migrate command palette to Monaco F1 (+ Ctrl+Shift+P) ([#6](https://github.com/ZentroIDE/Zentro/issues/6)) ([47da991](https://github.com/ZentroIDE/Zentro/commit/47da99155433aa8b6f5c0c6e1888d4236fef93e4))
* **editor:** outline active statement text ([ea39647](https://github.com/ZentroIDE/Zentro/commit/ea3964761589adf764c16bab4d4113dacbb00500))
* **editor:** show dirty table tab indicators ([a01b478](https://github.com/ZentroIDE/Zentro/commit/a01b4781f64d87613d0e5f15efd1827d6f7438ae))
* **feedback:** add a one-click Feedback entry point to the toolbar ([3ad0d93](https://github.com/ZentroIDE/Zentro/commit/3ad0d939970efb5976c6f76d87f42ae6379f8d05))
* **frontend:** add useAsyncResource + useConfirmAction primitives, migrate TableInfo family ([#38](https://github.com/ZentroIDE/Zentro/issues/38)) ([19c238d](https://github.com/ZentroIDE/Zentro/commit/19c238daa38ac116267ca123a29f0a2405b468b9))
* **license:** lay groundwork for Team/Enterprise tiers ([b8f92da](https://github.com/ZentroIDE/Zentro/commit/b8f92daa019b01f5888259251b1c1e53118ec736))
* **license:** move safety awareness from Pro to Free tier ([769b13c](https://github.com/ZentroIDE/Zentro/commit/769b13c2ed2ab86aa58ed8b1c0776563ba681be5))
* **license:** passive Pro feature usage tracking + end-of-EA feedback prompt ([c5e8674](https://github.com/ZentroIDE/Zentro/commit/c5e8674907f71d2738a2ac9f9cf8ea1bf680895d))
* **log:** per-project isolation, Monaco editor with syntax highlighting ([#9](https://github.com/ZentroIDE/Zentro/issues/9)) ([d2c4f55](https://github.com/ZentroIDE/Zentro/commit/d2c4f5579296f1884d639dad8e241037c6c4bbc1))
* **palette:** unified spotlight palette with prefix-based search modes ([64b967f](https://github.com/ZentroIDE/Zentro/commit/64b967fe3981e19ae811916b277547e14c28f063))
* Phase 4 — maintainability hardening ([ae14fb9](https://github.com/ZentroIDE/Zentro/commit/ae14fb94a15392419c252eb44d765aa1ac5366c5))
* Phase 5 — plugin extension points and component slots ([9be4eef](https://github.com/ZentroIDE/Zentro/commit/9be4eeff75f9d9f307157edd4359c3341fe13f3f))
* Phase 6 — RBAC, auth, API gateway, and multi-tenant store pattern ([308f553](https://github.com/ZentroIDE/Zentro/commit/308f553224c821f781f31576aa556fcc94134f7e))
* Phase 6 — security and resilience layer for plugin system ([6ac52dc](https://github.com/ZentroIDE/Zentro/commit/6ac52dcf1c4e8368a43d238c53f898a88af497a2))
* **platform:** wire runtime api gateway ([6c2b676](https://github.com/ZentroIDE/Zentro/commit/6c2b676ea48904bb540386388caa2482c3b011ce))
* **plugin:** complete phase 5 runtime seams ([653ac1a](https://github.com/ZentroIDE/Zentro/commit/653ac1a3913c13f8c4861dbdf26289293c2559a0))
* preload project connections and schemas ([351d3be](https://github.com/ZentroIDE/Zentro/commit/351d3be7ca1c9a77e261b6708bdcd806e21f69f7))
* **pricing:** upgrade flow — trial badge, project cap, UpgradeDialog ([000ecbf](https://github.com/ZentroIDE/Zentro/commit/000ecbf04677b7dd77161702f3a76f26a3eaa91d))
* **project:** add "Open in new window" to project context menu ([8871c85](https://github.com/ZentroIDE/Zentro/commit/8871c852078d10a574c04c44d8f5f72da670052f))
* **project:** icon-change hint and wider padding on the project form panel ([2decad6](https://github.com/ZentroIDE/Zentro/commit/2decad64bb76b5f4cc890db3bb815ced94ae271c))
* **project:** per-project instance lock and project color identity ([13a483d](https://github.com/ZentroIDE/Zentro/commit/13a483d67b47adc7497d156e7821f929bdf1b68a))
* **project-hub:** extract entry screen pieces ([40ca724](https://github.com/ZentroIDE/Zentro/commit/40ca7247ec91dfa0baa9b9e6896f63454c18db31))
* **project-wizard:** add external tool connection importer with DBeaver support ([c5b09e8](https://github.com/ZentroIDE/Zentro/commit/c5b09e836288bc19e8e697f4695e41ea065354a7))
* **project-wizard:** add icon picker popover and remove CreateWizard ([7e5b01c](https://github.com/ZentroIDE/Zentro/commit/7e5b01cc59b365f62c526de015ffc823b7685290))
* **project-wizard:** redesign create/edit wizard with two-column panel UI ([7eada01](https://github.com/ZentroIDE/Zentro/commit/7eada01cee376c33523ef2e3f5e7d282c49bb5b7))
* **querystat:** add query execution statistics extension ([34c9a65](https://github.com/ZentroIDE/Zentro/commit/34c9a65d2df7e547ac4d44ce1391f01bea70fb3a))
* **querystat:** move QueryStatsPanel to bottom editor panel, redesign UI ([6c7c85f](https://github.com/ZentroIDE/Zentro/commit/6c7c85f7c58c289c3d469278817a9eeab4c1f937))
* **safety:** centralize environment policy ownership ([97b8f07](https://github.com/ZentroIDE/Zentro/commit/97b8f0711dcc6bddcb5ac0924797a1fa14246f17))
* **settings:** export profile via native OS save dialog ([25b3d0f](https://github.com/ZentroIDE/Zentro/commit/25b3d0fbc8184edc14d65f24a4c16bbf1e8c47f8))
* **settings:** highlight Pro-only features in Security settings ([6ca4d2a](https://github.com/ZentroIDE/Zentro/commit/6ca4d2a1870e66eea610556fdc31b89ce4c53bc8))
* **table-info:** add inline close prompt flow ([8b41427](https://github.com/ZentroIDE/Zentro/commit/8b41427ad36246e167fef6b331d47188bed7bf67))
* **table-info:** focus dirty tabs on close request ([d2ab53b](https://github.com/ZentroIDE/Zentro/commit/d2ab53bb958b652db45506b679d26982d11b5578))
* **table-info:** rework Keys panel with tab-rail layout and real DDL previews ([197bfd1](https://github.com/ZentroIDE/Zentro/commit/197bfd1d78d7178c007f6d930defad87cb85d8ce))
* **toolbar:** project color spans center zone, responsive layout at xl breakpoint ([522472f](https://github.com/ZentroIDE/Zentro/commit/522472f824de851843e15c51945ac53301b24a4b))


### Bug Fixes

* **audit:** hide internal zentro sql ([2f7735c](https://github.com/ZentroIDE/Zentro/commit/2f7735cccae4273fc577fc65f525d660ac652fd1))
* **build:** embed real app version and signing key; simplify About modal ([7c19e4a](https://github.com/ZentroIDE/Zentro/commit/7c19e4a2fdacf31730c02b3c218d66565e5a84d4))
* **context-search:** result context menu drifted on scroll, clicked through ([64ae399](https://github.com/ZentroIDE/Zentro/commit/64ae399f402335f6ba6311aac07f0ca766b5bc59))
* **data-table:** remove state bg from index cell, fix deleted/draft row overlap ([02cc888](https://github.com/ZentroIDE/Zentro/commit/02cc888a6da69a745e38511eff92ea2e0532fd3a))
* **data-table:** mark cell modified when cleared to empty ([1da69dd](https://github.com/ZentroIDE/Zentro/commit/1da69dd72c2b9fb3479e3ae7fb5d77e28fd2e300))
* **editor:** Close All Tabs blocked by table tabs with no unsaved changes ([cfebcdc](https://github.com/ZentroIDE/Zentro/commit/cfebcdc1c33fe2959086d760d1f04bef42980a2d))
* **editor:** disable Monaco EditContext input that swallowed Space ([c3c3bd5](https://github.com/ZentroIDE/Zentro/commit/c3c3bd5d7b6500043cac6b203eaa17509cd467d6))
* **editor:** preserve table completion priority ([ce15161](https://github.com/ZentroIDE/Zentro/commit/ce15161972aadda43989468aefb8838c019653e1))
* **editor:** preserve WHERE editor undo, keep focus after run, fix view-mode types ([c5f495a](https://github.com/ZentroIDE/Zentro/commit/c5f495a7b2735f27b093b0c5902dc97378f85bef))
* **editor:** refine active statement outline ([ad3fa61](https://github.com/ZentroIDE/Zentro/commit/ad3fa615112424e369db96a22ac5c2ab232af8e3))
* **editor:** refocus the editor after running a query ([fea3140](https://github.com/ZentroIDE/Zentro/commit/fea3140d140d2b2a5c8d16f1de45afc2c8125788))
* **editor:** scope schema warnings to sql statements ([71000a5](https://github.com/ZentroIDE/Zentro/commit/71000a55accd9ec93e4063851ade5f6eedd4fd2b))
* **editor:** scope WHERE filter bar suggestions to their own model, fix alias parsing ([368c37b](https://github.com/ZentroIDE/Zentro/commit/368c37b460290727ecba1769ba093f10dee54aa8))
* **editor:** stop Space from silently committing SQL suggestions ([e015b02](https://github.com/ZentroIDE/Zentro/commit/e015b021676484cc7f2cf15d862543b04a118dbb))
* **editor:** switch CodeLens trigger from hover to cursor position ([57c16fd](https://github.com/ZentroIDE/Zentro/commit/57c16fd7e181e2fc0f05b470f51a9aeff2ae59f4))
* **explorer:** context menu stayed open after Export ([e967460](https://github.com/ZentroIDE/Zentro/commit/e96746047dac5ae8b6bdf08c48fef4d1b37fddcf))
* **license:** backfill missing capabilities from tier catalog for signed payloads ([8af3539](https://github.com/ZentroIDE/Zentro/commit/8af3539b5ca1143b90de867fa3d1d2a11bf9d2c1))
* **license:** embed public key into release builds via ldflags ([734fd56](https://github.com/ZentroIDE/Zentro/commit/734fd56ea89dee2fc6c7ebaf702a67beb6a81dba))
* **license:** fix nil panic + checkout flow in ActivateProEarlyAccess ([64a5087](https://github.com/ZentroIDE/Zentro/commit/64a50874827167404a1218effe520742b8189503))
* **license:** LicenseModal showed Pro unlocked for an active Free license ([deccea6](https://github.com/ZentroIDE/Zentro/commit/deccea6209659450d3702c6868be542c4808a55c))
* **license:** separate save-email checks from restore activation ([b5d08d5](https://github.com/ZentroIDE/Zentro/commit/b5d08d5f150abf2e9a4b5f9b3c242f55e07f6da5))
* **monaco:** do not append semicolon to starter keywords ([ba7462f](https://github.com/ZentroIDE/Zentro/commit/ba7462fe99f32fb48e253bac87d607492b2ec57f))
* **project:** drop stale git_repo_path field, use storage_path only ([#23](https://github.com/ZentroIDE/Zentro/issues/23)) ([f766e08](https://github.com/ZentroIDE/Zentro/commit/f766e08efb0591904102fb4fb5f451f933b7d26f))
* **project:** focus the window that already has a project open instead of erroring ([02d8f4b](https://github.com/ZentroIDE/Zentro/commit/02d8f4bcac8dc8bed2aeaed5fa63e8518d363bcb))
* **project:** guard startup bootstrap against StrictMode double-invoke ([d3ca638](https://github.com/ZentroIDE/Zentro/commit/d3ca638ea20527bc0cdcfe044406567221ee00b0))
* **project:** persist last active environment per project across restarts ([0f4c177](https://github.com/ZentroIDE/Zentro/commit/0f4c177c085c5adf788e64bdf40fe4c52e7ba392))
* **projects:** drop phantom Local environment on create, sort by last used ([ac90b84](https://github.com/ZentroIDE/Zentro/commit/ac90b8429d5420bcb52938f946fd75bf9c6d4552))
* **query:** compute transaction row totals on the backend ([261e9f1](https://github.com/ZentroIDE/Zentro/commit/261e9f155aa73bbaaaf4f97f8970cc98fe1ad986))
* **query:** fix lost query-started event when started+done land in same frame ([5786d41](https://github.com/ZentroIDE/Zentro/commit/5786d4137d3841070ba933d668a88b8c20274434))
* **query:** flush pending QueryStarted before eager chunk flush, drop redundant lastExecutedQuery write ([14500e3](https://github.com/ZentroIDE/Zentro/commit/14500e3f735bcc54c02070261a0a75e308ac58b4))
* **query:** keep execute button on the right of transaction wrapping ([c349ea7](https://github.com/ZentroIDE/Zentro/commit/c349ea7ed5dd174093e590f7f78848d3999c1da0))
* **query:** make Cancel responsive on large multi-statement scripts ([15bef0e](https://github.com/ZentroIDE/Zentro/commit/15bef0e639e0b2ac4b9f9979c91c3d4c47d05d00))
* **querystat:** ignore internal schema-refresh queries from statistics ([daa1a57](https://github.com/ZentroIDE/Zentro/commit/daa1a577639f8b5730d69d0d1f863e153d7830b8))
* **release-notes:** F1 and Ctrl+Shift+P are different actions, not two ways to open the same palette ([2223202](https://github.com/ZentroIDE/Zentro/commit/2223202241fd3d201f088d84d7100d14e0879b60))
* restore extra field in AppDebugLogEntry for structured log display ([7882e9e](https://github.com/ZentroIDE/Zentro/commit/7882e9eddc48a6e79c81dd1e461e9fd8fd90d37b))
* **sidebar:** keep row detail values contained within sidebar width ([68d4434](https://github.com/ZentroIDE/Zentro/commit/68d4434a2b1f2e68b074f563867370dbecb5f47e))
* **table-info:** dismiss close prompt after discard ([ce704c0](https://github.com/ZentroIDE/Zentro/commit/ce704c0f9d05ab8844fa7738ace0e880482ee93c))
* **toolbar:** strengthen environment tint contrast on toolbar surfaces ([248ece0](https://github.com/ZentroIDE/Zentro/commit/248ece017942a6f4f1552997f1bfbc908f8cd9e8))
* **write-safety:** differentiate safety levels with typed strong confirmation ([65d4d00](https://github.com/ZentroIDE/Zentro/commit/65d4d00dc1827dfeae316749e6a6e0a600e51eb1))

# Changelog

All notable changes to Zentro will be documented in this file. Zentro follows a modular development path focusing on local-first database management.

---

## v0.3.0 (2026-04-26)

### Scope
* Release scope includes commits from `v0.2.0-beta` to `f653d26`.
* This release packages Beta 3 improvements into the first stable `0.3.x` line.

### SQL Editor, Search & Productivity
* Added universal script search in Context Search using `#` prefix.
* Added matched-line search results with direct jump-to-line navigation.
* Polished saved scripts UX with content previews and hover cards.
* Improved multi-result labeling and SQL workflow helpers (insert/update actions, copy helpers, definition navigation).

### Result Grid & Data Workflows
* Modularized `ResultTable` and related hooks to improve maintainability and reload resilience.
* Improved result filtering flow and order-by builder behavior.
* Added richer result context actions (copy value, copy with headers, copy as JSON, SQL copy helpers).
* Fixed dirty-cell state edge cases and stabilized result sync loops after rerun.

### Schema Explorer & Table Info
* Expanded Table Info with unified key/constraint workflows and stronger behavior consistency.
* Added full foreign key CRUD flow in table constraints management.
* Added richer object operations from explorer context menu (drop/truncate/export flows).
* Improved DDL handling paths and index operation correctness across drivers.

### Source Control & Project Safety
* Added SQL-oriented Git tracking with timeline, manual commit flow, and diff preview.
* Added close-flush/exit commit hardening in project source-control workflows.
* Hardened write-safety protections, including stronger confirmation behavior for high-risk environments.

### UI System, Architecture & Stability
* Migrated core frontend surfaces to shadcn/radix primitives and standardized control patterns.
* Introduced broader design-token and UI consistency updates across toolbar/sidebar/settings/project hub.
* Continued decomposition of large frontend modules into focused units (editor/result/table-info domains).
* Fixed multiple frontend guardrail, accessibility, lifecycle, and memory/performance issues (including Monaco lifecycle stability).

---

## v0.2.0-beta (2026-03-30)

### Scope
* Release scope includes commits from `1e7db18e28ec96d4de27342aebb4102c801bfb3d` to `1c16b10`.
* This beta is the public Early Access milestone for the current product phase.

### Project & Workspace
* Introduced project foundation and project hub flows across multiple delivery phases.
* Added project-aware workspace state, per-project session restore, and hardened startup recovery.
* Refactored connection flows to a project-centric model with compact provider-first setup.
* Added project delete flow and refined project setup/status visuals.
* Stabilized environment switching and reconnect behavior during project transitions.

### Query Engine & Result Experience
* Added guarded query runtime state flow and stronger execution lifecycle handling.
* Added deterministic compare behavior and persistent query tab context.
* Improved incremental result strategy and result virtualization path for large datasets.
* Refined result panel and table interactions: sticky index behavior, stable header DnD identity, and clearer row action/editability gating.
* Improved export reliability and switched export save flow to native dialog.

### SQL Editor Productivity
* Upgraded SQL completion with better context handling and stale request cancellation.
* Added FK-based join snippet suggestions and auto-alias table suggestions with driver-safe quoting.
* Added column data type rendering in completion hints and richer table suggestion docs.
* Added scoped formatting and SQL clause folding support.
* Added MRU tab switcher (`Ctrl/Cmd+Tab`) and context quick open (`Ctrl+E`).
* Unified execute behavior and aligned `Ctrl/Cmd+Enter` with run action semantics.

### Saved Scripts & History
* Saved scripts are now scoped by `project + connection`.
* Reopen behavior now uses `savedScriptId` and focuses existing open tabs instead of creating duplicates.
* Autosave is hardened across close flows (`x`, `Ctrl+W`) and now saves before tab removal.
* Added `Ctrl+S` for explicit save on the active query script tab.
* Improved New Query default naming to use max suffix across open query tabs plus scoped saved scripts.
* Changed delete UX to one-click confirm modal flow.
* Clicking a history item now appends SQL to the current editor instead of replacing content.

### UI & UX Refinements
* Refined toolbar alignment, connection picker behavior, and status bar simplification.
* Moved editor toolbar to a vertical layout and removed redundant new-tab action in that surface.
* Improved project hub polish, reconnect feedback, and modal transition quality.
* Refined environment picker tone/hover details and shortcuts/settings presentation.

### Architecture & Quality
* Continued frontend decomposition: split large stores/components into focused modules and tightened command/platform boundaries.
* Continued backend decomposition: modularized app/query/schema/driver services with typed v2 event flow and guardrails.
* Added and expanded tests for query/connection lifecycles, store/session logic, and script scope behavior.
* Added telemetry/export policy foundations and release-readiness hardening.

### Known Limitation
* Packaging may fail if `build/bin/zentro-dev.exe` is locked by another process, even when compile and test stages pass.

---

## v0.0.1 (2026-03-15)

### 🔌 Connection & Workspace Management
*   **Breadcrumb Navigation**: Implemented 2-level breadcrumb dropdown for quick connection and database switching ([d3a9b4a](https://github.com/alexnguyen03/zentro/commit/d3a9b4af8dcdf3679975025ae16d5d90ba40e95f))
*   **Session Restoration**: Enhanced session restoration to persist connection context and sync on app reload ([4d05893](https://github.com/alexnguyen03/zentro/commit/4d05893203cee246999f2bd1c8d7b8aeeb16bdc8), [f59bd6a](https://github.com/alexnguyen03/zentro/commit/f59bd6ad4acdeb80a48da49ac015fadd8c19c24c))
*   **Database Persistence**: Automatically persist the last selected database across application restarts ([c2df9df](https://github.com/alexnguyen03/zentro/commit/c2df9df8ffe66f31f3e8c45d1a908361c6cdfce9))
*   **Workspace Switcher**: Added a global workspace switcher and focused sidebar for multiple connection profiles ([5708687](https://github.com/alexnguyen03/zentro/commit/570868778918c199d8d3429f419cdb5e9d9aa082))
*   **Connection Options**: Added `show_all_schemas` and `trust_server_cert` configuration options ([e5a6df8](https://github.com/alexnguyen03/zentro/commit/e5a6df8be68b8d4a0ff2b85779f4b1e6ce2c27e3))
*   **Auto-Connect**: Intelligent auto-connection when selecting workspace items or opening saved scripts ([32fabc4](https://github.com/alexnguyen03/zentro/commit/32fabc49b41d5a3c3446f1e408621fa425087798))
*   **Bug Fix**: Resolved connection timeout issues and improved visual feedback during reconnection ([0cc2344](https://github.com/alexnguyen03/zentro/commit/0cc2344bd87b119a02382814acf83c2451740580), [6411c57](https://github.com/alexnguyen03/zentro/commit/6411c57ec29ed1d58e558b6cee3025f30e7854f3))

### 📝 SQL Editor & Query Engine
*   **Async Engine**: Completed the high-performance Async Query Engine supporting concurrent execution ([78e85bd](https://github.com/alexnguyen03/zentro/commit/78e85bdcfe5610a7c9f4ab90ee2974f49cea6ae7))
*   **IntelliSense**: Integrated context-aware SQL code completion and intelligent query block extraction ([2924685](https://github.com/alexnguyen03/zentro/commit/29246854a60ce172f4f93358bcbfad50f897b0d6), [9afdf01](https://github.com/alexnguyen03/zentro/commit/9afdf01fe3806742cad30404fd11c8c614f5f74f))
*   **Editor UX**: Implemented Monaco editor with VS Code-style tabs, including drag-and-drop and split-view support ([fb9b888](https://github.com/alexnguyen03/zentro/commit/fb9b888f600a6db876146a56a7fcd95fc05ce9e2), [35155db](https://github.com/alexnguyen03/zentro/commit/35155db497369341e0e144c8fb6561a0d098fac3))
*   **Template Management**: Premium template popover with inline editing and batch delete for common SQL patterns ([f754525](https://github.com/alexnguyen03/zentro/commit/f754525e57f39727cf87dd17878e6d60dd568af9))
*   **Auto-Save**: Implemented auto-saving of query tabs on close to prevent data loss ([be3285d](https://github.com/alexnguyen03/zentro/commit/be3285d26cdd0bdc75109a409b3ca9ec9559e29c))
*   **Fluid Zoom**: Supported Ctrl+Scroll wheel zooming for dynamic font size adjustments ([929ddf5](https://github.com/alexnguyen03/zentro/commit/929ddf56a037351da85650244dfd68ef11e9be21))

### 📊 Data Grid & Result Management
*   **Inline Editing**: High-performance inline editing with automatic SQL generation for updates ([b626eb0](https://github.com/alexnguyen03/zentro/commit/b626eb0547d66005055124edf48271b2affefe2f))
*   **Virtual Grid**: Implemented virtualized result grid for handling massive datasets with sorting and pagination ([e945f75](https://github.com/alexnguyen03/zentro/commit/e945f75f3abdd438d93a8f698af2d99bbf6f4650))
*   **Infinite Scroll**: Integrated true infinite scroll with backend offset pagination and loading states ([aed8eb8](https://github.com/alexnguyen03/zentro/commit/aed8eb87e53b42e3d3c15ed620814d0b30c1460a))
*   **Row Detail Sidebar**: Enhanced row detail view with JSON viewer and flexible field selection ([e93e80b](https://github.com/alexnguyen03/zentro/commit/e93e80bb384fc449ffdafc8cb00d028a984ba003), [11529da](https://github.com/alexnguyen03/zentro/commit/11529dad5de44a86bafd100a7c5eca8b7d285d61))
*   **Export**: Added CSV export with UTF-8 BOM support for Excel compatibility ([191905c](https://github.com/alexnguyen03/zentro/commit/191905cf4f468bf2258fe4c48fc99b488bf5ee4d))
*   **Optimistic UI**: Inline edits are applied optimistically to the UI for instant feedback ([efbebb4](https://github.com/alexnguyen03/zentro/commit/efbebb4454c3ae349d15b524c97c182349ab4c5e))

### 🛠️ Table Management & Schema Browser
*   **Table Designer**: Redesigned TableInfo with inline column editing, type autocomplete, and modified indicators ([938afb2](https://github.com/alexnguyen03/zentro/commit/938afb28d08fff4cf2c0575a46a99ac8a0a3feaf), [905d419](https://github.com/alexnguyen03/zentro/commit/905d419bba7a5d79c8d6394854cd6c60642c6730))
*   **Column Management**: Support for adding, deleting (with drag-selection), and reordering columns ([f297c44](https://github.com/alexnguyen03/zentro/commit/f297c4404fcfb819d9501d23605631a88937fac7), [aaab7a0](https://github.com/alexnguyen03/zentro/commit/aaab7a04841d87109c723fa376ad8f15c691769a))
*   **Rich Schema Tree**: Lazy-loading schema tree with support for Tables, Views, and cross-database browsing ([8e58eff](https://github.com/alexnguyen03/zentro/commit/8e58eff8386fff7c97961c386ca46aaab6541b80), [5dcd627](https://github.com/alexnguyen03/zentro/commit/5dcd627b208944881f09432dc35217827b0bf8de))
*   **Visual Polish**: Overhauled Table Designer style with a compact header and integrated toolbar ([1abcbc0](https://github.com/alexnguyen03/zentro/commit/1abcbc07a76bec84870b9625937143c144f60db7), [2946ced](https://github.com/alexnguyen03/zentro/commit/2946ced241f6f0874bedb947865436342a2fd508))

### 🗺️ ERD Visualization
*   **Interactive Diagrams**: Implemented ERD visualization using React Flow with automatic relationship detection ([33634be](https://github.com/alexnguyen03/zentro/commit/33634be479fcc4690c1f62ed87f5cc757c6d27b0))
*   **Crow's Foot Notation**: Redesigned ERD with Crow's Foot notation, relationship icons, and PK/FK badges ([5876c7f](https://github.com/alexnguyen03/zentro/commit/5876c7fdaee44dfc9150cfde2ab2d3abfbbf22d3), [f177765](https://github.com/alexnguyen03/zentro/commit/f17776505c10f1cc9544f9bfe31a7b8d3f2c9e7b))

### ⚙️ Settings & Platform UI
*   **Command Palette**: Added VS Code-style Command Palette for quick access to actions and navigation ([699d88f](https://github.com/alexnguyen03/zentro/commit/699d88f5edf661d58a21f13c8dd9110127eb44b3))
*   **Redesigned Settings**: Overhauled settings view into an editor tab with a vertical sidebar and Title-case aesthetic ([e3fb57b](https://github.com/alexnguyen03/zentro/commit/e3fb57b7dee4471023b73ffeccb8b602906caef4), [edb45d5](https://github.com/alexnguyen03/zentro/commit/edb45d59347526206ee9c17ab9863a07636a342e))
*   **Shortcuts Management**: Dedicated keyboard shortcuts tab with custom keybinding support ([e542480](https://github.com/alexnguyen03/zentro/commit/e542480327eabb0948cea8bea0027083a1f2d18a))
*   **Frameless Window**: Native-feel frameless window with custom toolbar and traffic light controls ([699914d](https://github.com/alexnguyen03/zentro/commit/699914df991aa4bbfb0ac7f4672513c96e88a7d4))
*   **Status Bar Redesign**: Floating provider logos and double-click functionality for rapid reconnection ([64edbb6](https://github.com/alexnguyen03/zentro/commit/64edbb6ff55d97c1ae6e4f7b0fa15715beb5ffef))

### 🚀 Core & Infrastructure
*   **Tech Stack Migration**: Successfully migrated from Fyne (Go UI) to Wails v2 + React + TypeScript stack ([c13e5f6](https://github.com/alexnguyen03/zentro/commit/c13e5f666ce12fc56d54f3893acdedf39d8510c6))
*   **Design System**: Integrated Tailwind v4 with a unified Super-Flat design system and Title-case rules ([2fd4b5d](https://github.com/alexnguyen03/zentro/commit/2fd4b5d082ec0574ea12a4c21a365d23c7154cdb))
*   **Driver Support**: Enhanced MSSQL support with TLS 1.0 compatibility and Postgres database discovery improvements ([7e1e89f](https://github.com/alexnguyen03/zentro/commit/7e1e89f583aca20515942a8f1ccdd77216077f96), [00b0fc4](https://github.com/alexnguyen03/zentro/commit/00b0fc4e6abaadfb1518cff4ce12a32bce222600))
