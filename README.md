# Project router

A [Paseo](https://paseo.sh) plugin that routes agents, and the text Paseo generates for them (titles, branches, commit messages, PR descriptions), to a provider profile chosen by project path.

With no routes and no fallback configured the plugin does nothing.

## How routing works

1. The working directory is mapped to its main repository using `git rev-parse --path-format=absolute --git-common-dir`. For a regular repository that is the parent of `.git`, so Git worktrees resolve to the repository they were created from. A submodule resolves to its own checkout (`--show-toplevel`), and a bare repository is its own root. Outside git the working directory itself is used.
2. Among the routes, the one with the **longest matching path prefix** wins (prefixes match on whole path segments; `~` is expanded). If none match, the `fallback` is used; if there is no fallback, nothing is routed.
3. A route points at a profile by `profileId`. Profiles are read from `daemon.agentProfiles` in the Paseo config (`$PASEO_HOME/config.json`, default `~/.paseo/config.json`), so profiles stay defined in one place. Only `daemon.agentProfiles` and `agents.providers` are read from that file.

## Settings screen

Open Paseo's plugin settings, open the plugin's actions menu and choose **Settings**.

The main view has **Enforcement** (a select: Off, Switch to the profile, Block) and a compact table: one row per route plus one for the fallback, with name, paths (first one and `+N`), profile, allowed providers and metadata provider/model. Rows with validation errors are marked after a failed save. **Add route** sits under the table.

Click a row for its detail view: name, project paths (one row each, with a remove button), profile, allowed providers (the selected ones with a remove button, plus an **Add provider** select), and metadata provider and model. The model field is a search box over the provider's models (matches id or label, any case; arrows, Enter and Esc work); typed text that is not in the list can be used as a custom id. A saved model missing from the catalog stays in the field marked "(not in catalog)". **Back** returns to the table, **Delete** removes the route, and **Discard** reverts that route only. Switching between rows keeps unsaved edits; **Save** validates and writes the whole set, and nothing is written until validation passes.

Selects offer the providers from the daemon's list (built-in ones included) and any configured in `agents.providers`, except those disabled with `enabled: false`. A saved value that is no longer on the list stays selectable and is labelled "not configured".

The screen reads its choices through the `routing.list-choices` RPC, which only uses `daemon.agentProfiles` and `agents.providers` from the Paseo config plus the provider snapshot.

## Settings

Stored by Paseo under the plugin id `routing`.

| Field | Meaning |
| --- | --- |
| `routes[].name` | Label used in logs |
| `routes[].paths` | Project path prefixes |
| `routes[].profileId` | Profile that agents in this project should use |
| `routes[].allowedProviders` | Providers allowed for agents here; empty means only the profile's provider |
| `routes[].metadataProvider` / `metadataModel` | Provider and model that generate metadata for this project |
| `fallback` | Same fields as a route, without `paths` |
| `enforcement` | `"off"` (default), `"provider"` (switch) or `"block"` |

## Enforcement

With `enforcement: "provider"`, every new agent is checked before it is created. If the requested provider is not in the route's `allowedProviders`, its provider, model, mode, thinking option and feature values are replaced with those of the route's profile. Allowed providers are left untouched. Each replacement is logged (route name and provider ids only, never prompts).

With `enforcement: "block"` the same check refuses the new agent instead: creation fails with "Provider X is not allowed in this project (route R). Use profile P."

If a route cannot be verified because its profile is missing or `config.json` cannot be read, `block` refuses the agent with the reason and `provider` logs a warning and lets the agent through. The plugin's own `metadata-router` provider is never enforced.

## Metadata generation

Paseo runs metadata generation as internal agents, which skip the creation hook. The plugin therefore registers its own provider, `metadata-router` (model `auto`). Select it in Paseo's metadata generation settings; it then runs the `metadataProvider`/`metadataModel` of the matching route (or the fallback), and fails if neither exists.

Supported provider types, taken from `agents.providers`:

- `claude`, and providers with `extends: "claude"`: runs `claude -p --model <model>` with the provider's `env` (for example a separate config directory).
- `opencode`: runs the provider's configured `command` (default `opencode`) with `run -m <model>`.

A configured `command` may have several elements (for example `["docker", "run", "-i", "img", "claude"]`); the extra elements are kept and the flags above are appended.

Other providers are not supported for metadata. The prompt is passed on stdin and the final text is returned. When Paseo asks for structured output, the schema is added to the prompt and the plugin extracts the JSON from the reply (code fences and surrounding prose are stripped) before Paseo validates it against the schema.

## Seeing what the router did

When a route applies to a new agent (enforcement on, route or fallback matched), the plugin records the route, the profile and the effective provider, never prompts. It then shows:

- a composer pill, e.g. `Route: acme · Provider A`, or `Switched → Provider A` after a switch, with a popover listing route, profile, provider and the original provider;
- a one-line timeline note, `Project router: …`, at the start of the agent.

Agents with no matching route, or created with enforcement off, show neither. The route is matched to its agent with a one-off token the plugin adds to the creation request's environment and removes again when the session opens, so concurrent creations in the same directory cannot mix up. The records live in memory, so agents created before the plugin was last reloaded have no pill. The new-agent screen (model picker, Send button) is not reachable from plugins, so the choice there is not changed; the pill appears once the agent exists.

## Limitations

- Internal agents skip the creation hook, so enforcement does not apply to them.
- Terminal profiles are outside Paseo's agents and are not routed.
- Metadata adapters run the provider CLIs directly; they do not use a Paseo session, so provider-side features such as MCP servers are not available there.

## Development

```
npm install
npm test
npm run typecheck
```
